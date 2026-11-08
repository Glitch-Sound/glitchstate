import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { type GlsModel, parseGls } from "../../src/core";

const states = [
  { id: "IDLE", name: "待機", meaning: "待つ", color: "#4F46E5" },
  { id: "RUNNING", name: "実行中", meaning: "走る", color: "#22C55E" },
  { id: "RECOVERED", name: "回復済み", meaning: "回復した", color: "#F97316" },
];
const events = [
  { id: "Z_START", name: "開始", categoryPath: ["操作", "運転"] },
  { id: "A_STOP", name: "停止", categoryPath: ["操作", "運転"] },
  { id: "B_INIT", name: "初期化", categoryPath: ["操作", "保守"] },
];
const model: GlsModel = {
  states,
  events,
  eventCategoryHeaders: ["系統", "区分", "種別"],
  transitions: events.flatMap((event, row) =>
    states.map((state, column) => ({
      fromStateId: state.id,
      eventId: event.id,
      action: `処理${row}-${column}`,
      targetStateId: states[(column + 1) % states.length].id,
    })),
  ),
};
const table = (page: Page) =>
  page.getByRole("table", { name: "状態遷移表", exact: true });
const stateTable = (page: Page) =>
  page.getByRole("table", { name: "状態定義", exact: true });
