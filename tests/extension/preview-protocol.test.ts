import { expect, test } from "vitest";
import { isPreviewUpdate } from "../../src/preview-protocol";

const state = { id: "IDLE", name: "待機", meaning: "待つ", color: "#4F46E5" };
const event = { id: "START", name: "開始" };
const transition = {
  fromStateId: "IDLE",
  eventId: "START",
  action: "記録する",
  targetStateId: "IDLE",
};
const model = { states: [state], events: [event], transitions: [transition] };
const notification = (model: unknown) => ({
  type: "glitchstate.update",
  uri: "file:///a.gls",
  version: 1,
  sequence: 1,
  model,
  hasErrors: model === null,
});

const conditional = {
  fromStateId: "IDLE",
  eventId: "START",
  commonAction: "共通処理",
  branches: [
    { condition: "準備完了", action: "開始する", targetStateId: "IDLE" },
    { condition: "それ以外", action: null, targetStateId: null },
  ],
};
for (const value of [
  { ...model, transitions: [conditional] },
  { ...model, transitions: [{ ...conditional, commonAction: null }] },
  {
    ...model,
    events: [
      { ...event, categoryPath: ["操作"] },
      { id: "RETRY", name: "再試行" },
    ],
    eventCategoryHeaders: ["系統", "区分"],
    transitions: [conditional, { ...transition, eventId: "RETRY" }],
  },
]) {
  test(`REQ-023-S01 REQ-023-S02 両形式となしを持つ分岐通知を受理する: ${JSON.stringify(value.transitions)}`, () => {
    expect(isPreviewUpdate(notification(value))).toBe(true);
  });
}
const invalidConditional: unknown[] = [
  ...[undefined, "", " ", 1, []].map((commonAction) => ({
    ...conditional,
    commonAction,
  })),
  ...[undefined, [], null, {}].map((branches) => ({
    ...conditional,
    branches,
  })),
  ...[undefined, "", " ", 1].map((action) => ({
    ...conditional,
    branches: [conditional.branches[0], { ...conditional.branches[1], action }],
  })),
  ...[undefined, "", " ", 1, 'A"B', "A\nB", "A\rB"].map((condition) => ({
    ...conditional,
    branches: [
      conditional.branches[0],
      { ...conditional.branches[1], condition },
    ],
  })),
  ...[undefined, 1, "1BAD", "MISSING"].map((targetStateId) => ({
    ...conditional,
    branches: [
      conditional.branches[0],
      { ...conditional.branches[1], targetStateId },
    ],
  })),
  {
    ...conditional,
    branches: [
      conditional.branches[0],
      { ...conditional.branches[1], condition: "準備完了" },
    ],
  },
  {
    ...conditional,
    branches: [
      { ...conditional.branches[0], branches: [conditional.branches[1]] },
    ],
  },
  { ...conditional, action: "旧処理" },
  { ...conditional, targetStateId: "IDLE" },
];
for (const value of invalidConditional) {
  test(`REQ-027-S03 対象項目だけが不正な分岐通知を拒否する: ${JSON.stringify(value)}`, () => {
    expect(
      isPreviewUpdate(notification({ ...model, transitions: [value] })),
    ).toBe(false);
  });
}
test("REQ-024-S04 分岐と旧形式が同じ交点を持つ通知を拒否する", () => {
  expect(
    isPreviewUpdate(
      notification({ ...model, transitions: [conditional, transition] }),
    ),
  ).toBe(false);
});
test("REQ-024-S02 別の遷移では同名条件と大小文字を変換せず受理する", () => {
  expect(
    isPreviewUpdate(
      notification({
        ...model,
        events: [event, { id: "RETRY", name: "再試行" }],
        transitions: [
          {
            ...conditional,
            branches: [
              conditional.branches[0],
              { ...conditional.branches[1], condition: "Ready" },
              { ...conditional.branches[1], condition: "ready" },
            ],
          },
          { ...conditional, eventId: "RETRY" },
        ],
      }),
    ),
  ).toBe(true);
});

