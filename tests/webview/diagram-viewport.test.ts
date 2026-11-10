import { expect, test } from "vitest";
import { DIAGRAM_CONFIG as c } from "../../src/webview/pages/preview/model/diagram-config";
import {
  createDiagramViewportStore,
  zoomAroundCenter,
} from "../../src/webview/pages/preview/model/diagram-viewport";

const uri = "file:///a.gls";
const view = { x: 100, y: -50, zoom: 0.5 };

test("REQ-038-S02 REQ-039-S01 中心の図座標を保って拡大縮小とResetを行う", () => {
  // 画面中心(400,300)に対応する図座標は(600,700)。
  expect(zoomAroundCenter(view, 800, 600, 1)).toEqual({
    x: -200,
    y: -400,
    zoom: 1,
  });
  expect(
    zoomAroundCenter({ x: -200, y: -400, zoom: 1 }, 800, 600, 0.5),
  ).toEqual(view);
});
test("REQ-039-S02 すでに等倍なら現在の位置を保つ", () => {
  const current = { x: -123, y: 76, zoom: 1 };
  expect(zoomAroundCenter(current, 800, 600, 1)).toEqual(current);
});
test("REQ-038-S03 設定した倍率の上下限で止める", () => {
  expect(zoomAroundCenter(view, 800, 600, c.maxZoom + c.zoomStep).zoom).toBe(
    c.maxZoom,
  );
  expect(zoomAroundCenter(view, 800, 600, c.minZoom - c.zoomStep).zoom).toBe(
    c.minZoom,
  );
});
test("REQ-040-S01 REQ-040-S02 REQ-040-S03 REQ-040-S04 REQ-040-S06 同じURIの受理通知で最後の範囲を保つ", () => {
  const store = createDiagramViewportStore();
  const first = store.getState().accept(uri);
  expect(store.getState().viewport).toBeNull();
  store.getState().record(uri, first, view);
  for (const _context of [
    "編集",
    "エラー",
    "空",
    "再追加",
    "小さい版番号",
    "コマンド",
  ]) {
    const generation = store.getState().accept(uri);
    expect(generation).toBeGreaterThan(first);
    expect(store.getState().viewport).toEqual(view);
  }
});
test("REQ-040-S05 別URIと復帰で履歴を復元しない", () => {
  const store = createDiagramViewportStore();
  store.getState().record(uri, store.getState().accept(uri), view);
  store.getState().accept("file:///b.gls");
  expect(store.getState().viewport).toBeNull();
  store.getState().accept(uri);
  expect(store.getState().viewport).toBeNull();
});
test("REQ-040-S07 古い世代と別URIのコールバックで現在の範囲を戻さない", () => {
  const store = createDiagramViewportStore();
  const old = store.getState().accept(uri);
  const current = store.getState().accept(uri);
  store.getState().record(uri, current, view);
  store.getState().record(uri, old, { x: 0, y: 0, zoom: 1 });
  store.getState().record("file:///b.gls", current, { x: 0, y: 0, zoom: 1 });
  expect(store.getState().viewport).toEqual(view);
});
test("REQ-040-S08 ストアを作り直したら範囲は未確定になる", () => {
  const store = createDiagramViewportStore();
  store.getState().record(uri, store.getState().accept(uri), view);
  expect(createDiagramViewportStore().getState().viewport).toBeNull();
});

test("REQ-040-S10 表示範囲と領域サイズを同じ世代で記録し、文書切替で破棄する", () => {
  const store = createDiagramViewportStore();
  const generation = store.getState().accept(uri);
  store.getState().record(uri, generation, view, { width: 800, height: 600 });
  store.getState().accept(uri);
  expect(store.getState().size).toEqual({ width: 800, height: 600 });
  store.getState().accept("file:///b.gls");
  expect(store.getState().size).toBeNull();
});
