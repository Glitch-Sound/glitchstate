import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const header = 'State IDLE as "待機" color "#4F46E5":';
const cases: [string, string, number][] = [
  ['State IDLE color "#4F46E5":\n    意味', "syntax", 1],
  [`${header.slice(0, -1)}\n    意味`, "syntax", 1],
  [`${header.replace("IDLE", "1IDLE")}\n    意味`, "id", 1],
  [`${header.replace("待機", "")}\n    意味`, "name", 1],
  [`${header.replace("待機", "   ")}\n    意味`, "name", 1],
  ['State IDLE as "待機 color "#4F46E5":\n    意味', "syntax", 1],
  [`${header.replace("待機", "待\n機")}\n    意味`, "syntax", 1],
  [`${header.replace("待機", "待\r機")}\n    意味`, "syntax", 1],
  [`${header.replace("待機", '待"機')}\n    意味`, "syntax", 1],
  ...["red", "#FFF", "#GG0000"].map((color): [string, string, number] => [
    `${header.replace("#4F46E5", color)}\n    意味`,
    "color",
    1,
  ]),
  ['State IDLE as "待機":\n    意味', "syntax", 1],
  [header, "meaning", 1],
  [`${header}\n    \n \t`, "meaning", 1],
  ...["  ", "        ", "\t"].map((indent): [string, string, number] => [
    `${header}\n${indent}意味`,
    "indent",
    2,
  ]),
  [`${header}\n    意味\nGroup STATES`, "unsupported", 3],
];

test.each(cases)("REQ-002-S01 %s -> %s", (source, code, line) => {
  const result = parseGls(`\n${source}`);
  expect(result.model).toBeNull();
  expect(result.diagnostics).toContainEqual({
    code,
    line: line + 1,
    message: expect.any(String),
  });
  expect(result.diagnostics.every((d) => d.message.trim().length > 0)).toBe(
    true,
  );
});

test("REQ-002-S02 重複は2件目の宣言行に報告する", () => {
  const result = parseGls(`${header}\n    最初\n${header}\n    次`);
  expect(result.model).toBeNull();
  expect(result.diagnostics).toContainEqual({
    code: "duplicate-id",
    line: 3,
    message: expect.stringContaining("IDLE"),
  });
});

test("REQ-002-S03 大文字と小文字のIDを別々に扱う", () => {
  const result = parseGls(
    `${header}\n    最初\n${header.replace("IDLE", "idle")}\n    次`,
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.states.map((state) => state.id)).toEqual([
    "IDLE",
    "idle",
  ]);
});
