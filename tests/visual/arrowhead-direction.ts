import { expect, type Locator } from "@playwright/test";

/**
 * 実際の矢尻の輪郭と変換から、経路終端の進行方向との一致を確認する。
 * @param path 描画済みの矢印の経路。
 */
export async function assertArrowheadFollowsPath(path: Locator) {
  const direction = await path.evaluate((element) => {
    const curve = element as SVGPathElement;
    const length = curve.getTotalLength();
    const end = curve.getPointAtLength(length);
    // 終端の接線を十分短い区間で近似し、曲線の途中の向きと混同しない。
    const before = curve.getPointAtLength(length - Math.min(1, length / 1000));
    const tangent = { x: end.x - before.x, y: end.y - before.y };
    const screen = curve.getScreenCTM();
    if (!screen) throw new Error("経路の画面座標がない");
    const reference = getComputedStyle(curve).markerEnd;
    const id = reference.match(/#([^)"']+)/)?.[1];
    const marker = id ? document.getElementById(id) : null;
    if (!(marker instanceof SVGMarkerElement))
      throw new Error("矢尻のマーカーがない");
    const shape = marker.querySelector("path");
    if (!shape) throw new Error("矢尻の形状がない");
    // 実際の輪郭から三角形の頂点を読み取り、先端の座標を決め打ちしない。
    const number = "[+-]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][+-]?\\d+)?";
    const vertex = `([ML])\\s*(${number})[\\s,]+(${number})`;
    const outline = shape.getAttribute("d") ?? "";
    const triangle = new RegExp(
      `^\\s*${vertex}\\s*${vertex}\\s*${vertex}\\s*[Zz]\\s*$`,
    );
    const coordinates = outline.match(triangle);
    if (!coordinates) throw new Error("矢尻が3頂点の輪郭ではない");
    const vertices = [1, 4, 7].map((index) => ({
      x: Number(coordinates[index + 1]),
      y: Number(coordinates[index + 2]),
    }));
    const squaredDistance = (a: DOMPointInit, b: DOMPointInit) =>
      ((a.x ?? 0) - (b.x ?? 0)) ** 2 + ((a.y ?? 0) - (b.y ?? 0)) ** 2;
    const candidates = vertices.filter((point, index) => {
      const left = squaredDistance(point, vertices[(index + 1) % 3]);
      const right = squaredDistance(point, vertices[(index + 2) % 3]);
      const base = squaredDistance(
        vertices[(index + 1) % 3],
        vertices[(index + 2) % 3],
      );
      return Math.abs(left - right) < 1e-6 && Math.abs(left - base) > 1e-6;
    });
    if (candidates.length !== 1)
      throw new Error("矢尻の先端を一意に識別できない");
    const tip = candidates[0];
    const base = vertices.filter((point) => point !== tip);
    const tail = {
      x: (base[0].x + base[1].x) / 2,
      y: (base[0].y + base[1].y) / 2,
    };
    let tipPoint = new DOMPoint(tip.x, tip.y);
    let tailPoint = new DOMPoint(tail.x, tail.y);
    // 輪郭やグループに指定された変換も、ブラウザが使う計算済み値で反映する。
    for (
      let node: Element | null = shape;
      node && node !== marker;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const transform =
        style.transform === "none"
          ? new DOMMatrix()
          : new DOMMatrix(style.transform);
      const [originX, originY] = style.transformOrigin
        .split(" ")
        .map(Number.parseFloat);
      const matrix = new DOMMatrix()
        .translate(originX, originY)
        .multiply(transform)
        .translate(-originX, -originY);
      tipPoint = tipPoint.matrixTransform(matrix);
      tailPoint = tailPoint.matrixTransform(matrix);
    }
    const viewBox = marker.viewBox.baseVal;
    let scaleX = marker.markerWidth.baseVal.value / viewBox.width;
    let scaleY = marker.markerHeight.baseVal.value / viewBox.height;
    const aspect = marker.preserveAspectRatio.baseVal;
    if (aspect.align !== SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE) {
      const scale =
        aspect.meetOrSlice === SVGPreserveAspectRatio.SVG_MEETORSLICE_SLICE
          ? Math.max(scaleX, scaleY)
          : Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
    }
    const orient = marker.getAttribute("orient")?.trim();
    const angle =
      orient === "auto" || orient === "auto-start-reverse"
        ? Math.atan2(tangent.y, tangent.x)
        : (marker.orientAngle.baseVal.value * Math.PI) / 180;
    const local = {
      x: (tipPoint.x - tailPoint.x) * scaleX,
      y: (tipPoint.y - tailPoint.y) * scaleY,
    };
    const rotated = {
      x: local.x * Math.cos(angle) - local.y * Math.sin(angle),
      y: local.x * Math.sin(angle) + local.y * Math.cos(angle),
    };
    const toScreenVector = (vector: { x: number; y: number }) => ({
      x: screen.a * vector.x + screen.c * vector.y,
      y: screen.b * vector.x + screen.d * vector.y,
    });
    const travel = toScreenVector(tangent);
    const arrowhead = toScreenVector(rotated);
    const travelLength = Math.hypot(travel.x, travel.y);
    const arrowheadLength = Math.hypot(arrowhead.x, arrowhead.y);
    return {
      travel,
      arrowhead,
      travelLength,
      arrowheadLength,
      alignment:
        (travel.x * arrowhead.x + travel.y * arrowhead.y) /
        (travelLength * arrowheadLength),
      orient,
    };
  });
  expect(direction.travelLength).toBeGreaterThan(0);
  expect(direction.arrowheadLength).toBeGreaterThan(0);
  // 曲線終端の数値近似の誤差を1度以内に収め、逆向きや固定角度を許容しない。
  expect(direction.alignment, JSON.stringify(direction)).toBeGreaterThan(
    Math.cos(Math.PI / 180),
  );
}
