import { expect, type Locator, type Page, test } from "@playwright/test";
import type { GlsModel } from "../../src/core";

const model: GlsModel = {
  states: [
    { id: "Z", name: "未所属", meaning: "Zの意味", color: "#4F46E5" },
    { id: "A", name: "待機", meaning: "Aの意味", color: "#22C55E" },
    { id: "B", name: "待機", meaning: "Bの意味", color: "#FF8800" },
    { id: "X", name: "外部", meaning: "Xの意味", color: "#0088FF" },
  ],
  events: [
    { id: "E0", name: "単独" },
    { id: "E1", name: "開始", categoryPath: ["操作", "運転", "開始系"] },
    { id: "E2", name: "停止", categoryPath: ["操作", "運転", "停止系"] },
    { id: "E3", name: "点検", categoryPath: ["操作", "保守"] },
    { id: "E4", name: "通信", categoryPath: ["通信"] },
  ],
  eventCategoryHeaders: ["系統", "区分", "種別"],
  stateGroups: [{ id: "A", name: "稼働系", stateIds: ["B", "A"] }],
  transitions: [
    { fromStateId: "Z", eventId: "E0", action: "Zの記録", targetStateId: "A" },
    { fromStateId: "A", eventId: "E0", action: "Aの開始", targetStateId: "X" },
    { fromStateId: "B", eventId: "E0", action: "Bの開始", targetStateId: "A" },
    {
      fromStateId: "A",
      eventId: "E1",
      commonAction: "共通処理",
      branches: [
        { condition: "待つ", action: null, targetStateId: null },
        { condition: "準備完了", action: "開始を記録", targetStateId: "X" },
      ],
    },
    { fromStateId: "B", eventId: "E1", action: "Bの確認", targetStateId: "X" },
    { fromStateId: "A", eventId: "E2", action: null, targetStateId: null },
    { fromStateId: "A", eventId: "E4", action: "再開", targetStateId: "A" },
  ],
};
const stateTable = (page: Page) =>
  page.getByRole("table", { name: "状態定義", exact: true });
const table = (page: Page) =>
  page.getByRole("table", { name: "状態遷移表", exact: true });
const diagram = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
const row = (page: Page, id: string) =>
  stateTable(page).locator(`tbody tr[data-state-id="${id}"]`);
const button = (page: Page, id: string) => row(page, id).getByRole("button");
const node = (page: Page, id: string) =>
  diagram(page).locator(`.react-flow__node[data-id="${id}"] .state-node`);