const graph = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
async function start(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      categoryMessages: [] as unknown[],
      acquireVsCodeApi: () => ({
        postMessage: (message: unknown) =>
          (
            window as unknown as { categoryMessages: unknown[] }
          ).categoryMessages.push(message),
      }),
    });
  });
  await page.goto("/");
}
async function send(
  page: Page,
  next: unknown,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///categories.gls",
) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri,
    sequence,
    version,
    hasErrors,
    model: next,
  });
}
async function ack(page: Page, sequence: number) {
  await expect
    .poll(() =>
      page.evaluate(
        (seq) =>
          (
            window as unknown as {
              categoryMessages: { type: string; sequence?: number }[];
            }
          ).categoryMessages.some(
            (m) => m.type === "glitchstate.rendered" && m.sequence === seq,
          ),
        sequence,
      ),
    )
    .toBe(true);
}
async function show(
  page: Page,
  next: GlsModel = model,
  sequence = 1,
  hasErrors = false,
  version = sequence,
) {
  await send(page, next, sequence, hasErrors, version);
  await ack(page, sequence);
}
async function assertCells(page: Page, next: GlsModel) {
  const rows = table(page).locator("tbody tr");
  await expect(rows).toHaveCount(next.events.length);
  for (const [row, event] of next.events.entries()) {
    const tr = rows.nth(row);
    await expect(tr.locator('th[scope="row"]')).toHaveText(event.name);
    const cells = tr.locator(
      "td:has(.transition-action), td.transition-undefined",
    );
    await expect(cells).toHaveCount(next.states.length);
    for (const [column, state] of next.states.entries()) {
      const transition = next.transitions.find(
        (t) => t.eventId === event.id && t.fromStateId === state.id,
      );
      if (transition) {
        await expect(
          cells.nth(column).locator(".transition-action"),
        ).toHaveText(transition.action ?? "-");
        await expect(
          cells.nth(column).locator(".transition-target"),
        ).toHaveText(
          transition.targetStateId === null
            ? "-"
            : (next.states.find((s) => s.id === transition.targetStateId)
                ?.name ?? ""),
        );
      } else await expect(cells.nth(column)).toHaveText("未定義");
    }
  }
}
test("REQ-020-S01 3段の見出しと分類を別々の列で表示する", async ({ page }) => {
  await start(page);
  const next = {
    ...model,
    events: [{ ...events[0], categoryPath: ["操作", "運転", "開始系"] }],
    transitions: model.transitions.filter((t) => t.eventId === "Z_START"),
  };
  await show(page, next);
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "種別",
    "イベント",
    "待機",
    "実行中",
    "回復済み",
  ]);
  await expect(table(page).locator("tbody th")).toHaveText([
    "操作",
    "運転",
    "開始系",
    "開始",
  ]);
  await expect(table(page)).not.toContainText(/分類[123]/);
  await assertCells(page, next);
});
test("REQ-020-S02 共通の祖先の連続範囲だけを結合する", async ({ page }) => {
  await start(page);
  await show(page);
  const category = table(page).locator("tbody th:not([scope=row])");
  await expect(category).toHaveText(["操作", "運転", "保守"]);
  expect(
    await category.evaluateAll((items) =>
      items.map((item) => (item as HTMLTableCellElement).rowSpan),
    ),
  ).toEqual([3, 2, 1]);
  await assertCells(page, model);
});
test("REQ-020-S03 深さ0、1、3の列位置と交点をそろえ分類除去で既存表示へ戻る", async ({
  page,
}) => {
  await start(page);
  const next = {
    ...model,
    events: [
      { id: "Z_START", name: "単独" },
      { ...events[1], categoryPath: ["業務"] },
      { ...events[2], categoryPath: ["通信", "監視", "障害"] },
    ],
  };
  await show(page, next);
  await expect(
    table(page).locator("tbody tr").nth(0).locator("td[colspan='3']"),
  ).toHaveText("");
  await expect(
    table(page).locator("tbody tr").nth(1).locator("td[colspan='2']"),
  ).toHaveText("");
  await assertCells(page, next);
  const coordinates = await table(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        event: row.querySelector('th[scope="row"]')?.getBoundingClientRect().x,
        cells: Array.from(
          row.querySelectorAll("td:has(.transition-action)"),
        ).map((cell) => cell.getBoundingClientRect().x),
      })),
    );
  for (const row of coordinates) {
    expect(row.event).toBeCloseTo(coordinates[2].event as number, 1);
    expect(row.cells).toEqual(coordinates[2].cells);
  }
  for (const [i, eventCategoryHeaders] of [
    next.eventCategoryHeaders,
    undefined,
  ].entries()) {
    const flat = {
      ...next,
      eventCategoryHeaders,
      events: next.events.map(({ id, name }) => ({ id, name })),
    };
    await show(page, flat, i + 2);
    await expect(table(page).locator("thead th")).toHaveText([
      "イベント",
      "待機",
      "実行中",
      "回復済み",
    ]);
    await assertCells(page, flat);
  }
});
test("REQ-020-S04 同名の子と離れた分類を統合しない", async ({ page }) => {
  await start(page);
  const next = {
    ...model,
    events: events.map((event, i) => ({
      ...event,
      categoryPath: [i === 1 ? "通信" : "業務", "復旧"],
    })),
  };
  await show(page, next);
  await expect(table(page).locator("tbody th:not([scope=row])")).toHaveText([
    "業務",
    "復旧",
    "通信",
    "復旧",
    "業務",
    "復旧",
  ]);
  expect(
    await table(page)
      .locator("tbody th")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLTableCellElement).rowSpan),
      ),
  ).toEqual(Array(9).fill(1));
  await assertCells(page, next);
});
test("REQ-020-S05 分類名と見出しを実行せず文字列として表示する", async ({
  page,
}) => {
  await start(page);
  const path = [
    "<script>window.glsCategoryExecuted = true</script>",
    "<b>監視</b>",
    "A > B",
  ];
  const next = {
    ...model,
    eventCategoryHeaders: ["<b>系統</b>", "区分", "種別"],
    events: [{ ...events[0], categoryPath: path }],
    transitions: model.transitions.filter((t) => t.eventId === "Z_START"),
  };
  await show(page, next);
  await expect(table(page).locator("tbody th")).toHaveText([...path, "開始"]);
  await expect(table(page).locator("thead th").first()).toHaveText(
    "<b>系統</b>",
  );
  await expect(table(page).locator("script, b")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { glsCategoryExecuted?: boolean })
          .glsCategoryExecuted,
    ),
  ).toBeUndefined();
});
test("REQ-020-S06 個別の列見出しだけを表示し未使用段を隠す", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const headers = table(page).locator("thead th");
  await expect(headers).toHaveText([
    "系統",
    "区分",
    "イベント",
    "待機",
    "実行中",
    "回復済み",
  ]);
  expect(
    await headers.evaluateAll((items) =>
      items.map((item) => (item as HTMLTableCellElement).colSpan),
    ),
  ).toEqual([1, 1, 1, 1, 1, 1]);
  await expect(table(page)).not.toContainText("種別");
});

