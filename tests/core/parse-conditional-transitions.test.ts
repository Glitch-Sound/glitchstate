import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const declarations = [
  'State IDLE as "待機" color "#4F46E5":',
  "    待つ",
  'State RUNNING as "実行中" color "#22C55E":',
  "    走る",
  'State FAILED as "失敗" color "#FF0000":',
  "    止まる",
  'Event START as "開始"',
].join("\n");

test("REQ-023-S01 共通処理と全分岐を1交点に保持し順序を変えない", () => {
  const result = parseGls(`${declarations}
Transition IDLE on START:
    Common:
        要求を記録する
    Branch "それ以外" -> FAILED:
        拒否を記録する
    Branch "準備完了" -> RUNNING:
        開始する`);
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.transitions).toEqual([
    {
      fromStateId: "IDLE",
      eventId: "START",
      commonAction: "要求を記録する",
      branches: [
        {
          condition: "それ以外",
          action: "拒否を記録する",
          targetStateId: "FAILED",
        },
        { condition: "準備完了", action: "開始する", targetStateId: "RUNNING" },
      ],
    },
  ]);
});

for (const [
  common,
  action,
  target,
  commonAction,
  branchAction,
  targetStateId,
] of [
  ["-", "記録する", "RUNNING", null, "記録する", "RUNNING"],
  ["記録する", "-", "RUNNING", "記録する", null, "RUNNING"],
  ["記録する", "処理する", "-", "記録する", "処理する", null],
  ["-", "-", "-", null, null, null],
  ["記録する", "処理する", "IDLE", "記録する", "処理する", "IDLE"],
] as const) {
  test(`REQ-023-S02 1分岐のなしと自己参照を区別する: ${common}/${action}/${target}`, () => {
    expect(
      parseGls(
        `${declarations}\nTransition IDLE on START:\n    Common:\n        ${common}\n    Branch "確認" -> ${target}:\n        ${action}`,
      ),
    ).toEqual({
      model: {
        states: [
          { id: "IDLE", name: "待機", color: "#4F46E5", meaning: "待つ" },
          { id: "RUNNING", name: "実行中", color: "#22C55E", meaning: "走る" },
          { id: "FAILED", name: "失敗", color: "#FF0000", meaning: "止まる" },
        ],
        events: [{ id: "START", name: "開始" }],
        transitions: [
          {
            fromStateId: "IDLE",
            eventId: "START",
            commonAction,
            branches: [
              { condition: "確認", action: branchAction, targetStateId },
            ],
          },
        ],
      },
      diagnostics: [],
    });
  });
}

test("REQ-023-S03 分類付きイベントと後方参照、空白と複数行を保つ", () => {
  const result = parseGls(
    [
      "Transition   IDLE   on   START:  ",
      "    Common:  ",
      "        要求を記録する",
      " ",
      "        準備する",
      '    Branch   " A > B "   ->   RUNNING:  ',
      "        開始する",
      "        通知する",
      declarations.replace(
        'Event START as "開始"',
        'Event START as "開始" in "操作" > "運転"',
      ),
      'EventCategoryHeaders "系統" > "区分"',
    ].join("\r\n"),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.eventCategoryHeaders).toEqual(["系統", "区分"]);
  expect(result.model?.events).toEqual([
    { id: "START", name: "開始", categoryPath: ["操作", "運転"] },
  ]);
  expect(result.model?.transitions).toEqual([
    {
      fromStateId: "IDLE",
      eventId: "START",
      commonAction: "要求を記録する\n準備する",
      branches: [
        {
          condition: " A > B ",
          action: "開始する\n通知する",
          targetStateId: "RUNNING",
        },
      ],
    },
  ]);
});

test("REQ-023-S04 矢印付きの旧形式の本文は構文へ読み替えない", () => {
  const result = parseGls(
    `${declarations}\nTransition IDLE on START -> RUNNING:\n    Common:\n    Branch "確認" -> IDLE:`,
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.transitions).toEqual([
    {
      fromStateId: "IDLE",
      eventId: "START",
      action: 'Common:\nBranch "確認" -> IDLE:',
      targetStateId: "RUNNING",
    },
  ]);
});

test("REQ-023-S01 分類と両形式のサンプルを独立した期待値で解析する", () => {
  expect(
    parseGls(readFileSync("examples/conditional-transitions.gls", "utf8")),
  ).toEqual({
    diagnostics: [],
    model: {
      states: [
        {
          id: "IDLE",
          name: "待機",
          color: "#4F46E5",
          meaning: "開始を待つ状態",
        },
        {
          id: "RUNNING",
          name: "実行中",
          color: "#22C55E",
          meaning: "実行している状態",
        },
        {
          id: "FAILED",
          name: "失敗",
          color: "#FF0000",
          meaning: "開始に失敗した状態",
        },
      ],
      events: [
        { id: "START", name: "開始", categoryPath: ["操作", "運転", "開始系"] },
        { id: "STOP", name: "停止", categoryPath: ["操作", "運転"] },
        { id: "PING", name: "疎通確認" },
      ],
      eventCategoryHeaders: ["系統", "区分", "種別"],
      transitions: [
        {
          fromStateId: "IDLE",
          eventId: "START",
          commonAction: "要求を記録する",
          branches: [
            {
              condition: "準備完了",
              action: "開始する",
              targetStateId: "RUNNING",
            },
            { condition: "それ以外", action: null, targetStateId: "FAILED" },
          ],
        },
        {
          fromStateId: "RUNNING",
          eventId: "STOP",
          action: null,
          targetStateId: "IDLE",
        },
        {
          fromStateId: "IDLE",
          eventId: "PING",
          action: "応答する",
          targetStateId: null,
        },
      ],
    },
  });
});