async function start(page: Page) {
  await page.addInitScript(() =>
    Object.assign(window, {
      selectionMessages: [] as unknown[],
      acquireVsCodeApi: () => ({
        postMessage: (value: unknown) =>
          (
            window as unknown as { selectionMessages: unknown[] }
          ).selectionMessages.push(value),
      }),
    }),
  );
  await page.goto("/");
  await theme(page, false);
}
async function theme(page: Page, light: boolean) {
  await page.evaluate((light) => {
    for (const [name, value] of Object.entries({
      "--vscode-editor-background": light ? "#ffffff" : "#1e1e1e",
      "--vscode-foreground": light ? "#222222" : "#cccccc",
      "--vscode-list-activeSelectionBackground": light ? "#0060c0" : "#264f78",
      "--vscode-panel-border": light ? "#aaaaaa" : "#555555",
      "--vscode-errorForeground": "#d32f2f",
    }))
      document.documentElement.style.setProperty(name, value);
  }, light);
}
async function send(
  page: Page,
  next: unknown,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///a.gls",
) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri,
    sequence,
    version,
    model: next,
    hasErrors,
  });
}
async function messages(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          selectionMessages: {
            type: string;
            sequence?: number;
            version?: number;
          }[];
        }
      ).selectionMessages,
  );
}
async function show(
  page: Page,
  next: GlsModel | null = model,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///a.gls",
) {
  await send(page, next, sequence, hasErrors, version, uri);
  await expect
    .poll(async () =>
      (await messages(page))
        .filter((m) => m.type === "glitchstate.rendered")
        .map((m) => m.sequence),
    )
    .toContain(sequence);
}
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function paint(locator: Locator) {
  return locator.evaluate((element) => {
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      const color = getComputedStyle(current).backgroundColor;
      if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
    }
    return "transparent";
  });
}
// 調整値だけをCSSから受け取り、入力モデルのカラーと標準の色混合で期待値を作る。
async function expectedPaint(page: Page, selected: boolean, color?: string) {
  return page.evaluate(
    ({ selected, color }) => {
      const parent = document.querySelector(
        color ? ".state-diagram-section" : "main",
      );
      if (!parent) throw new Error("背景の参照先がない");
      const background = getComputedStyle(
        document.documentElement,
      ).backgroundColor;
      const base = color
        ? `color-mix(in srgb, ${color} var(--diagram-node-mix), ${background})`
        : background;
      const probe = document.createElement("div");
      probe.style.backgroundColor = selected
        ? `color-mix(in srgb, var(--state-selection-accent) var(--state-selection-mix), ${base})`
        : base;
      parent.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    },
    { selected, color },
  );
}
async function assertSelection(
  page: Page,
  id: string | null,
  expected = model,
) {
  await expect(stateTable(page).getByRole("button")).toHaveCount(
    expected.states.length,
  );
  for (const state of expected.states) {
    const selected = id === state.id;
    await expect(button(page, state.id)).toHaveAttribute(
      "aria-pressed",
      String(selected),
    );
    const background = await expectedPaint(page, selected);
    for (const cell of await row(page, state.id).locator("td").all())
      expect(await paint(cell)).toBe(background);
    expect(await paint(node(page, state.id))).toBe(
      await expectedPaint(page, selected, state.color),
    );
  }
  if (!expected.events.length || !expected.states.length) {
    await expect(table(page)).toHaveCount(0);
    return;
  }
  const headers = table(page).locator("thead th");
  const offset = (await headers.count()) - expected.states.length;
  for (const [column, state] of expected.states.entries()) {
    const background = await expectedPaint(page, id === state.id);
    await expect(headers.nth(offset + column)).toHaveText(state.name);
    expect(await paint(headers.nth(offset + column))).toBe(background);
    for (const tr of await table(page).locator("tbody tr").all()) {
      const cell = tr.locator("td[headers]").nth(column);
      expect(await paint(cell)).toBe(background);
      for (const part of await cell
        .locator(
          ".transition-common,.transition-branch,.branch-condition,.branch-action,.branch-target",
        )
        .all())
        expect(await paint(part)).toBe(background);
    }
  }
}
async function assertContents(page: Page, expected: GlsModel) {
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText(
    expected.states.map((s) => s.name),
  );
  await expect(stateTable(page).locator(".state-meaning")).toHaveText(
    expected.states.map((s) => s.meaning),
  );
  for (const state of expected.states) {
    await expect(row(page, state.id).locator("rect")).toHaveAttribute(
      "fill",
      state.color,
    );
    await expect(node(page, state.id).locator(".state-node-label")).toHaveText(
      state.name,
    );
  }
  const rows = table(page).locator("tbody tr");
  await expect(rows).toHaveCount(expected.events.length);
  for (const [index, event] of expected.events.entries()) {
    const tr = rows.nth(index);
    await expect(tr).toHaveAttribute("data-event-id", event.id);
    await expect(tr.locator('th[scope="row"]')).toHaveText(event.name);
    const cells = tr.locator("td[headers]");
    await expect(cells).toHaveCount(expected.states.length);
    for (const [column, state] of expected.states.entries()) {
      const value = expected.transitions.find(
        (t) => t.fromStateId === state.id && t.eventId === event.id,
      );
      const name = (id: string | null) =>
        id === null ? "-" : expected.states.find((s) => s.id === id)?.name;
      const cell = cells.nth(column);
      if (!value) await expect(cell).toHaveText("未定義");
      else if ("branches" in value) {
        await expect(cell.locator(".transition-common")).toHaveText(
          value.commonAction ?? "-",
        );
        await expect(cell.locator(".branch-condition")).toHaveText(
          value.branches.map((b) => b.condition),
        );
        await expect(cell.locator(".branch-action")).toHaveText(
          value.branches.map((b) => b.action ?? "-"),
        );
        await expect(cell.locator(".branch-target")).toHaveText(
          value.branches.map((b) => name(b.targetStateId) ?? ""),
        );
      } else
        await expect(cell.locator(":scope > *")).toHaveText([
          value.action ?? "-",
          name(value.targetStateId) ?? "",
        ]);
    }
  }
}
async function linesAndColors(page: Page) {
  return page
    .locator(
      ".state-table td,.state-node,.state-node-label,.state-group,.transition-table th,.transition-table td,.transition-branch,.state-edge-path,.diagram-defs marker path",
    )
    .evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return [
          s.color,
          s.borderTop,
          s.borderRight,
          s.borderBottom,
          s.borderLeft,
          s.outline,
          s.boxShadow,
          s.stroke,
          s.fill,
        ];
      }),
    );
}
async function geometry(page: Page) {
  return diagram(page)
    .locator(".react-flow__node,.state-edge-path,.react-flow__viewport")
    .evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return [
          el.getAttribute("data-id"),
          s.transform,
          s.width,
          s.height,
          el.getAttribute("d"),
        ];
      }),
    );
}