for (const change of [
  "分類名",
  "所属",
  "分類追加",
  "分類除去",
  "宣言順",
  "列見出し",
] as const) {
  test(`REQ-021-S01 REQ-021-S06 未保存の編集でIDの交点を保つ: ${change}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    const next: { -readonly [K in keyof GlsModel]: GlsModel[K] } =
      structuredClone(model);
    if (change === "分類名")
      next.events = [
        { ...events[0], categoryPath: ["業務", "運転"] },
        ...events.slice(1),
      ];
    if (change === "所属")
      next.events = [
        { ...events[0], categoryPath: ["通信", "監視"] },
        ...events.slice(1),
      ];
    if (change === "分類追加") {
      const flat = {
        ...model,
        events: model.events.map(({ id, name }) => ({ id, name })),
      };
      await show(page, flat, 2);
      next.events = [
        { ...events[0], categoryPath: ["操作", "運転", "開始系"] },
        ...events.slice(1),
      ];
    }
    if (change === "分類除去")
      next.events = model.events.map(({ id, name }) => ({ id, name }));
    if (change === "宣言順") next.events = [events[2], events[0], events[1]];
    if (change === "列見出し")
      next.eventCategoryHeaders = ["領域", "用途", "詳細"];
    await show(page, next, 3);
    await assertCells(page, next);
    const expectedPath =
      change === "分類名"
        ? ["業務", "運転"]
        : change === "所属"
          ? ["通信", "監視"]
          : change === "分類追加"
            ? ["操作", "運転", "開始系"]
            : [];
    if (expectedPath.length)
      await expect(
        table(page).locator("tbody tr").first().locator("th:not([scope=row])"),
      ).toHaveText(expectedPath);
    if (change === "分類除去")
      await expect(table(page).locator("thead th")).toHaveText([
        "イベント",
        "待機",
        "実行中",
        "回復済み",
      ]);
    if (change === "列見出し")
      await expect(table(page).locator("thead th")).toHaveText([
        "領域",
        "用途",
        "イベント",
        "待機",
        "実行中",
        "回復済み",
      ]);
    await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
      "待機",
      "実行中",
      "回復済み",
    ]);
    await expect(graph(page).locator(".state-node-label")).toHaveText([
      "待機",
      "実行中",
      "回復済み",
    ]);
    expect(
      await graph(page)
        .locator(".react-flow__edge")
        .evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-id")).sort(),
        ),
    ).toEqual(["IDLE:RUNNING", "RECOVERED:IDLE", "RUNNING:RECOVERED"]);
  });
}
test("REQ-021-S02 正常、分類エラー保持、異なる分類と見出しと3表示へ回復する", async ({
  page,
}) => {
  await start(page);
  const normal = {
    ...model,
    events: [{ ...events[0], categoryPath: ["操作", "運転", "開始系"] }],
    transitions: [{ ...model.transitions[0], action: "記録する" }],
  };
  await show(page, normal);
  await show(page, normal, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "種別",
    "イベント",
    "待機",
    "実行中",
    "回復済み",
  ]);
  await assertCells(page, normal);
  await expect(
    graph(page).locator(
      '.react-flow__edge[data-id="IDLE:RUNNING"] .state-edge-path',
    ),
  ).toBeAttached();
  const repaired = {
    ...normal,
    states: [{ ...states[0], name: "再開待ち" }, ...states.slice(1)],
    events: [{ ...events[0], categoryPath: ["業務", "復旧"] }],
    eventCategoryHeaders: ["領域", "用途"],
    transitions: [
      {
        ...normal.transitions[0],
        action: "再開を記録する",
        targetStateId: "RECOVERED",
      },
    ],
  };
  await show(page, repaired, 3);
  await expect(table(page).locator("thead th")).toHaveText([
    "領域",
    "用途",
    "イベント",
    "再開待ち",
    "実行中",
    "回復済み",
  ]);
  await expect(table(page).locator("tbody th:not([scope=row])")).toHaveText([
    "業務",
    "復旧",
  ]);
  await assertCells(page, repaired);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "再開待ち",
    "実行中",
    "回復済み",
  ]);
  await expect(
    graph(page).locator('.react-flow__node[data-id="IDLE"] .state-node-label'),
  ).toHaveText("再開待ち");
  const edge = graph(page).locator(
    '.react-flow__edge[data-id="IDLE:RECOVERED"] .state-edge-path',
  );
  await expect(edge).toBeAttached();
  expect(
    await edge.evaluate((item) => (item as SVGPathElement).getTotalLength()),
  ).toBeGreaterThan(0);
  await expect(
    graph(page).locator('.react-flow__edge[data-id="IDLE:RUNNING"]'),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("REQ-021-S06 列見出し不足で保ち別の見出しへ修正したら案内を消す", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await show(page, model, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "イベント",
    "待機",
    "実行中",
    "回復済み",
  ]);
  const repaired = { ...model, eventCategoryHeaders: ["領域", "用途"] };
  await show(page, repaired, 3);
  await expect(table(page).locator("thead th")).toHaveText([
    "領域",
    "用途",
    "イベント",
    "待機",
    "実行中",
    "回復済み",
  ]);
  await assertCells(page, repaired);
  await expect(table(page).locator("tbody th:not([scope=row])")).toHaveText([
    "操作",
    "運転",
    "保守",
  ]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("REQ-021-S03 古い通知と不正な分類と見出しを最新の表へ使わない", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const current = {
    ...model,
    eventCategoryHeaders: ["領域", "用途"],
    events: events.map((event) => ({
      ...event,
      categoryPath: ["業務", "復旧"],
    })),
  };
  await show(page, current, 2);
  await send(page, model, 1);
  let sequence = 3;
  const invalidNames: unknown[] = [
    [],
    ["A", "B", "C", "D"],
    [""],
    [" "],
    ['A"B'],
    ["A\nB"],
    [1],
    "A",
    null,
  ];
  const invalidModels = [
    ...invalidNames.map((categoryPath) => ({
      ...current,
      events: [
        { ...current.events[0], categoryPath },
        ...current.events.slice(1),
      ],
    })),
    ...[undefined, ["A"], ...invalidNames].map((eventCategoryHeaders) => ({
      ...current,
      eventCategoryHeaders,
    })),
  ];
  for (const invalid of invalidModels) {
    await send(page, invalid, sequence);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(null)),
          ),
        ),
    );
    await expect(table(page).locator("thead th")).toHaveText([
      "領域",
      "用途",
      "イベント",
      "待機",
      "実行中",
      "回復済み",
    ]);
    await assertCells(page, current);
    expect(
      await page.evaluate(
        (seq) =>
          (
            window as unknown as { categoryMessages: { sequence?: number }[] }
          ).categoryMessages.some((m) => m.sequence === seq),
        sequence,
      ),
    ).toBe(false);
    sequence++;
  }
  await expect(table(page).locator("tbody th:not([scope=row])")).toHaveText([
    "業務",
    "復旧",
  ]);
});
for (const operation of ["自動更新", "コマンド再実行"]) {
  test(`REQ-021-S04 小さい版番号で分類と見出しを描画する: ${operation}`, async ({
    page,
  }) => {
    await start(page);
    await show(page, model, 1, false, 9);
    const reopened = {
      ...model,
      eventCategoryHeaders: ["領域", "用途"],
      events: events.map((event) => ({
        ...event,
        categoryPath: ["業務", "復旧"],
      })),
    };
    await show(page, reopened, 2, false, 2);
    await expect(table(page).locator("thead th")).toHaveText([
      "領域",
      "用途",
      "イベント",
      "待機",
      "実行中",
      "回復済み",
    ]);
    await expect(table(page).locator("tbody th:not([scope=row])")).toHaveText([
      "業務",
      "復旧",
    ]);
    await assertCells(page, reopened);
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              categoryMessages: { sequence?: number; version?: number }[];
            }
          ).categoryMessages.find((m) => m.sequence === 2)?.version,
      ),
    ).toBe(2);
  });
}
test("REQ-021-S05 対象外の編集通知を無視し別文書の初回エラーで古い内容を消す", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "editor.changed",
        uri: "file:///b.gls",
        text: 'EventCategoryHeaders "別文書"',
      },
      "*",
    ),
  );
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "イベント",
    "待機",
    "実行中",
    "回復済み",
  ]);
  await send(page, null, 2, true, 1, "file:///b.gls");
  await ack(page, 2);
  await expect(table(page)).toHaveCount(0);
  await expect(stateTable(page)).toHaveCount(0);
  await expect(graph(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "解析エラーのため表示できない。",
  );
});

test("REQ-020-S01 サンプルを個別の列見出しとIDの交点で表示する", async ({
  page,
}) => {
  const parsed = parseGls(
    readFileSync("examples/event-categories.gls", "utf8"),
  );
  expect(parsed.diagnostics).toEqual([]);
  if (!parsed.model) throw new Error("サンプルを解析できない");
  await start(page);
  await show(page, parsed.model);
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "種別",
    "イベント",
    "待機",
    "実行中",
  ]);
  await expect(table(page).locator('tbody th[scope="row"]')).toHaveText([
    "開始",
    "停止",
    "疎通確認",
  ]);
  await expect(table(page).locator(".transition-action")).toHaveText([
    "開始を記録する",
    "-",
    "応答する",
  ]);
  await assertCells(page, parsed.model);
});
