import { expect, test } from "vitest";
import type { GlsModel, TransitionDefinition } from "../../src/core";
import { buildStateDiagram } from "../../src/webview/pages/preview/model/build-state-diagram";

const states = ["A", "B", "C", "X", "Y", "U", "D", "E"].map((id) => ({
  id,
  name: `状態${id}`,
  color: "#4F46E5",
  meaning: `意味${id}`,
}));
const model: GlsModel = {
  states,
  events: [
    { id: "START", name: "開始" },
    { id: "RETRY", name: "再試行" },
  ],
  transitions: [],
  stateGroups: [{ id: "G", name: "稼働系", stateIds: ["C", "B", "A"] }],
};
const plain = (
  fromStateId: string,
  targetStateId: string | null,
  eventId = "START",
): TransitionDefinition => ({
  fromStateId,
  targetStateId,
  eventId,
  action: null,
});
const pairs = (next: GlsModel) =>
  buildStateDiagram(next).edges.map((e) => [e.source, e.target]);

test("REQ-033-S06 古いグループの完了を現在の通知へ混入させない", async () => {
  const { completePreviewRender } = await import(
    "../../src/webview/app/render-completion"
  );
  const old = {
    type: "glitchstate.update" as const,
    uri: "file:///groups.gls",
    sequence: 1,
    version: 9,
    model,
    hasErrors: false,
  };
  const current = {
    ...old,
    sequence: 2,
    version: 1,
    model: {
      ...model,
      stateGroups: [{ id: "G", name: "修正後", stateIds: ["A", "C"] }],
    },
  };
  const sent: unknown[] = [];
  completePreviewRender(old, current, (value) => sent.push(value));
  expect(sent).toEqual([]);
  completePreviewRender(current, current, (value) => sent.push(value));
  expect(sent).toEqual([
    {
      type: "glitchstate.rendered",
      uri: "file:///groups.gls",
      sequence: 2,
      version: 1,
    },
  ]);
});

test("REQ-031-S01 REQ-032-S01 2メンバーだけの部分一致を枠から1本へまとめ入力を変えない", () => {
  const input = { ...model, transitions: [plain("A", "X"), plain("B", "X")] };
  const before = structuredClone(input);
  const graph = buildStateDiagram(input);
  expect(graph.edges).toEqual([
    {
      id: "state-group:G:X",
      type: "state",
      source: "state-group:G",
      target: "X",
    },
  ]);
  expect(graph.nodes[0]).toMatchObject({
    id: "state-group:G",
    type: "stateGroup",
    data: { name: "稼働系", stateIds: ["C", "B", "A"] },
  });
  expect(
    graph.nodes
      .filter((n) => n.type === "state")
      .map((n) => ({ id: n.id, parentId: n.parentId, data: n.data })),
  ).toEqual(
    states.map((s) => ({
      id: s.id,
      parentId: ["A", "B", "C"].includes(s.id) ? "state-group:G" : undefined,
      data: { name: s.name, color: s.color },
    })),
  );
  expect(input).toEqual(before);
});
test("REQ-031-S02 イベントと先頭以外の分岐も対象にし処理なしを落とさない", () => {
  expect(
    pairs({
      ...model,
      transitions: [
        plain("A", "X"),
        {
          fromStateId: "B",
          eventId: "RETRY",
          commonAction: null,
          branches: [
            { condition: "別", action: "処理", targetStateId: "Y" },
            { condition: "一致", action: null, targetStateId: "X" },
          ],
        },
      ],
    }),
  ).toEqual([
    ["state-group:G", "X"],
    ["B", "Y"],
  ]);
});
test("REQ-031-S03 同じ状態のイベントと分岐を数えて集約しない", () => {
  expect(
    pairs({
      ...model,
      transitions: [
        plain("A", "X"),
        {
          fromStateId: "A",
          eventId: "RETRY",
          commonAction: "共通",
          branches: [
            { condition: "甲", action: null, targetStateId: "X" },
            { condition: "乙", action: "別", targetStateId: "X" },
          ],
        },
      ],
    }),
  ).toEqual([["A", "X"]]);
});
test("REQ-031-S04 内部への複数遷移と自己遷移、なしを個別に保つ", () => {
  expect(
    pairs({
      ...model,
      transitions: [
        plain("A", "C"),
        plain("B", "C"),
        plain("A", "A", "RETRY"),
        plain("B", null, "RETRY"),
      ],
    }),
  ).toEqual([
    ["A", "C"],
    ["B", "C"],
    ["A", "A"],
  ]);
});
test("REQ-031-S05 到達先を別グループの枠へまとめず各遷移元グループを区別する", () => {
  expect(
    pairs({
      ...model,
      stateGroups: [
        ...(model.stateGroups ?? []),
        { id: "H", name: "到達側", stateIds: ["X", "Y"] },
        { id: "J", name: "別", stateIds: ["D", "E"] },
      ],
      transitions: [
        plain("A", "X"),
        plain("B", "X"),
        plain("A", "Y", "RETRY"),
        plain("U", "X"),
        plain("U", "Y", "RETRY"),
        plain("D", "X"),
        plain("E", "X"),
      ],
    }),
  ).toEqual([
    ["state-group:G", "X"],
    ["A", "Y"],
    ["U", "X"],
    ["U", "Y"],
    ["state-group:J", "X"],
  ]);
});
test("REQ-031-S06 集約した往路と個別の復路を保つ", () => {
  expect(
    pairs({
      ...model,
      transitions: [plain("A", "X"), plain("B", "X"), plain("X", "A")],
    }),
  ).toEqual([
    ["state-group:G", "X"],
    ["X", "A"],
  ]);
});
test("REQ-028-S03 REQ-032-S02 状態IDと同じグループIDを別ノードとして保持する", () => {
  const graph = buildStateDiagram({
    ...model,
    stateGroups: [{ id: "A", name: "状態A", stateIds: ["B", "C"] }],
    transitions: [plain("B", "A"), plain("C", "A")],
  });
  expect(graph.nodes.map((n) => n.id)).toEqual([
    "state-group:A",
    "A",
    "B",
    "C",
    "X",
    "Y",
    "U",
    "D",
    "E",
  ]);
  expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
    ["state-group:A", "A"],
  ]);
});
