import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const prefix =
  'State IDLE as "待機" color "#4F46E5":\n    待つ\nState RUNNING as "実行中" color "#22C55E":\n    走る\nEvent START as "開始"\n';
const valid =
  'Transition IDLE on START:\n    Common:\n        共通\n    Branch "準備完了" -> RUNNING:\n        開始';
for (const [fragment, line, reason] of [
  [valid.replace("    Common:\n        共通\n", ""), 6, "Common"],
  [valid.replace("        共通\n", ""), 7, "処理"],
  [valid.replace("        共通\n", "        \n"), 7, "処理"],
  [valid.slice(0, valid.indexOf("    Branch")), 6, "分岐"],
  [valid.replace("        開始", ""), 9, "処理"],
  [valid.replace("        開始", "        "), 9, "処理"],
  [valid.replace('"準備完了"', '""'), 9, "条件名"],
  [valid.replace('"準備完了"', '"   "'), 9, "条件名"],
  [valid.replace('"準備完了"', '"準備'), 9, "構文"],
  [valid.replace('"準備完了"', '"準"備"'), 9, "構文"],
  [valid.replace('"準備完了"', '"準\n備"'), 9, "構文"],
  [valid.replace('"準備完了"', '"準\r備"'), 9, "構文"],
  [valid.replace(" -> RUNNING", " RUNNING"), 9, "構文"],
  [valid.replace("RUNNING:", ":"), 9, "構文"],
  [valid.replace("RUNNING:", "RUNNING"), 9, "構文"],
  [
    valid.replace("    Branch", "    Common:\n        別の共通\n    Branch"),
    9,
    "重複",
  ],
  [
    'Transition IDLE on START:\n    Branch "確認" -> RUNNING:\n        開始\n    Common:\n        共通',
    9,
    "順序",
  ],
  [valid.replace("    Common:", "  Common:"), 7, "インデント"],
  [valid.replace("        共通", "      共通"), 8, "インデント"],
  [valid.replace("        共通", "\t共通"), 8, "インデント"],
  [
    valid.replace(
      "        開始",
      '        Branch "入れ子" -> IDLE:\n            開始',
    ),
    11,
    "インデント",
  ],
  [valid.replace("        共通", "        -\n        共通"), 9, "混在"],
  [valid.replace("        開始", "        開始\n        -"), 11, "混在"],
  [valid.replace("    Common:\n        共通", "    直接の処理"), 7, "宣言"],
] as const) {
  test(`REQ-024-S01 構造の不正は元の行と理由で報告する: ${fragment}`, () => {
    const result = parseGls(prefix + fragment);
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: expect.any(String),
      line,
      message: expect.stringContaining(reason),
    });
  });
}

test("REQ-024-S02 条件名の重複を後のBranch行で拒否する", () => {
  const result = parseGls(
    `${prefix}${valid}\n    Branch "準備完了" -> IDLE:\n        別の処理`,
  );
  expect(result).toEqual({
    model: null,
    diagnostics: [
      {
        code: "duplicate-condition",
        line: 11,
        message: "条件名 準備完了 が重複している",
      },
    ],
  });
});
test("REQ-024-S02 同名条件は異なる交点で使え大小文字と空白を変換しない", () => {
  const source = `${prefix}${valid.replace('"準備完了"', '"Ready"')}\n    Branch "ready" -> IDLE:\n        小文字\n    Branch " Ready " -> -:\n        -\n${valid.replace("Transition IDLE", "Transition RUNNING").replace('"準備完了"', '"Ready"')}`;
  const result = parseGls(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.transitions).toMatchObject([
    {
      branches: [
        { condition: "Ready" },
        { condition: "ready" },
        { condition: " Ready " },
      ],
    },
    { branches: [{ condition: "Ready" }] },
  ]);
});
for (const [from, event, target, line, kind, value] of [
  ["1BAD", "START", "RUNNING", 6, "遷移元状態", "1BAD"],
  ["IDLE", "1BAD", "RUNNING", 6, "イベント", "1BAD"],
  ["IDLE", "START", "1BAD", 9, "遷移先状態", "1BAD"],
  ["MISSING", "START", "RUNNING", 6, "遷移元状態", "MISSING"],
  ["IDLE", "MISSING", "RUNNING", 6, "イベント", "MISSING"],
  ["IDLE", "START", "MISSING", 9, "遷移先状態", "MISSING"],
] as const) {
  test(`REQ-024-S03 ${kind}の${value}を宣言行で診断する`, () => {
    const result = parseGls(
      prefix +
        valid
          .replace("IDLE on START", `${from} on ${event}`)
          .replace("-> RUNNING", `-> ${target}`),
    );
    expect(result).toEqual({
      model: null,
      diagnostics: [
        {
          code: value === "MISSING" ? "reference" : "id",
          line,
          message:
            value === "MISSING"
              ? `${kind}ID MISSING は未宣言`
              : `${kind}IDの形式が不正`,
        },
      ],
    });
  });
}
const plain = "Transition IDLE on START -> RUNNING:\n    処理";
for (const [first, second] of [
  [plain, valid],
  [valid, plain],
  [valid, valid],
]) {
  test(`REQ-024-S04 分岐の有無をまたぐ交点の重複: ${first === plain}/${second === plain}`, () => {
    const result = parseGls(`${prefix}${first}\n${second}`);
    expect(result).toEqual({
      model: null,
      diagnostics: [
        {
          code: "duplicate-transition",
          line: 6 + first.split("\n").length,
          message:
            "遷移元状態ID IDLE とイベントID START の組み合わせが重複している",
        },
      ],
    });
  });
}
