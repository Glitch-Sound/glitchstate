/** 表示済みの図から画像用の矩形、文字と矢印を取得する。 */
import type {
  DiagramImage,
  ImageLine,
  ImageRect,
} from "../model/serialize-state-diagram";

const round = (value: number) => Math.round(value * 100) / 100;
function color(value: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("配色を取得できない");
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return a === 255
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

/** 現在のDOMを変更せず、図座標へ正規化した保存用の要素を取得する。
 * @param canvas 準備が完了した現在の図のキャンバス。
 * @returns 通常の背景と現在のテーマを持つ画像の要素。
 * @throws 図、配色、文字または接続点を取得できない場合。
 */
export function captureStateDiagram(canvas: HTMLElement): DiagramImage {
  const viewport = canvas.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("図が表示されていない");
  const transform = new DOMMatrix(getComputedStyle(viewport).transform);
  const view = viewport.getBoundingClientRect();
  const zoom = transform.a;
  if (!Number.isFinite(zoom) || zoom <= 0)
    throw new Error("図の倍率が不正です");
  const rect = (box: DOMRect): ImageRect => ({
    x: round((box.x - view.x) / zoom),
    y: round((box.y - view.y) / zoom),
    width: round(box.width / zoom),
    height: round(box.height / zoom),
  });
  const textLines = (element: HTMLElement): ImageLine[] => {
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("文字を計測できない");
    context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    const ascent = context.measureText("M").fontBoundingBoxAscent;
    const lines: { top: number; line: ImageLine }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let current: Node | null = walker.nextNode();
    while (current) {
      const value = current.textContent ?? "";
      let offset = 0;
      for (const char of value) {
        const range = document.createRange();
        range.setStart(current, offset);
        offset += char.length;
        range.setEnd(current, offset);
        const box = rect(range.getBoundingClientRect());
        if (char === "\n" || !box.width || !box.height) continue;
        const previous = lines.at(-1);
        if (previous && Math.abs(previous.top - box.y) < 0.5)
          previous.line.text += char;
        else
          lines.push({
            top: box.y,
            line: {
              text: char,
              x: box.x,
              y: round(box.y + ascent),
              fill: color(style.color),
              fontFamily: style.fontFamily,
              fontSize,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
            },
          });
      }
      current = walker.nextNode();
    }
    return lines.map((item) => item.line);
  };
  const nodes = Array.from(
    canvas.querySelectorAll<HTMLElement>(".react-flow__node"),
    (wrapper) => {
      const group = wrapper.classList.contains("react-flow__node-stateGroup");
      const content = wrapper.querySelector<HTMLElement>(
        group ? ".state-group" : ".state-node",
      );
      const label = wrapper.querySelector<HTMLElement>(
        group ? ".state-group-label" : ".state-node-label",
      );
      if (!content || !label) throw new Error("状態名を取得できない");
      const style = getComputedStyle(content);
      return {
        id: wrapper.dataset.id ?? "",
        group,
        rect: rect(content.getBoundingClientRect()),
        fill: group
          ? "none"
          : color(style.getPropertyValue("--state-node-background")),
        stroke: group ? color(style.borderTopColor) : "none",
        strokeWidth: group ? Number.parseFloat(style.borderTopWidth) : 0,
        lines: textLines(label),
      };
    },
  );
  const edges = Array.from(
    canvas.querySelectorAll<SVGPathElement>(".state-edge-path"),
    (path) => {
      const style = getComputedStyle(path);
      const markerId = style.markerEnd.match(/#([^)"']+)/)?.[1];
      const marker = markerId ? document.getElementById(markerId) : null;
      const shape = marker?.querySelector("path");
      if (!(marker instanceof SVGMarkerElement) || !shape)
        throw new Error("矢尻を取得できない");
      const strokeWidth = Number.parseFloat(style.strokeWidth);
      const padding =
        Math.hypot(
          marker.markerWidth.baseVal.value,
          marker.markerHeight.baseVal.value,
        ) * strokeWidth;
      const box = rect(path.getBoundingClientRect());
      return {
        id: path.closest(".react-flow__edge")?.getAttribute("data-id") ?? "",
        d: path.getAttribute("d") ?? "",
        transform: "matrix(1 0 0 1 0 0)",
        stroke: color(style.stroke),
        strokeWidth,
        bounds: {
          x: round(box.x - padding),
          y: round(box.y - padding),
          width: round(box.width + padding * 2),
          height: round(box.height + padding * 2),
        },
        marker: {
          d: shape.getAttribute("d") ?? "",
          fill: color(getComputedStyle(shape).fill),
          orient: marker.getAttribute("orient") ?? "auto",
          viewBox: marker.getAttribute("viewBox") ?? "0 0 10 10",
          refX: marker.getAttribute("refX") ?? "10",
          refY: marker.getAttribute("refY") ?? "5",
          markerWidth: marker.getAttribute("markerWidth") ?? "7",
          markerHeight: marker.getAttribute("markerHeight") ?? "7",
        },
      };
    },
  );
  return {
    background: color(getComputedStyle(canvas).backgroundColor),
    nodes,
    edges,
  };
}
