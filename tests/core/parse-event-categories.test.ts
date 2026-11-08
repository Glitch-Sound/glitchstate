import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseGls } from "../../src/core";

const stateSource = 'State IDLE as "待機" color "#4F46E5":\n    待つ';
const state = { id: "IDLE", name: "待機", color: "#4F46E5", meaning: "待つ" };

test("REQ-018-S01 分類なしから3段までを宣言順に保持する", () => {
  expect(
    parseGls(
      [
        'EventCategoryHeaders "系統" > "区分" > "種別"',
        'Event Z_FREE as "単独"',
        'Event Y_START as "開始" in "操作"',
        'Event X_STOP as "停止" in "操作" > "運転"',
        'Event W_RETRY as "再試行" in "操作" > "運転" > "復旧"',
      ].join("\n"),
    ),
  ).toEqual({
    model: {
      states: [],
      events: [
        { id: "Z_FREE", name: "単独" },
        { id: "Y_START", name: "開始", categoryPath: ["操作"] },
        { id: "X_STOP", name: "停止", categoryPath: ["操作", "運転"] },
        {
          id: "W_RETRY",
          name: "再試行",
          categoryPath: ["操作", "運転", "復旧"],
        },
      ],
      transitions: [],
      eventCategoryHeaders: ["系統", "区分", "種別"],
    },
    diagnostics: [],
  });
});
test("REQ-018-S02 同名の子、引用符内の区切り、空白とCRLFを保持する", () => {
  const result = parseGls(
    [
      'EventCategoryHeaders "系統" > "区分"',
      "",
      'Event A as "要求" in "業務">"復旧"',
      'Event B as "要求" in "通信" > "復旧"',
      'Event C as "要求"   in   "業務">" A > B "  ',
    ].join("\r\n"),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.events).toEqual([
    { id: "A", name: "要求", categoryPath: ["業務", "復旧"] },
    { id: "B", name: "要求", categoryPath: ["通信", "復旧"] },
    { id: "C", name: "要求", categoryPath: ["業務", " A > B "] },
  ]);
});
test("REQ-018-S03 分類ではなく後方のイベントIDを遷移から参照する", () => {
  const result = parseGls(
    [
      "Transition IDLE on START -> RUNNING:",
      "    開始を記録する",
      stateSource,
      'State RUNNING as "実行中" color "#22C55E":',
      "    走る",
      'Event START as "開始" in "操作" > "運転" > "開始系"',
      'EventCategoryHeaders "領域" > "用途" > "種別"',
    ].join("\n"),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.transitions).toEqual([
    {
      fromStateId: "IDLE",
      eventId: "START",
      action: "開始を記録する",
      targetStateId: "RUNNING",
    },
  ]);
});
for (const [path, headers] of [
  [["操作"], ["系統"]],
  [
    ["操作", "運転"],
    ["系統", "区分"],
  ],
  [
    ["操作", "運転", "開始系"],
    ["領域", "用途", "種別"],
  ],
] as const) {
  test(`REQ-022-S01 状態と${headers.length}件の列見出しを未対応扱いせず返す`, () => {
    const result = parseGls(
      `${stateSource}\nEvent START as "開始" in ${path.map((x) => `"${x}"`).join(" > ")}\nEventCategoryHeaders ${headers.map((x) => `"${x}"`).join(" > ")}`,
    );
    expect(result).toEqual({
      model: {
        states: [state],
        events: [{ id: "START", name: "開始", categoryPath: [...path] }],
        transitions: [],
        eventCategoryHeaders: [...headers],
      },
      diagnostics: [],
    });
  });
}
for (const suffix of ["", ' in "操作"']) {
  test(`REQ-022-S02 未使用見出しがあっても分類を補完しない: ${suffix}`, () => {
    expect(
      parseGls(
        `EventCategoryHeaders "系統" > "区分" > "種別"\nEvent PING as "確認"${suffix}`,
      ),
    ).toEqual({
      model: {
        states: [],
        events: [
          {
            id: "PING",
            name: "確認",
            ...(suffix ? { categoryPath: ["操作"] } : {}),
          },
        ],
        transitions: [],
        eventCategoryHeaders: ["系統", "区分", "種別"],
      },
      diagnostics: [],
    });
  });
}

test("REQ-018-S01 サンプルの分類と階層なしイベントを読み取る", () => {
  const result = parseGls(
    readFileSync("examples/event-categories.gls", "utf8"),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.model?.eventCategoryHeaders).toEqual(["系統", "区分", "種別"]);
  expect(result.model?.events).toEqual([
    { id: "START", name: "開始", categoryPath: ["操作", "運転", "開始系"] },
    { id: "STOP", name: "停止", categoryPath: ["操作", "運転"] },
    { id: "PING", name: "疎通確認" },
  ]);
  expect(result.model?.transitions).toEqual([
    {
      fromStateId: "IDLE",
      eventId: "START",
      action: "開始を記録する",
      targetStateId: "RUNNING",
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
      targetStateId: "IDLE",
    },
  ]);
});
