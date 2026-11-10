import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const states = [
  { id: "A", name: "待機", meaning: "待つ", color: "#4F46E5" },
  { id: "B", name: "実行中", meaning: "走る", color: "#22C55E" },
  { id: "C", name: "回復中", meaning: "直す", color: "#F97316" },
  { id: "D", name: "停止", meaning: "止まる", color: "#FF0000" },
];
const declarations = states
  .map(
    (s) => `State ${s.id} as "${s.name}" color "${s.color}":\n    ${s.meaning}`,
  )
  .join("\n");
const group = 'StateGroup ACTIVE as "稼働系":\n    A\n    B';

test("REQ-028-S01 REQ-032-S01 サンプルを独立したモデルの期待値で解析する", () => {
  expect(parseGls(readFileSync("examples/state-groups.gls", "utf8"))).toEqual({
    diagnostics: [],
    model: {
      states: [
        {
          id: "IDLE",
          name: "準備待ち",
          meaning: "開始を待つ",
          color: "#4F46E5",
        },
        {
          id: "RUNNING",
          name: "実行中",
          meaning: "要求を処理する",
          color: "#22C55E",
        },
        {
          id: "RECOVERING",
          name: "復旧中",
          meaning: "実行を復旧する",
          color: "#F97316",
        },
        {
          id: "DONE",
          name: "完了",
          meaning: "正常に終了した",
          color: "#0284C7",
        },
        {
          id: "FAILED",
          name: "失敗",
          meaning: "異常を記録した",
          color: "#FF0000",
        },
      ],
      events: [
        { id: "START", name: "開始", categoryPath: ["操作", "運転"] },
        { id: "RETRY", name: "再試行" },
      ],
      eventCategoryHeaders: ["系統", "区分", "種別"],
      stateGroups: [
        {
          id: "WORK",
          name: "稼働系",
          stateIds: ["IDLE", "RUNNING", "RECOVERING"],
        },
      ],
      transitions: [
        {
          fromStateId: "IDLE",
          eventId: "START",
          action: "要求を記録する",
          targetStateId: "DONE",
        },
        {
          fromStateId: "RUNNING",
          eventId: "START",
          commonAction: "検査を記録する",
          branches: [
            { condition: "許可", action: null, targetStateId: "DONE" },
            { condition: "異常", action: "通知する", targetStateId: "FAILED" },
          ],
        },
        {
          fromStateId: "RECOVERING",
          eventId: "RETRY",
          action: "復旧を記録する",
          targetStateId: "IDLE",
        },
        {
          fromStateId: "IDLE",
          eventId: "RETRY",
          action: "再確認する",
          targetStateId: "IDLE",
        },
        {
          fromStateId: "DONE",
          eventId: "RETRY",
          action: null,
          targetStateId: null,
        },
      ],
    },
  });
});

test("REQ-028-S01 名前と所属だけを別の情報として読む", () => {
  expect(parseGls(`${declarations}\n${group}`)).toEqual({
    diagnostics: [],
    model: {
      states,
      events: [],
      transitions: [],
      stateGroups: [{ id: "ACTIVE", name: "稼働系", stateIds: ["A", "B"] }],
    },
  });
});
test("REQ-028-S02 後方参照と宣言順と所属順、引用符内の空白を保つ", () => {
  expect(
    parseGls(
      [
        'StateGroup   Z_GROUP   as   " A > B ":  ',
        "    B  ",
        " \t",
        "    A",
        'StateGroup A_GROUP as "後半":',
        "    C",
        "    D",
        declarations,
      ].join("\r\n"),
    ),
  ).toEqual({
    diagnostics: [],
    model: {
      states,
      events: [],
      transitions: [],
      stateGroups: [
        { id: "Z_GROUP", name: " A > B ", stateIds: ["B", "A"] },
        { id: "A_GROUP", name: "後半", stateIds: ["C", "D"] },
      ],
    },
  });
});
test("REQ-028-S03 状態とイベントのID、グループの同名と大小文字を区別する", () => {
  const source = `${declarations.replace("State A as", "State ACTIVE as")}\nEvent ACTIVE as "開始"\n${group.replace("    A\n", "    ACTIVE\n")}\nStateGroup active as "稼働系":\n    C\n    D\nTransition ACTIVE on ACTIVE -> B:\n    記録`;
  expect(parseGls(source)).toEqual({
    diagnostics: [],
    model: {
      states: [{ ...states[0], id: "ACTIVE" }, ...states.slice(1)],
      events: [{ id: "ACTIVE", name: "開始" }],
      transitions: [
        {
          fromStateId: "ACTIVE",
          eventId: "ACTIVE",
          action: "記録",
          targetStateId: "B",
        },
      ],
      stateGroups: [
        { id: "ACTIVE", name: "稼働系", stateIds: ["ACTIVE", "B"] },
        { id: "active", name: "稼働系", stateIds: ["C", "D"] },
      ],
    },
  });
});
for (const [source, model] of [
  ["", { states: [], events: [], transitions: [] }],
  [declarations, { states, events: [], transitions: [] }],
  [
    `${declarations}\nEventCategoryHeaders "系統"\nEvent E as "要求" in "操作"\nTransition A on E -> B:\n    平坦\nTransition B on E:\n    Common:\n        共通\n    Branch "確認" -> -:\n        -`,
    {
      states,
      events: [{ id: "E", name: "要求", categoryPath: ["操作"] }],
      eventCategoryHeaders: ["系統"],
      transitions: [
        { fromStateId: "A", eventId: "E", action: "平坦", targetStateId: "B" },
        {
          fromStateId: "B",
          eventId: "E",
          commonAction: "共通",
          branches: [{ condition: "確認", action: null, targetStateId: null }],
        },
      ],
    },
  ],
] as const) {
  test(`REQ-028-S04 グループなしでモデルを拡張しない: ${source.length}`, () => {
    expect(parseGls(source)).toEqual({ model, diagnostics: [] });
  });
}
test("REQ-028-S04 状態と平坦な処理の本文のStateGroupは文字列である", () => {
  const literal = 'StateGroup ACTIVE as "表示用":';
  const result = parseGls(
    `${declarations.replace("    待つ", `    ${literal}`)}\nEvent E as "要求"\nTransition A on E -> B:\n    ${literal}`,
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.states[0].meaning).toBe(literal);
  expect(result.model?.transitions).toEqual([
    { fromStateId: "A", eventId: "E", targetStateId: "B", action: literal },
  ]);
  expect(result.model).not.toHaveProperty("stateGroups");
});
