import { expect, type Page, test } from "@playwright/test";
import type { GlsModel } from "../../src/core";

const states = [
  { id: "Z_IDLE", name: "待機", meaning: "待つ", color: "#4F46E5" },
  { id: "A_RUN", name: "実行中", meaning: "走る", color: "#22C55E" },
];
const events = [
  { id: "Z_START", name: "開始" },
  { id: "A_STOP", name: "停止" },
];
const transition = {
  fromStateId: "Z_IDLE",
  eventId: "Z_START",
  action: "開始を記録する",
  targetStateId: "A_RUN",
};
const model: GlsModel = { states, events, transitions: [transition] };
const table = (page: Page) =>
  page.getByRole("table", { name: "状態遷移表", exact: true });
const stateTable = (page: Page) =>
  page.getByRole("table", { name: "状態定義", exact: true });

async function start(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      acquireVsCodeApi: () => ({ postMessage: () => {} }),
    });
  });
  await page.goto("/");
}

async function update(
  page: Page,
  nextModel: GlsModel | null = model,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///a.gls",
) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri,
    version,
    sequence,
    model: nextModel,
    hasErrors,
  });
}

function cell(page: Page, row = 0, column = 0) {
  return table(page).locator("tbody tr").nth(row).getByRole("cell").nth(column);
}

const allTransitions = [
  {
    fromStateId: "A_RUN",
    eventId: "A_STOP",
    action: "停止D",
    targetStateId: "A_RUN",
  },
  {
    fromStateId: "Z_IDLE",
    eventId: "A_STOP",
    action: "停止C",
    targetStateId: "Z_IDLE",
  },
  {
    fromStateId: "A_RUN",
    eventId: "Z_START",
    action: "開始B",
    targetStateId: "Z_IDLE",
  },
  {
    fromStateId: "Z_IDLE",
    eventId: "Z_START",
    action: "開始A",
    targetStateId: "A_RUN",
  },
];

test("REQ-010-S01 定義順の軸と全交点を対応付ける", async ({ page }) => {
  await start(page);
  await update(page, { states, events, transitions: allTransitions });
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "イベント",
    "待機",
    "実行中",
  ]);
  await expect(table(page).getByRole("rowheader")).toHaveText(["開始", "停止"]);
  await expect(table(page).locator("tbody tr")).toHaveCount(2);
  for (const [row, column, action, target] of [
    [0, 0, "開始A", "実行中"],
    [0, 1, "開始B", "待機"],
    [1, 0, "停止C", "待機"],
    [1, 1, "停止D", "実行中"],
  ] as const) {
    await expect(cell(page, row, column).locator(":scope > *")).toHaveText([
      action,
      target,
    ]);
  }
  await expect(stateTable(page).getByRole("columnheader")).toHaveText([
    "色",
    "状態",
    "意味",
  ]);
  await expect(stateTable(page).locator("tbody tr td:first-child")).toHaveText([
    "",
    "",
  ]);
  await expect(stateTable(page).locator("rect").nth(0)).toHaveAttribute(
    "fill",
    "#4F46E5",
  );
});

test("REQ-010-S02 同じ表示名でも行列を統合しない", async ({ page }) => {
  await start(page);
  await update(page, {
    states: states.map((state) => ({ ...state, name: "待機" })),
    events: events.map((event) => ({ ...event, name: "要求" })),
    transitions: allTransitions,
  });
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "イベント",
    "待機",
    "待機",
  ]);
  await expect(table(page).getByRole("rowheader")).toHaveText(["要求", "要求"]);
  await expect(table(page).locator("tbody td .transition-action")).toHaveText([
    "開始A",
    "開始B",
    "停止C",
    "停止D",
  ]);
});

test("REQ-010-S03 ヘッダの文字に指定色を使う", async ({ page }) => {
  await start(page);
  await update(page);
  await expect(
    table(page).getByRole("columnheader", { name: "待機", exact: true }),
  ).toHaveCSS("color", "rgb(79, 70, 229)");
  await expect(
    table(page).getByRole("columnheader", { name: "実行中", exact: true }),
  ).toHaveCSS("color", "rgb(34, 197, 94)");
});

test("REQ-011-S01 処理を上段、状態名を下段にラベルなしで表示する", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await expect(cell(page).locator(":scope > *")).toHaveText([
    "開始を記録する",
    "実行中",
  ]);
  const action = await cell(page).locator(".transition-action").boundingBox();
  const target = await cell(page).locator(".transition-target").boundingBox();
  expect(action).not.toBeNull();
  expect(target).not.toBeNull();
  if (!action || !target) throw new Error("処理と遷移先の表示位置が必要");
  expect(target.y).toBeGreaterThanOrEqual(action.y + action.height);
  await expect(cell(page)).not.toContainText("処理");
  await expect(cell(page)).not.toContainText("遷移先");
  await expect(cell(page)).not.toContainText("A_RUN");
});

