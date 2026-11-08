import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

test("REQ-007-S01 イベントを宣言順に返す", () => {
  expect(parseGls('Event Z_START as "開始"\nEvent A_STOP as "停止"')).toEqual({
    model: {
      states: [],
      events: [
        { id: "Z_START", name: "開始" },
        { id: "A_STOP", name: "停止" },
      ],
      transitions: [],
    },
    diagnostics: [],
  });
});

test("REQ-007-S02 IDの名前空間と大小文字を区別し同名を保持する", () => {
  expect(
    parseGls(
      'State START as "待機" color "#4F46E5":\n    待つ\nEvent START as "開始"\nEvent start as "開始"\nEvent _START9 as "開始"',
    ),
  ).toEqual({
    model: {
      states: [
        { id: "START", name: "待機", color: "#4F46E5", meaning: "待つ" },
      ],
      events: [
        { id: "START", name: "開始" },
        { id: "start", name: "開始" },
        { id: "_START9", name: "開始" },
      ],
      transitions: [],
    },
    diagnostics: [],
  });
});

test.each([
  {
    source:
      'State Z as "待機" color "#4F46E5":\n    待つ\nState A as "実行" color "#22C55E":\n    走る',
    states: [
      { id: "Z", name: "待機", color: "#4F46E5", meaning: "待つ" },
      { id: "A", name: "実行", color: "#22C55E", meaning: "走る" },
    ],
  },
  { source: "", states: [] },
  { source: " \t\r\n \n", states: [] },
])(
  "REQ-007-S03 既存文書のイベントと遷移は空: $source",
  ({ source, states }) => {
    expect(parseGls(source)).toEqual({
      model: { states, events: [], transitions: [] },
      diagnostics: [],
    });
  },
);
