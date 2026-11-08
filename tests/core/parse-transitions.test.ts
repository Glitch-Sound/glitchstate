import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const declarations =
  'State IDLE as "待機" color "#4F46E5":\n    待つ\nState RUNNING as "実行中" color "#22C55E":\n    走る\nEvent START as "開始"';
const baseModel = {
  states: [
    { id: "IDLE", name: "待機", color: "#4F46E5", meaning: "待つ" },
    { id: "RUNNING", name: "実行中", color: "#22C55E", meaning: "走る" },
  ],
  events: [{ id: "START", name: "開始" }],
};

test("REQ-008-S01 参照IDと処理を返す", () => {
  expect(
    parseGls(
      `${declarations}\nTransition IDLE on START -> RUNNING:\n    開始を記録する`,
    ),
  ).toEqual({
    model: {
      ...baseModel,
      transitions: [
        {
          fromStateId: "IDLE",
          eventId: "START",
          action: "開始を記録する",
          targetStateId: "RUNNING",
        },
      ],
    },
    diagnostics: [],
  });
});

test.each([
  `${declarations}\nTransition IDLE on START -> RUNNING:\n    開始を記録する\n \t\n    実行を準備する`,
  `${declarations}\nTransition IDLE on START -> RUNNING:\n    開始を記録する\n    実行を準備する`.replaceAll(
    "\n",
    "\r\n",
  ),
])("REQ-008-S02 複数行の処理と改行を保つ: %s", (source) => {
  expect(parseGls(source)).toEqual({
    model: {
      ...baseModel,
      transitions: [
        {
          fromStateId: "IDLE",
          eventId: "START",
          action: "開始を記録する\n実行を準備する",
          targetStateId: "RUNNING",
        },
      ],
    },
    diagnostics: [],
  });
});

test.each([
  { body: "-", target: "RUNNING", action: null, targetStateId: "RUNNING" },
  { body: "記録する", target: "-", action: "記録する", targetStateId: null },
  { body: "-", target: "-", action: null, targetStateId: null },
])(
  "REQ-008-S03 なしは独立した明示値: $body / $target",
  ({ body, target, action, targetStateId }) => {
    expect(
      parseGls(
        `${declarations}\nTransition IDLE on START -> ${target}:\n    ${body}`,
      ),
    ).toEqual({
      model: {
        ...baseModel,
        transitions: [
          { fromStateId: "IDLE", eventId: "START", action, targetStateId },
        ],
      },
      diagnostics: [],
    });
  },
);

test("REQ-008-S04 後方参照の自状態を保持する", () => {
  expect(
    parseGls(
      `Transition IDLE on START -> IDLE:\n    記録する\n${declarations}`,
    ),
  ).toEqual({
    model: {
      ...baseModel,
      transitions: [
        {
          fromStateId: "IDLE",
          eventId: "START",
          action: "記録する",
          targetStateId: "IDLE",
        },
      ],
    },
    diagnostics: [],
  });
});