test("REQ-011-S02 未定義の3セルだけを赤文字にする", async ({ page }) => {
  await start(page);
  await update(page);
  const undefinedCells = table(page).getByRole("cell", {
    name: "未定義",
    exact: true,
  });
  await expect(undefinedCells).toHaveCount(3);
  const configuredRed = await page.evaluate(() => {
    const element = document.createElement("span");
    const region = document.querySelector(".transition-section");
    if (!region) throw new Error("状態遷移表の領域がない");
    const value = getComputedStyle(region).getPropertyValue(
      "--transition-undefined-color",
    );
    if (!value.trim()) throw new Error("未定義色の設定がない");
    element.style.color = value;
    document.body.append(element);
    const color = getComputedStyle(element).color;
    element.remove();
    return color;
  });
  for (const item of await undefinedCells.all()) {
    await expect(item).toHaveText("未定義");
    await expect(item).toHaveCSS("color", configuredRed);
  }
  await expect(cell(page)).toHaveText("開始を記録する実行中");
});

test("REQ-011-S03 文字列を実行せず処理の改行を保つ", async ({ page }) => {
  await start(page);
  await update(page, {
    states: states.map((state) => ({ ...state, name: "<b>確認</b>" })),
    events: events.map((event) => ({ ...event, name: "<b>確認</b>" })),
    transitions: [
      {
        ...transition,
        action: "<script>window.glsExecuted = true</script>\n確認する",
      },
    ],
  });
  await expect(cell(page).locator(".transition-action")).toHaveText(
    "<script>window.glsExecuted = true</script>\n確認する",
  );
  await expect(cell(page).locator(".transition-action")).toHaveCSS(
    "white-space",
    "pre-wrap",
  );
  await expect(table(page).getByRole("rowheader")).toHaveText([
    "<b>確認</b>",
    "<b>確認</b>",
  ]);
  await expect(cell(page).locator(".transition-target")).toHaveText(
    "<b>確認</b>",
  );
  await expect(table(page).locator("script, b")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { glsExecuted?: boolean }).glsExecuted,
    ),
  ).toBeUndefined();
});

test("REQ-011-S04 なし、自状態、未定義を区別する", async ({ page }) => {
  await start(page);
  await update(page, {
    states,
    events,
    transitions: [
      {
        fromStateId: "Z_IDLE",
        eventId: "Z_START",
        action: null,
        targetStateId: "A_RUN",
      },
      {
        fromStateId: "A_RUN",
        eventId: "Z_START",
        action: "記録する",
        targetStateId: null,
      },
      {
        fromStateId: "Z_IDLE",
        eventId: "A_STOP",
        action: null,
        targetStateId: null,
      },
      {
        fromStateId: "A_RUN",
        eventId: "A_STOP",
        action: "記録する",
        targetStateId: "A_RUN",
      },
    ],
  });
  for (const [row, column, action, target] of [
    [0, 0, "-", "実行中"],
    [0, 1, "記録する", "-"],
    [1, 0, "-", "-"],
    [1, 1, "記録する", "実行中"],
  ] as const) {
    await expect(cell(page, row, column).locator(":scope > *")).toHaveText([
      action,
      target,
    ]);
  }
  await expect(table(page).getByText("未定義", { exact: true })).toHaveCount(0);
});

test("REQ-012-S01 状態だけの文書の表を保ちイベント不足を案内する", async ({
  page,
}) => {
  await start(page);
  await update(page, { states, events: [], transitions: [] });
  await expect(stateTable(page).locator("tbody tr")).toHaveCount(2);
  await expect(table(page)).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "状態遷移表", exact: true })
      .getByRole("status"),
  ).toHaveText("イベントが定義されていない。");
});

for (const remainingEvents of [[], events]) {
  test(`REQ-012-S02 状態が0件なら古いセルを消す: events=${remainingEvents.length}`, async ({
    page,
  }) => {
    await start(page);
    await update(page);
    await expect(table(page).locator("tbody td")).toHaveCount(4);
    await update(
      page,
      { states: [], events: remainingEvents, transitions: [] },
      2,
    );
    await expect(table(page)).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "状態遷移表", exact: true })
        .getByRole("status"),
    ).toHaveText("状態が定義されていない。");
    await expect(page.getByText("開始を記録する", { exact: true })).toHaveCount(
      0,
    );
  });
}

test("REQ-013-S01 同じモデルの編集を両方の表に描画する", async ({ page }) => {
  await start(page);
  await update(page);
  await update(
    page,
    {
      states: [{ ...states[1], name: "処理中", color: "#0088FF" }, states[0]],
      events: [events[1], { ...events[0], name: "開始要求" }],
      transitions: [
        { ...transition, action: "変更した処理", targetStateId: "Z_IDLE" },
      ],
    },
    2,
  );
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "処理中",
    "待機",
  ]);
  await expect(stateTable(page).locator("rect").first()).toHaveAttribute(
    "fill",
    "#0088FF",
  );
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "イベント",
    "処理中",
    "待機",
  ]);
  await expect(table(page).getByRole("columnheader").nth(1)).toHaveCSS(
    "color",
    "rgb(0, 136, 255)",
  );
  await expect(table(page).getByRole("rowheader")).toHaveText([
    "停止",
    "開始要求",
  ]);
  await expect(cell(page, 1, 1).locator(":scope > *")).toHaveText([
    "変更した処理",
    "待機",
  ]);
  await expect(cell(page, 0, 0)).toHaveText("未定義");
  await expect(
    table(page).getByText("開始を記録する", { exact: true }),
  ).toHaveCount(0);
});