test("REQ-034-S01 REQ-034-S02 REQ-034-S03 行内のクリックを1回だけ数え同名状態を切替と解除する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await assertSelection(page, null);
  await expect(stateTable(page).locator("thead th")).toHaveText([
    "色",
    "状態",
    "意味",
  ]);
  await row(page, "A").locator("td").nth(0).click();
  await assertSelection(page, "A");
  await button(page, "A").click();
  await assertSelection(page, null);
  await row(page, "A").locator("td").nth(2).click();
  await assertSelection(page, "A");
  await button(page, "B").click();
  await assertSelection(page, "B");
  await page.keyboard.press("Escape");
  await assertSelection(page, null);
  await assertContents(page, model);
  await expect(row(page, "A").locator("td").nth(0)).toHaveText("");
});

test("REQ-034-S04 TabのフォーカスとEnter、Space、Escapeの選択を区別する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await page.keyboard.press("Tab");
  await expect(button(page, "Z")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(button(page, "A")).toBeFocused();
  await assertSelection(page, null);
  await expect(button(page, "A")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await page.keyboard.press("Enter");
  await assertSelection(page, "A");
  await page.keyboard.press("Tab");
  await expect(button(page, "B")).toBeFocused();
  await assertSelection(page, "A");
  await page.keyboard.press("Space");
  await assertSelection(page, "B");
  await page.keyboard.press("Space");
  await assertSelection(page, null);
  await button(page, "A").click();
  await page.keyboard.press("Escape");
  await assertSelection(page, null);
});

for (const light of [false, true]) {
  test(`REQ-034-S05 明暗テーマで実背景だけを変え色と既存の線を保つ: light=${light}`, async ({
    page,
  }) => {
    await start(page);
    await theme(page, light);
    await show(page);
    const before = await linesAndColors(page);
    const normal = await paint(node(page, "A"));
    await button(page, "A").click();
    await assertSelection(page, "A");
    expect(await paint(node(page, "A"))).not.toBe(normal);
    expect(await linesAndColors(page)).toEqual(before);
    await assertContents(page, model);
  });
}

test("REQ-036-S01 REQ-036-S02 ノードIDだけを強調し同名状態と同じIDの枠と矢印を保つ", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const before = await linesAndColors(page);
  const frame = diagram(page).locator(
    '.react-flow__node[data-id="state-group:A"] .state-group',
  );
  const background = await paint(frame);
  await button(page, "A").click();
  await assertSelection(page, "A");
  expect(await paint(frame)).toBe(background);
  expect(await linesAndColors(page)).toEqual(before);
  await node(page, "B").click({ force: true });
  await frame.click({ force: true });
  await table(page).locator("tbody td[headers]").first().click();
  await assertSelection(page, "A");
  await expect(diagram(page).locator(".react-flow__edge")).toHaveCount(4);
  await button(page, "A").click();
  await assertSelection(page, null);
});

test("REQ-036-S03 手動移動後の選択、切替、解除で図の配置とviewportと通知を変えない", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const canvas = diagram(page).locator(".state-diagram-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("図がない");
  const viewport = diagram(page).locator(".react-flow__viewport");
  const original = await viewport.getAttribute("style");
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 90, box.y + box.height - 50, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(original);
  await settle(page);
  const before = await geometry(page);
  const notices = await messages(page);
  for (const id of ["A", "B", "B"]) {
    await button(page, id).click();
    await settle(page);
    expect(await geometry(page)).toEqual(before);
    expect(await messages(page)).toEqual(notices);
  }
});

