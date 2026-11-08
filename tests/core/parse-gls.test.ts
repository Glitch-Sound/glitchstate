import { describe, expect, test } from "vitest";
import { parseGls } from "../../src/core";

const header = 'State IDLE as "待機" color "#4F46E5":';

describe("状態定義の読み取り", () => {
  test("REQ-001-S01 各項目を保持する", () => {
    expect(parseGls(`${header}\n    開始を待つ状態`)).toEqual({
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "待機",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
      diagnostics: [],
    });
  });

  test.each([
    `${header}\n    開始を待つ\n \t\n    要求で実行へ進む`,
    `${header}\r\n    開始を待つ\r\n    要求で実行へ進む`,
  ])("REQ-001-S02 改行と本文を保持する: %s", (source) => {
    expect(parseGls(source)).toEqual({
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "待機",
            meaning: "開始を待つ\n要求で実行へ進む",
            color: "#4F46E5",
          },
        ],
      },
      diagnostics: [],
    });
  });

  test.each(["", " \t\r\n   \n"])("REQ-001-S03 空の文書: %j", (source) => {
    expect(parseGls(source)).toEqual({
      model: { states: [], events: [], transitions: [] },
      diagnostics: [],
    });
  });

  test("REQ-001-S04 IDで識別し宣言順を保つ", () => {
    expect(
      parseGls(
        'State _Z9 as "待機" color "#aBcD01":\n    最初\nState A_FIRST as "待機" color "#000000":\n    次',
      ),
    ).toEqual({
      model: {
        events: [],
        transitions: [],
        states: [
          { id: "_Z9", name: "待機", meaning: "最初", color: "#aBcD01" },
          { id: "A_FIRST", name: "待機", meaning: "次", color: "#000000" },
        ],
      },
      diagnostics: [],
    });
  });
});
