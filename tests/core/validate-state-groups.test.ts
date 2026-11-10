import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const prefix =
  'State A as "待機" color "#4F46E5":\n    待つ\nState B as "実行中" color "#22C55E":\n    走る\nState C as "停止" color "#FF0000":\n    止まる\nEvent E as "要求"\n';
const valid = 'StateGroup G as "稼働系":\n    A\n    B';
for (const [fragment, line, reason] of [
  [valid.replace(' as "稼働系"', ""), 8, "構文"],
  [valid.replace('"稼働系"', "稼働系"), 8, "構文"],
  [valid.replace('"稼働系"', ""), 8, "構文"],
  [valid.replace('"稼働系"', '"稼"働"'), 8, "構文"],
  [valid.replace('"稼働系"', '"稼\n働"'), 8, "構文"],
  [valid.replace('"稼働系"', '"稼\r働"'), 8, "構文"],
  [valid.replace(":", ""), 8, "構文"],
  [valid.replace("StateGroup G", "StateGroup 1BAD"), 8, "ID"],
  [valid.replace('"稼働系"', '""'), 8, "名前"],
  [valid.replace('"稼働系"', '"   "'), 8, "名前"],
  [valid.split("\n")[0], 8, "2状態"],
  [valid.split("\n")[0] + "\n \t", 8, "2状態"],
  [valid.replace("\n    B", ""), 8, "2状態"],
  [valid.replace("    B", "    1BAD"), 10, "状態ID"],
  [valid.replace("    B", "    A B"), 10, "1行1件"],
  [valid.replace("    B", "    A,B"), 10, "1行1件"],
  ...["  ", "        ", "\t"].map(
    (indent) =>
      [valid.replace("    B", `${indent}B`), 10, "インデント"] as const,
  ),
  [valid + '\n    StateGroup H as "子":\n        C', 11, "1行1件"],
] as const) {
  test(`REQ-029-S01 宣言と所属の構造の誤り: ${fragment}`, () => {
    const result = parseGls(prefix + fragment);
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: expect.any(String),
      line,
      message: expect.stringContaining(reason),
    });
  });
}
for (const target of ["MISSING", "H"]) {
  test(`REQ-029-S02 未宣言の状態とグループだけの参照を拒否する: ${target}`, () => {
    const result = parseGls(
      `${prefix}${valid.replace("    B", `    ${target}`)}\nStateGroup H as "別":\n    B\n    C`,
    );
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: "reference",
      line: 10,
      message: `所属状態ID ${target} は未宣言`,
    });
  });
}
for (const [source, code, line, id] of [
  [
    `${valid}\nStateGroup G as "別":\n    C\n    B`,
    "duplicate-group-id",
    11,
    "G",
  ],
  [valid + "\n    A", "duplicate-group-member", 11, "A"],
  [
    `${valid}\nStateGroup H as "別":\n    C\n    B`,
    "duplicate-group-membership",
    13,
    "B",
  ],
] as const) {
  test(`REQ-029-S03 重複は後の宣言位置へ報告する: ${code}`, () => {
    const result = parseGls(prefix + source);
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code,
      line,
      message: expect.stringContaining(id),
    });
  });
}
for (const [transition, line] of [
  ["Transition G on E -> B:\n    処理", 11],
  ["Transition A on E -> G:\n    処理", 11],
  [
    'Transition A on E:\n    Common:\n        -\n    Branch "確認" -> G:\n        処理',
    14,
  ],
] as const) {
  test(`REQ-029-S04 遷移参照をグループへ広げない: ${transition}`, () => {
    const result = parseGls(`${prefix}${valid}\n${transition}`);
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: "reference",
      line,
      message: expect.stringContaining("状態ID G は未宣言"),
    });
  });
}