test("REQ-037-S01 REQ-037-S02 分類0段と3段と浅い分類、結合と空欄、全セルと全分岐の背景を確認する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await assertContents(page, model);
  const categories = table(page).locator(
    ".event-category,.event-category-header,tbody td:not([headers]),th[scope=row]",
  );
  const before = await categories.evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent,
      rowspan: el.getAttribute("rowspan"),
      colspan: el.getAttribute("colspan"),
      background: getComputedStyle(el).backgroundColor,
    })),
  );
  expect(
    before.filter((v) => v.rowspan).map((v) => [v.text, v.rowspan]),
  ).toEqual([
    ["操作", "3"],
    ["運転", "2"],
    ["開始系", "1"],
    ["停止系", "1"],
    ["保守", "1"],
    ["通信", "1"],
  ]);
  expect(
    before.filter((v) => v.colspan).map((v) => [v.text, v.colspan]),
  ).toEqual([
    ["", "3"],
    ["", "1"],
    ["", "2"],
  ]);
  await button(page, "A").click();
  await assertSelection(page, "A");
  await assertContents(page, model);
  expect(
    await categories.evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent,
        rowspan: el.getAttribute("rowspan"),
        colspan: el.getAttribute("colspan"),
        background: getComputedStyle(el).backgroundColor,
      })),
    ),
  ).toEqual(before);
  const otherTarget = table(page)
    .locator('tr[data-event-id="E0"] td[headers]')
    .nth(2)
    .locator(".transition-target");
  await expect(otherTarget).toHaveText("待機");
  expect(await paint(otherTarget)).toBe(await expectedPaint(page, false));
  await button(page, "A").click();
  await assertSelection(page, null);
});

test("REQ-034-S06 状態0件には選択対象を作らない", async ({ page }) => {
  await start(page);
  await show(page, { states: [], events: [], transitions: [] });
  await expect(stateTable(page).getByRole("button")).toHaveCount(0);
  await expect(diagram(page).locator(".react-flow__node")).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
});
test("REQ-037-S03 イベント0件でも行とノードを選択し表を補わない", async ({
  page,
}) => {
  const next = { ...model, events: [], transitions: [] };
  await start(page);
  await show(page, next);
  await button(page, "A").click();
  await assertSelection(page, "A", next);
  await expect(page.getByRole("status")).toHaveText(
    "イベントが定義されていない。",
  );
});

const repairedModel: GlsModel = {
  ...model,
  states: [
    model.states[2],
    model.states[3],
    model.states[1],
    model.states[0],
  ].map((state) => ({
    ...state,
    name: `修正${state.id}`,
    meaning: `修正した意味${state.id}`,
    color: state.id === "A" ? "#AA4488" : state.color,
  })),
  events: [...model.events].reverse().map((event) => ({
    ...event,
    name: `新${event.name}`,
    ...(event.categoryPath
      ? { categoryPath: event.categoryPath.map((value) => `新${value}`) }
      : {}),
  })),
  eventCategoryHeaders: ["領域", "用途", "詳細"],
  stateGroups: [{ id: "A", name: "復旧枠", stateIds: ["A", "X"] }],
  transitions: [
    {
      fromStateId: "A",
      eventId: "E0",
      action: "再開の記録",
      targetStateId: "B",
    },
    {
      fromStateId: "A",
      eventId: "E1",
      commonAction: "復旧共通",
      branches: [
        { condition: "修復可", action: "復旧実行", targetStateId: "Z" },
        { condition: "保留", action: null, targetStateId: null },
      ],
    },
    { fromStateId: "X", eventId: "E1", action: null, targetStateId: "Z" },
    { fromStateId: "B", eventId: "E0", action: "新B", targetStateId: "A" },
    { fromStateId: "A", eventId: "E2", action: null, targetStateId: null },
    { fromStateId: "Z", eventId: "E4", action: "新Z", targetStateId: "X" },
  ],
};