test("REQ-013-S01 軸と遷移の増減をセルへ反映する", async ({ page }) => {
  await start(page);
  await update(page);
  await update(
    page,
    {
      states: [
        ...states,
        { id: "EXTRA", name: "追加状態", meaning: "追加", color: "#000000" },
      ],
      events: [...events, { id: "EXTRA", name: "追加イベント" }],
      transitions: [
        { ...transition, targetStateId: null },
        {
          fromStateId: "EXTRA",
          eventId: "EXTRA",
          action: null,
          targetStateId: null,
        },
      ],
    },
    2,
  );
  await expect(stateTable(page).locator("tbody tr")).toHaveCount(3);
  await expect(table(page).getByRole("rowheader")).toHaveText([
    "開始",
    "停止",
    "追加イベント",
  ]);
  await expect(table(page).locator("tbody td")).toHaveCount(9);
  await expect(cell(page, 2, 2).locator(":scope > *")).toHaveText(["-", "-"]);
  await update(
    page,
    { states: [states[0]], events: [events[0]], transitions: [] },
    3,
  );
  await expect(stateTable(page).locator("tbody tr")).toHaveCount(1);
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "イベント",
    "待機",
  ]);
  await expect(table(page).getByRole("rowheader")).toHaveText(["開始"]);
  await expect(table(page).locator("tbody td")).toHaveText(["未定義"]);
});

test("REQ-013-S02 エラー案内と同じ正常な両方の表を表示する", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await update(page, model, 2, true);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "待機",
    "実行中",
  ]);
  await expect(cell(page).locator(":scope > *")).toHaveText([
    "開始を記録する",
    "実行中",
  ]);
});

test("REQ-013-S03 別URIの初回エラーで両方の表を消す", async ({ page }) => {
  await start(page);
  await update(page);
  await expect(table(page)).toBeVisible();
  await update(page, null, 2, true, 1, "file:///b.gls");
  await expect(stateTable(page)).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "解析エラーのため表示できない。",
  );
});

const latestModel: GlsModel = {
  states: [{ ...states[0], name: "最新" }, states[1]],
  events,
  transitions: [
    { ...transition, action: "最新の処理", targetStateId: "Z_IDLE" },
  ],
};

test("REQ-013-S04 古い通知と不正な参照で両方の表を上書きしない", async ({
  page,
}) => {
  await start(page);
  await update(page, latestModel, 2);
  await expect(cell(page).locator(".transition-action")).toHaveText(
    "最新の処理",
  );
  await update(page, model, 1, true);
  await update(
    page,
    { ...model, transitions: [{ ...transition, targetStateId: "MISSING" }] },
    3,
    true,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "最新",
    "実行中",
  ]);
  await expect(cell(page).locator(":scope > *")).toHaveText([
    "最新の処理",
    "最新",
  ]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("REQ-013-S06 修正後に両方の表を回復する", async ({ page }) => {
  await start(page);
  await update(page, model, 1);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "待機",
    "実行中",
  ]);
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "イベント",
    "待機",
    "実行中",
  ]);
  await expect(cell(page).locator(":scope > *")).toHaveText([
    "開始を記録する",
    "実行中",
  ]);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await update(page, model, 2, true);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "待機",
    "実行中",
  ]);
  await expect(cell(page).locator(":scope > *")).toHaveText([
    "開始を記録する",
    "実行中",
  ]);

  await update(page, latestModel, 3);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "最新",
    "実行中",
  ]);
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "イベント",
    "最新",
    "実行中",
  ]);
  await expect(cell(page).locator(":scope > *")).toHaveText([
    "最新の処理",
    "最新",
  ]);
});

for (const { operation, version } of [
  { operation: "自動更新", version: 2 },
  { operation: "コマンド再実行", version: 1 },
]) {
  test(`REQ-013-S05 小さい版番号でも両方の表を描画する: ${operation}`, async ({
    page,
  }) => {
    await start(page);
    await update(page, model, 1, false, 9);
    await expect(cell(page).locator(".transition-action")).toHaveText(
      "開始を記録する",
    );
    await update(page, latestModel, 2, false, version);
    await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
      "最新",
      "実行中",
    ]);
    await expect(cell(page).locator(":scope > *")).toHaveText([
      "最新の処理",
      "最新",
    ]);
    await update(page, model, 1, true, 9);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(cell(page).locator(":scope > *")).toHaveText([
      "最新の処理",
      "最新",
    ]);
    await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
      "最新",
      "実行中",
    ]);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
