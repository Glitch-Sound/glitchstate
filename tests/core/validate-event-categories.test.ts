import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const headers = 'EventCategoryHeaders "系統" > "区分" > "種別"';
for (const [suffix, reason] of [
  ['in "A" > "B" > "C" > "D"', "3段"],
  ['in ""', "分類名"],
  ['in "   "', "分類名"],
  ["in", "分類経路"],
  ['in "A" >', "分類名"],
  ['in "A" "B"', "区切り"],
  ['in "A', "構文"],
  ['in "A"B"', "構文"],
  ['in "A\nB"', "構文"],
  ['in "A\rB"', "構文"],
] as const) {
  test(`REQ-019-S01 分類の誤りを宣言行へ返す: ${suffix}`, () => {
    const result = parseGls(`${headers}\nEvent START as "開始" ${suffix}`);
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: expect.any(String),
      line: 2,
      message: expect.stringContaining(reason),
    });
  });
}
for (const [first, second] of [
  ["", ' in "操作"'],
  [' in "操作" > "開始"', ' in "通信" > "開始"'],
] as const) {
  test(`REQ-019-S02 分類が異なっても同じイベントIDを拒否する: ${first}`, () => {
    const result = parseGls(
      `${headers}\nEvent START as "開始"${first}\nEvent START as "別名"${second}`,
    );
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: "duplicate-event-id",
      line: 3,
      message: "イベントID START が重複している",
    });
  });
}
for (const [source, line, reason] of [
  ['Event START as "開始" in "操作"', 1, "見出し不足"],
  [
    'EventCategoryHeaders "系統"\nEvent A as "単独"\nEvent B as "開始" in "操作" > "運転"',
    3,
    "見出し不足",
  ],
  ["EventCategoryHeaders", 1, "見出し"],
  ['EventCategoryHeaders "A" > "B" > "C" > "D"', 1, "3段"],
  ['EventCategoryHeaders ""', 1, "見出し名"],
  ['EventCategoryHeaders "   "', 1, "見出し名"],
  ['EventCategoryHeaders "A', 1, "構文"],
  ['EventCategoryHeaders "A"B"', 1, "構文"],
  ['EventCategoryHeaders "A\nB"', 1, "構文"],
  ['EventCategoryHeaders "A\rB"', 1, "構文"],
  ['EventCategoryHeaders "A" "B"', 1, "区切り"],
  ['EventCategoryHeaders "A" >', 1, "見出し名"],
  [`${headers}\n${headers}`, 2, "重複"],
] as const) {
  test(`REQ-019-S03 列見出しの誤りと不足の位置: ${source}`, () => {
    const result = parseGls(source);
    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: expect.any(String),
      line,
      message: expect.stringContaining(reason),
    });
  });
}
