import { expect, test } from "vitest";
import type { EventDefinition } from "../../src/core";

const event = (id: string, categoryPath?: string[]): EventDefinition => ({
  id,
  name: id,
  ...(categoryPath ? { categoryPath } : {}),
});
const cell = (
  level: number,
  name: string | null,
  rowSpan = 1,
  colSpan = 1,
) => ({ level, name, rowSpan, colSpan });

test("REQ-020-S01 3段の分類をイベント名とは別のセルへ投影する", async () => {
  const { buildEventRows } = await import(
    "../../src/webview/pages/preview/model/build-event-rows"
  );
  const input = [event("Z", ["操作", "運転", "開始系"])];
  expect(buildEventRows(input)).toEqual({
    depth: 3,
    rows: [
      {
        event: input[0],
        categories: [cell(0, "操作"), cell(1, "運転"), cell(2, "開始系")],
      },
    ],
  });
});
test("REQ-020-S02 連続する共通の祖先をそれぞれの長さでまとめる", async () => {
  const { buildEventRows } = await import(
    "../../src/webview/pages/preview/model/build-event-rows"
  );
  const input = [
    event("Z", ["操作", "運転"]),
    event("A", ["操作", "運転"]),
    event("B", ["操作", "保守"]),
  ];
  const before = structuredClone(input);
  expect(buildEventRows(input)).toEqual({
    depth: 2,
    rows: [
      { event: input[0], categories: [cell(0, "操作", 3), cell(1, "運転", 2)] },
      { event: input[1], categories: [] },
      { event: input[2], categories: [cell(1, "保守")] },
    ],
  });
  expect(input).toEqual(before);
});
test("REQ-020-S03 浅い行の空欄と分類なしだけの構成を保つ", async () => {
  const { buildEventRows } = await import(
    "../../src/webview/pages/preview/model/build-event-rows"
  );
  const input = [
    event("Z"),
    event("A", ["業務"]),
    event("B", ["通信", "監視", "障害"]),
  ];
  expect(buildEventRows(input)).toEqual({
    depth: 3,
    rows: [
      { event: input[0], categories: [cell(0, null, 1, 3)] },
      { event: input[1], categories: [cell(0, "業務"), cell(1, null, 1, 2)] },
      {
        event: input[2],
        categories: [cell(0, "通信"), cell(1, "監視"), cell(2, "障害")],
      },
    ],
  });
  expect(buildEventRows([input[0]])).toEqual({
    depth: 0,
    rows: [{ event: input[0], categories: [] }],
  });
});
test("REQ-020-S04 同名の子と離れた経路を並べ替えたり統合したりしない", async () => {
  const { buildEventRows } = await import(
    "../../src/webview/pages/preview/model/build-event-rows"
  );
  const input = [
    event("Z", ["業務", "復旧"]),
    event("A", ["通信", "復旧"]),
    event("B", ["業務", "復旧"]),
  ];
  expect(buildEventRows(input)).toEqual({
    depth: 2,
    rows: [
      { event: input[0], categories: [cell(0, "業務"), cell(1, "復旧")] },
      { event: input[1], categories: [cell(0, "通信"), cell(1, "復旧")] },
      { event: input[2], categories: [cell(0, "業務"), cell(1, "復旧")] },
    ],
  });
});
test("REQ-020-S04 名前に区切りが含まれても経路の境界を区別する", async () => {
  const { buildEventRows } = await import(
    "../../src/webview/pages/preview/model/build-event-rows"
  );
  const input = [event("Z", ["A / B", "C"]), event("A", ["A", "B / C"])];
  expect(buildEventRows(input)).toEqual({
    depth: 2,
    rows: [
      { event: input[0], categories: [cell(0, "A / B"), cell(1, "C")] },
      { event: input[1], categories: [cell(0, "A"), cell(1, "B / C")] },
    ],
  });
});
