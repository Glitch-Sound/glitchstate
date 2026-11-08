import { expect, test } from "vitest";
import type { GlsModel } from "../../src/core";

const states = [
  { id: "Z_IDLE", name: "待機", color: "#4F46E5", meaning: "待つ" },
  { id: "A_RUN", name: "実行中", color: "#22C55E", meaning: "走る" },
];
const transition = {
  fromStateId: "Z_IDLE",
  eventId: "START",
  action: "記録",
  targetStateId: "A_RUN",
};
const model: GlsModel = {
  states,
  events: [
    { id: "START", name: "開始" },
    { id: "RETRY", name: "再試行" },
  ],
  transitions: [transition],
};
const build = async (value: GlsModel) =>
  (
    await import("../../src/webview/pages/preview/model/build-state-diagram")
  ).buildStateDiagram(value);

test("REQ-014-S01 名前と指定カラーをIDと対応付け定義順を保つ", async () => {
  const result = await build(model);
  expect(result.nodes.map(({ id, data }) => ({ id, data }))).toEqual([
    { id: "Z_IDLE", data: { name: "待機", color: "#4F46E5" } },
    { id: "A_RUN", data: { name: "実行中", color: "#22C55E" } },
  ]);
});
test("REQ-014-S02 同じ名前でも状態IDを統合しない", async () => {
  const result = await build({
    ...model,
    states: states.map((s) => ({ ...s, name: "待機" })),
  });
  expect(result.nodes.map((n) => n.id)).toEqual(["Z_IDLE", "A_RUN"]);
  expect(result.edges.map((e) => [e.source, e.target])).toEqual([
    ["Z_IDLE", "A_RUN"],
  ]);
});
test("REQ-014-S03 孤立状態とイベントのない状態を保つ", async () => {
  for (const events of [[], model.events]) {
    const result = await build({ states, events, transitions: [] });
    expect(result.nodes.map((n) => n.id)).toEqual(["Z_IDLE", "A_RUN"]);
    expect(result.edges).toEqual([]);
  }
});
test("REQ-015-S01 処理やイベントをラベルへ変換せず方向を保つ", async () => {
  const original = structuredClone(model);
  const result = await build(model);
  expect(
    result.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
    })),
  ).toEqual([{ source: "Z_IDLE", target: "A_RUN", label: undefined }]);
  expect(model).toEqual(original);
});
for (const [action, target, count] of [
  [null, "A_RUN", 1],
  ["記録", null, 0],
  [null, null, 0],
] as const) {
  test(`REQ-015-S02 処理${action}と遷移先${target}を区別する`, async () => {
    const result = await build({
      ...model,
      transitions: [{ ...transition, action, targetStateId: target }],
    });
    expect(result.edges).toHaveLength(count);
    if (count)
      expect(result.edges.map((e) => [e.source, e.target])).toEqual([
        ["Z_IDLE", "A_RUN"],
      ]);
  });
}
test("REQ-015-S03 同じ有向ペアをイベントによらず1本にする", async () => {
  const result = await build({
    ...model,
    transitions: [
      transition,
      { ...transition, eventId: "RETRY", action: "別処理" },
    ],
  });
  expect(result.edges.map((e) => [e.source, e.target])).toEqual([
    ["Z_IDLE", "A_RUN"],
  ]);
});
test("REQ-015-S04 自己遷移を消さず重複はまとめる", async () => {
  const result = await build({
    ...model,
    transitions: [
      { ...transition, targetStateId: "Z_IDLE" },
      { ...transition, targetStateId: "Z_IDLE", eventId: "RETRY" },
    ],
  });
  expect(result.edges.map((e) => [e.source, e.target])).toEqual([
    ["Z_IDLE", "Z_IDLE"],
  ]);
});
test("REQ-015-S05 逆方向を別の矢印として保つ", async () => {
  const result = await build({
    ...model,
    transitions: [
      transition,
      { ...transition, fromStateId: "A_RUN", targetStateId: "Z_IDLE" },
    ],
  });
  expect(result.edges.map((e) => [e.source, e.target])).toEqual([
    ["Z_IDLE", "A_RUN"],
    ["A_RUN", "Z_IDLE"],
  ]);
  expect(new Set(result.edges.map((e) => e.id)).size).toBe(2);
});

test("REQ-014-S01 定義順に折り返し実測の最大高さから次の行を配置する", async () => {
  const { layoutStateNodes } = await import(
    "../../src/webview/pages/preview/model/layout-state-nodes"
  );
  const { DIAGRAM_CONFIG: c } = await import(
    "../../src/webview/pages/preview/model/diagram-config"
  );
  const many = (
    await build({
      ...model,
      states: Array.from({ length: c.columns + 1 }, (_, i) => ({
        ...states[0],
        id: `S${i}`,
      })),
    })
  ).nodes;
  const tallHeight = c.nodeMinHeight * 3;
  const measured = new Map([["S1", tallHeight]]);
  const result = layoutStateNodes(many, measured);
  expect(result[0].position).toEqual({ x: c.margin, y: c.margin });
  expect(result[1].position).toEqual({
    x: c.margin + c.nodeWidth + c.columnGap,
    y: c.margin,
  });
  expect(result[c.columns].position).toEqual({
    x: c.margin,
    y: c.margin + tallHeight + c.rowGap,
  });
  expect(layoutStateNodes(many, measured)).toEqual(result);
  expect(many.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(
    true,
  );
});

test("REQ-017-S05 古い図の準備完了はURIとsequenceで拒否する", async () => {
  const { completePreviewRender } = await import(
    "../../src/webview/app/render-completion"
  );
  const old = {
    type: "glitchstate.update" as const,
    uri: "file:///a.gls",
    version: 9,
    sequence: 1,
    model,
    hasErrors: false,
  };
  const current = { ...old, version: 1, sequence: 2 };
  const sent: unknown[] = [];
  completePreviewRender(old, current, (value) => sent.push(value));
  completePreviewRender(
    { ...current, uri: "file:///b.gls" },
    current,
    (value) => sent.push(value),
  );
  expect(sent).toEqual([]);
  completePreviewRender(current, current, (value) => sent.push(value));
  expect(sent).toEqual([
    {
      type: "glitchstate.rendered",
      uri: "file:///a.gls",
      version: 1,
      sequence: 2,
    },
  ]);
});
