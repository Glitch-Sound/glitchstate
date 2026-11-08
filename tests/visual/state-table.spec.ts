import { expect, type Page, test } from "@playwright/test";

const states = [
  { id: "Z_LAST", name: "待機", meaning: "開始を待つ状態", color: "#4F46E5" },
  { id: "A_FIRST", name: "実行中", meaning: "処理中", color: "#22c55e" },
];

async function start(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      glsMessages: [],
      acquireVsCodeApi: () => ({
        postMessage: (message: unknown) => {
          (window as unknown as { glsMessages: unknown[] }).glsMessages.push(
            message,
          );
        },
      }),
    });
  });
  await page.goto("/");
}

async function update(page: Page, nextStates = states, sequence = 1) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri: "file:///a.gls",
    version: sequence,
    sequence,
    model: { states: nextStates },
    hasErrors: false,
  });
}

test("REQ-004-S01 色、状態、意味の列順と指定色だけの色セル", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await expect(page.getByRole("columnheader")).toHaveText([
    "色",
    "状態",
    "意味",
  ]);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("td")).toHaveText([
    "",
    "待機",
    "開始を待つ状態",
  ]);
  await expect(rows.nth(1).locator("td")).toHaveText(["", "実行中", "処理中"]);
  await expect(
    rows.nth(0).locator("td").nth(0).locator("rect"),
  ).toHaveAttribute("fill", "#4F46E5");
  await expect(
    rows.nth(1).locator("td").nth(0).locator("rect"),
  ).toHaveAttribute("fill", "#22c55e");
});

test("REQ-004-S02 空のモデルで古い行を消す", async ({ page }) => {
  await start(page);
  await update(page);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await update(page, [], 2);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("状態が定義されていない。");
});

test("REQ-004-S03 意味を改行付きテキストとして扱う", async ({ page }) => {
  await start(page);
  await update(page, [
    {
      ...states[0],
      meaning: "<script>window.glsExecuted = true</script>\n確認する",
    },
  ]);
  const meaning = page.locator("tbody tr td").nth(2);
  await expect(meaning).toHaveText(
    "<script>window.glsExecuted = true</script>\n確認する",
  );
  await expect(meaning).toHaveCSS("white-space", "pre-wrap");
  await expect(meaning.locator("script")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { glsExecuted?: boolean }).glsExecuted,
    ),
  ).toBeUndefined();
});

test("REQ-005-S01 編集した色見本と各セルを更新する", async ({ page }) => {
  await start(page);
  await update(page);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await update(
    page,
    [
      {
        ...states[1],
        name: "変更後",
        meaning: "変更した意味",
        color: "#FF8800",
      },
    ],
    2,
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr td")).toHaveText([
    "",
    "変更後",
    "変更した意味",
  ]);
  await expect(page.locator("tbody rect")).toHaveAttribute("fill", "#FF8800");
});

test("REQ-005-S03 遅れた古い通知と不正な通知を描画しない", async ({ page }) => {
  await start(page);
  await update(page, [{ ...states[0], name: "最新" }], 2);
  await expect(page.locator("tbody tr td").nth(1)).toHaveText("最新");
  await update(page, [{ ...states[0], name: "古い" }], 1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator("tbody tr td").nth(1)).toHaveText("最新");
  await page.evaluate(() =>
    window.postMessage(
      { type: "glitchstate.update", model: { states: [{}] } },
      "*",
    ),
  );
  await expect(page.locator("tbody tr td").nth(1)).toHaveText("最新");
});

test("REQ-006-S01 正常な表とエラー案内を同時に表示する", async ({ page }) => {
  await start(page);
  await update(page);
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri: "file:///a.gls",
    version: 2,
    sequence: 2,
    model: { states },
    hasErrors: true,
  });
  await expect(page.getByRole("alert")).toHaveText(
    "解析エラーがある。Problemsを確認すること。",
  );
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody tr").nth(0).locator("td")).toHaveText([
    "",
    "待機",
    "開始を待つ状態",
  ]);
});

test("REQ-006-S02 別文書の初回エラーでは表を表示しない", async ({ page }) => {
  await start(page);
  await update(page);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "glitchstate.update",
        uri: "file:///b.gls",
        version: 1,
        sequence: 2,
        model: null,
        hasErrors: true,
      },
      "*",
    ),
  );
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "解析エラーのため表示できない。",
  );
});

test("REQ-006-S03 修正した色見本を表示してエラー案内を消す", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "glitchstate.update",
        uri: "file:///a.gls",
        version: 1,
        sequence: 1,
        model: null,
        hasErrors: true,
      },
      "*",
    ),
  );
  await expect(page.getByRole("alert")).toHaveCount(1);
  await update(page, [{ ...states[0], color: "#0088FF" }], 2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("tbody rect")).toHaveAttribute("fill", "#0088FF");
  await expect(page.locator("tbody td").nth(0)).toHaveText("");
});
