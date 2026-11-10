import { expect, test } from "vitest";
import { DIAGRAM_EXPORT_CONFIG as c } from "../../src/webview/pages/preview/model/diagram-export-config";
import { getPngSize } from "../../src/webview/pages/preview/ui/rasterize-state-diagram";

test("REQ-042-S05 小さい図のPNGを目標倍率で生成する", () =>
  expect(getPngSize(100, 80)).toEqual({
    width: 100 * c.scale,
    height: 80 * c.scale,
  }));
test("REQ-042-S05 最大辺と最大画素数の制約を個別に守る", () => {
  expect(getPngSize(c.maxSide * 2, 20)).toEqual({
    width: c.maxSide,
    height: 10,
  });
  const side = Math.sqrt(c.maxPixels);
  expect(getPngSize(side * 2, side * 2)).toEqual({
    width: Math.floor(side),
    height: Math.floor(side),
  });
});
test("REQ-043-S04 不正な寸法でPNGを作らない", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => getPngSize(value, 10)).toThrow();
});