test("REQ-007-S03 状態だけの新形式と正常な拡張モデルを受け付ける", () => {
  expect(
    isPreviewUpdate(
      notification({ states: [state], events: [], transitions: [] }),
    ),
  ).toBe(true);
  expect(isPreviewUpdate(notification(model))).toBe(true);
  expect(isPreviewUpdate(notification(null))).toBe(true);
});

test.each([
  { ...transition, action: null },
  { ...transition, targetStateId: null },
  { ...transition, action: null, targetStateId: null },
])("REQ-008-S03 なしを含む定義済み遷移を受け付ける: %j", (value) => {
  expect(
    isPreviewUpdate(notification({ ...model, transitions: [value] })),
  ).toBe(true);
});

test.each([
  { states: [state] },
  { states: [state], events: [event] },
  { ...model, events: [{ ...event, id: "1START" }] },
  { ...model, events: [{ ...event, name: " " }] },
  { ...model, states: [state, state] },
  { ...model, events: [event, event] },
  { ...model, transitions: [{ ...transition, action: undefined }] },
  { ...model, transitions: [{ ...transition, action: " " }] },
  { ...model, transitions: [{ ...transition, targetStateId: 1 }] },
  { ...model, transitions: [{ ...transition, fromStateId: "MISSING" }] },
  { ...model, transitions: [{ ...transition, eventId: "MISSING" }] },
  { ...model, transitions: [{ ...transition, targetStateId: "MISSING" }] },
  {
    ...model,
    transitions: [transition, { ...transition, targetStateId: null }],
  },
])("REQ-013-S04 不正なモデル通知を採用しない: %j", (value) => {
  expect(isPreviewUpdate(notification(value))).toBe(false);
});

for (const value of [
  {
    ...model,
    eventCategoryHeaders: ["系統"],
    events: [{ ...event, categoryPath: ["操作"] }],
  },
  {
    ...model,
    eventCategoryHeaders: ["領域", "用途", "種別"],
    events: [{ ...event, categoryPath: ["操作", "運転", "開始系"] }],
  },
  { ...model, eventCategoryHeaders: ["系統", "区分", "種別"] },
]) {
  test(`REQ-022-S01 REQ-022-S02 分類と独立した見出しを受信する: ${JSON.stringify(value.events)}`, () => {
    expect(isPreviewUpdate(notification(value))).toBe(true);
  });
}
for (const field of ["categoryPath", "eventCategoryHeaders"] as const) {
  for (const invalid of [
    [],
    ["A", "B", "C", "D"],
    [""],
    [" "],
    ["A\nB"],
    ['A"B'],
    [1],
    "操作",
    null,
  ]) {
    test(`REQ-021-S03 不正な${field}を拒否する: ${JSON.stringify(invalid)}`, () => {
      const data =
        field === "eventCategoryHeaders"
          ? {
              ...model,
              eventCategoryHeaders: invalid,
              events: [{ ...event, categoryPath: ["操作"] }],
            }
          : {
              ...model,
              eventCategoryHeaders: ["系統"],
              events: [{ ...event, categoryPath: invalid }],
            };
      expect(isPreviewUpdate(notification(data))).toBe(false);
    });
  }
}
for (const eventCategoryHeaders of [undefined, ["系統"]]) {
  test(`REQ-019-S03 分類の深さに列見出しが足りない通知を拒否する: ${eventCategoryHeaders}`, () => {
    expect(
      isPreviewUpdate(
        notification({
          ...model,
          eventCategoryHeaders,
          events: [{ ...event, categoryPath: ["操作", "運転"] }],
        }),
      ),
    ).toBe(false);
  });
}
test("REQ-019-S02 分類別の同じイベントIDを受け付けない", () => {
  expect(
    isPreviewUpdate(
      notification({
        ...model,
        eventCategoryHeaders: ["系統"],
        events: [
          { ...event, categoryPath: ["操作"] },
          { ...event, categoryPath: ["通信"] },
        ],
      }),
    ),
  ).toBe(false);
});