for (const edit of [
  "名前",
  "カラー",
  "意味",
  "定義順",
  "所属",
  "分類と遷移",
] as const) {
  test(`REQ-035-S01 同じIDの編集を現在の3表示へ反映して保持する: ${edit}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    await button(page, "A").click();
    let next: GlsModel = model;
    if (edit === "名前" || edit === "カラー" || edit === "意味") {
      const key =
        edit === "名前" ? "name" : edit === "カラー" ? "color" : "meaning";
      next = {
        ...model,
        states: model.states.map((state) =>
          state.id === "A"
            ? { ...state, [key]: edit === "カラー" ? "#AA4488" : "変更後の値" }
            : state,
        ),
      };
    }
    if (edit === "定義順")
      next = { ...model, states: [...model.states].reverse() };
    if (edit === "所属")
      next = { ...model, stateGroups: repairedModel.stateGroups };
    if (edit === "分類と遷移")
      next = {
        ...model,
        events: repairedModel.events,
        eventCategoryHeaders: repairedModel.eventCategoryHeaders,
        transitions: repairedModel.transitions,
      };
    await show(page, next, 2);
    await assertSelection(page, "A", next);
    await assertContents(page, next);
  });
}

test("REQ-035-S02 正常選択、参照エラーで保持と操作、以前と異なる全内容へ回復する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await button(page, "A").click();
  await assertSelection(page, "A");
  await show(page, model, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await assertSelection(page, "A");
  await assertContents(page, model);
  await button(page, "B").click();
  await assertSelection(page, "B");
  await button(page, "A").click();
  await assertSelection(page, "A");
  await show(page, repairedModel, 3);
  await assertSelection(page, "A", repairedModel);
  await assertContents(page, repairedModel);
  await expect(table(page).locator("thead th")).toHaveText([
    "領域",
    "用途",
    "詳細",
    "イベント",
    "修正B",
    "修正X",
    "修正A",
    "修正Z",
  ]);
  await expect(diagram(page).locator(".state-group-label")).toHaveText(
    "復旧枠",
  );
  expect(
    await diagram(page)
      .locator(".react-flow__edge")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-id")).sort()),
  ).toEqual(["A:B", "B:A", "Z:X", "state-group:A:Z"]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const edit of ["削除", "ID変更", "全状態除去"] as const) {
  test(`REQ-035-S03 ${edit}で選択を解除して再追加で復元しない`, async ({
    page,
  }) => {
    const states =
      edit === "削除"
        ? model.states.filter((s) => s.id !== "A")
        : edit === "ID変更"
          ? model.states.map((s) => (s.id === "A" ? { ...s, id: "C" } : s))
          : [];
    const next: GlsModel = {
      ...model,
      states,
      transitions: [],
      stateGroups: [],
    };
    await start(page);
    await show(page);
    await button(page, "A").click();
    await show(page, next, 2);
    await assertSelection(page, null, next);
    await show(page, model, 3);
    await assertSelection(page, null);
    await assertContents(page, model);
  });
}

for (const missing of [false, true]) {
  test(`REQ-035-S04 同じIDの別文書と元文書への復帰で解除する: 正常表示なし=${missing}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    await button(page, "A").click();
    const next = {
      ...model,
      states: model.states.map((state) => ({
        ...state,
        name: `別文書${state.id}`,
      })),
    };
    await show(page, missing ? null : next, 2, missing, 1, "file:///b.gls");
    if (missing) {
      await expect(stateTable(page)).toHaveCount(0);
      await expect(diagram(page)).toHaveCount(0);
      await expect(page.getByRole("alert")).toBeVisible();
    } else {
      await assertSelection(page, null, next);
      await assertContents(page, next);
    }
    await show(page, model, 3);
    await assertSelection(page, null);
  });
}

test("REQ-035-S05 拒否する通知で現在の選択と削除後の未選択を変えない", async ({
  page,
}) => {
  await start(page);
  await show(page, model, 5);
  await button(page, "B").click();
  const removed = {
    ...model,
    states: model.states.filter((s) => s.id !== "A"),
    transitions: [],
    stateGroups: [],
  };
  await send(page, removed, 4, false, 1, "file:///b.gls");
  await settle(page);
  await assertSelection(page, "B");
  await assertContents(page, model);
  await send(page, { ...model, states: [model.states[1]] }, 6);
  await settle(page);
  await assertSelection(page, "B");
  await assertContents(page, model);
  expect(
    (await messages(page))
      .filter((m) => m.type === "glitchstate.rendered")
      .map((m) => m.sequence),
  ).not.toContain(6);
  await button(page, "A").click();
  await show(page, removed, 7);
  await assertSelection(page, null, removed);
  await send(page, model, 5);
  await settle(page);
  await assertSelection(page, null, removed);
  await assertContents(page, removed);
});

test("REQ-035-S06 小さい版番号の自動更新と同一URIのコマンド再実行相当の通知で保持する", async ({
  page,
}) => {
  await start(page);
  await show(page, model, 1, false, 9);
  await button(page, "A").click();
  const next = {
    ...model,
    states: model.states.map((s) =>
      s.id === "A" ? { ...s, name: "再オープン後" } : s,
    ),
  };
  await show(page, next, 2, false, 1);
  await assertSelection(page, "A", next);
  await assertContents(page, next);
  await show(page, next, 3, false, 1);
  await assertSelection(page, "A", next);
  expect(
    (await messages(page))
      .filter((m) => m.type === "glitchstate.rendered")
      .map((m) => [m.sequence, m.version]),
  ).toContainEqual([3, 1]);
});

test("REQ-035-S07 Webviewを作り直したら同じURIでも未選択で始める", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await button(page, "A").click();
  await assertSelection(page, "A");
  await page.reload();
  await theme(page, false);
  await show(page);
  await assertSelection(page, null);
});
