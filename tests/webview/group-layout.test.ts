import { expect, test } from "vitest";
import type { DiagramNode } from "../../src/webview/pages/preview/model/build-state-diagram";
import { connectDiagramEdges } from "../../src/webview/pages/preview/model/connect-diagram-edges";
import { DIAGRAM_CONFIG as c } from "../../src/webview/pages/preview/model/diagram-config";
import {
  getAbsoluteNodeRects,
  layoutStateGroups,
} from "../../src/webview/pages/preview/model/layout-state-groups";

const state = (id: string, parentId?: string): DiagramNode => ({
  id,
  type: "state",
  position: { x: 0, y: 0 },
  data: { name: id, color: "#4F46E5" },
  ...(parentId ? { parentId, extent: "parent" as const } : {}),
});
const group = (id: string, ids: string[]): DiagramNode => ({
  id,
  type: "stateGroup",
  position: { x: 0, y: 0 },
  data: { name: id, stateIds: ids },
});
test("REQ-030-S01 REQ-030-S03 非連続の所属と長い名前、高い状態とループの空間を確保する", () => {
  const ids = Array.from({ length: c.columns + 1 }, (_, i) => `S${i}`);
  const input = [
    group("G", [...ids].reverse()),
    group("H", ["T", "V"]),
    state(ids[0], "G"),
    state("U"),
    ...ids.slice(1).map((id) => state(id, "G")),
    state("T", "H"),
    state("V", "H"),
  ];
  const before = structuredClone(input);
  const labelHeight = c.groupLabelMinHeight * 5;
  const tall = c.nodeMinHeight * 3;
  const result = layoutStateGroups(
    input,
    new Map([[ids[1], tall]]),
    new Map([["G", labelHeight]]),
  );
  const boxes = getAbsoluteNodeRects(result);
  const g = boxes.get("G");
  const u = boxes.get("U");
  const h = boxes.get("H");
  expect(g).toEqual({
    x: c.margin,
    y: c.margin,
    width:
      c.groupPadding * 2 +
      c.columns * c.nodeWidth +
      (c.columns - 1) * c.columnGap,
    height:
      c.groupPadding * 2 +
      labelHeight +
      c.groupLabelGap +
      c.loopExtent * 4 +
      tall +
      c.rowGap +
      c.nodeMinHeight,
  });
  if (!g || !u || !h) throw new Error("領域がない");
  expect(u.y).toBeGreaterThan(g.y + g.height);
  expect(h.y).toBeGreaterThan(u.y + u.height);
  const first = boxes.get(ids[0]);
  const last = boxes.get(ids[c.columns]);
  expect(first).toEqual({
    x: g.x + c.groupPadding,
    y: g.y + c.groupPadding + labelHeight + c.groupLabelGap + c.loopExtent * 2,
    width: c.nodeWidth,
    height: c.nodeMinHeight,
  });
  expect(last?.y).toBe((first?.y ?? 0) + tall + c.rowGap + c.loopExtent * 2);
  for (const id of ids) {
    const box = boxes.get(id);
    if (!box) throw new Error("所属状態がない");
    expect(box.x).toBeGreaterThan(g.x);
    expect(box.x + box.width).toBeLessThan(g.x + g.width);
    expect(box.y - c.loopExtent * 2).toBeGreaterThanOrEqual(
      g.y + c.groupPadding + labelHeight + c.groupLabelGap,
    );
    expect(box.y + box.height).toBeLessThan(g.y + g.height);
  }
  expect(input).toEqual(before);
});
test("REQ-030-S04 グループなしは既存の定義順と折り返し配置を維持する", () => {
  const nodes = Array.from({ length: c.columns + 1 }, (_, i) => state(`S${i}`));
  const result = layoutStateGroups(nodes);
  expect(result[0].position).toEqual({ x: c.margin, y: c.margin });
  expect(result[1].position).toEqual({
    x: c.margin + c.nodeWidth + c.columnGap,
    y: c.margin,
  });
  expect(result[c.columns].position).toEqual({
    x: c.margin,
    y: c.margin + c.nodeMinHeight + c.rowGap,
  });
});
test("REQ-031-S01 REQ-031-S06 親の絶対位置を含む矩形で接続面を選ぶ", () => {
  const nodes: DiagramNode[] = [
    {
      ...group("G", ["A", "B"]),
      position: { x: 500, y: 600 },
      width: 400,
      height: 300,
    },
    { ...state("A", "G"), position: { x: 30, y: 130 }, width: 160, height: 64 },
    {
      ...state("B", "G"),
      position: { x: 220, y: 130 },
      width: 160,
      height: 64,
    },
    { ...state("X"), position: { x: 100, y: 730 }, width: 160, height: 64 },
  ];
  expect(getAbsoluteNodeRects(nodes).get("A")).toEqual({
    x: 530,
    y: 730,
    width: 160,
    height: 64,
  });
  const edges = connectDiagramEdges(
    nodes,
    [
      { id: "G:X", source: "G", target: "X" },
      { id: "X:A", source: "X", target: "A" },
      { id: "A:A", source: "A", target: "A" },
    ],
    "marker",
  );
  expect(
    edges.map((e) => [e.sourceHandle, e.targetHandle, e.markerEnd]),
  ).toEqual([
    ["left-out", "right-in", "marker"],
    ["right-out", "left-in", "marker"],
    ["loop-out", "loop-in", "marker"],
  ]);
});
