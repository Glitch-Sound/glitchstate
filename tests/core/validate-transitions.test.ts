import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const declarations =
  '\nState IDLE as "待機" color "#4F46E5":\n    待つ\nState RUNNING as "実行中" color "#22C55E":\n    走る\nEvent START as "開始"\n';
const header = "Transition IDLE on START -> RUNNING:";
const invalid: [string, string, number, string][] = [
  ["Event START", "syntax", 7, "構文"],
  ['Event 1START as "開始"', "id", 7, "イベントID"],
  ['Event OTHER as ""', "name", 7, "イベント名"],
  ['Event OTHER as "   "', "name", 7, "イベント名"],
  ['Event OTHER as "開始', "syntax", 7, "構文"],
  ['Event OTHER as "開"始"', "syntax", 7, "構文"],
  ['Event OTHER as "開\n始"', "syntax", 7, "構文"],
  ['Event OTHER as "開\r始"', "syntax", 7, "構文"],
  ...[
    "Transition IDLE START -> RUNNING:",
    "Transition IDLE on START RUNNING:",
    "Transition IDLE on START -> RUNNING",
    "Transition IDLE on START -> :",
  ].map((value): [string, string, number, string] => [
    value,
    "syntax",
    7,
    "構文",
  ]),
  ...[
    "Transition 1INVALID on START -> RUNNING:",
    "Transition IDLE on 1INVALID -> RUNNING:",
    "Transition IDLE on START -> 1INVALID:",
  ].map((value): [string, string, number, string] => [
    `${value}\n    記録する`,
    "id",
    7,
    "ID",
  ]),
  [header, "action", 7, "処理"],
  [`${header}\n    \n \t`, "action", 7, "処理"],
  ...["  ", "        ", "\t"].map(
    (indent): [string, string, number, string] => [
      `${header}\n${indent}記録する`,
      "indent",
      8,
      "インデント",
    ],
  ),
  [`${header}\n    -\n    記録する`, "mixed-action", 9, "処理なし"],
  [`${header}\n    記録する\n    -`, "mixed-action", 9, "処理なし"],
  [
    'Event OTHER as "親"\n    Event CHILD as "子"',
    "event-hierarchy",
    8,
    "階層",
  ],
  [`${header}\n    If READY:\n        記録する`, "indent", 9, "インデント"],
];

test.each(invalid)("REQ-009-S01 %s", (fragment, code, line, reason) => {
  const result = parseGls(declarations + fragment);
  expect(result.model).toBeNull();
  expect(result.diagnostics).toContainEqual({
    code,
    line,
    message: expect.stringContaining(reason),
  });
});

test.each([
  { header: "Transition MISSING on START -> RUNNING:", kind: "遷移元状態" },
  { header: "Transition IDLE on MISSING -> RUNNING:", kind: "イベント" },
  { header: "Transition IDLE on START -> MISSING:", kind: "遷移先状態" },
])("REQ-009-S02 $kind の未宣言参照を報告する", ({ header, kind }) => {
  expect(parseGls(`${declarations}${header}\n    記録する`)).toEqual({
    model: null,
    diagnostics: [
      { code: "reference", line: 7, message: `${kind}ID MISSING は未宣言` },
    ],
  });
});

test.each([
  {
    fragment: 'Event START as "別名"',
    line: 7,
    code: "duplicate-event-id",
    message: "イベントID START が重複している",
  },
  {
    fragment: `${header}\n    最初\nTransition IDLE on START -> -:\n    後の処理`,
    line: 9,
    code: "duplicate-transition",
    message: "遷移元状態ID IDLE とイベントID START の組み合わせが重複している",
  },
])(
  "REQ-009-S03 $code は後の宣言行を報告する",
  ({ fragment, line, code, message }) => {
    expect(parseGls(declarations + fragment)).toEqual({
      model: null,
      diagnostics: [{ code, line, message }],
    });
  },
);
