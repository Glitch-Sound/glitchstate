import { expect, type Page, test } from "@playwright/test";
import type { GlsModel } from "../../src/core";
import { DIAGRAM_CONFIG as c } from "../../src/webview/pages/preview/model/diagram-config";
import { assertArrowheadFollowsPath } from "./arrowhead-direction";

const model: GlsModel = {
  states: ["Z", "A", "B", "X", "C", "D", "E", "F"].map((id) => ({
    id,
    name: `状態${id}`,
    meaning: `意味${id}`,
    color: "#22C55E",
  })),
  events: [
    { id: "E0", name: "単独" },
    { id: "E1", name: "開始", categoryPath: ["操作", "運転", "要求"] },
    { id: "E2", name: "停止", categoryPath: ["通信"] },
  ],
  eventCategoryHeaders: ["系統", "区分", "種別"],
  stateGroups: [{ id: "G", name: "稼働系", stateIds: ["B", "A"] }],
  transitions: [
    { fromStateId: "A", eventId: "E0", action: "A開始", targetStateId: "X" },
    { fromStateId: "B", eventId: "E0", action: "B記録", targetStateId: "A" },
    { fromStateId: "Z", eventId: "E0", action: "Z記録", targetStateId: "B" },
    { fromStateId: "A", eventId: "E2", action: null, targetStateId: "A" },
    {
      fromStateId: "B",
      eventId: "E1",
      commonAction: "共通",
      branches: [
        { condition: "可能", action: "実行", targetStateId: "X" },
        { condition: "保留", action: null, targetStateId: null },
      ],
    },
  ],
};
const repaired: GlsModel = {
  ...model,
  states: [...model.states].reverse().map((s) => ({
    ...s,
    name: `修正${s.id}`,
    meaning: `新しい意味${s.id}`,
    color: "#AA4488",
  })),
  events: model.events.map((e) => ({
    ...e,
    name: `新${e.name}`,
    ...(e.categoryPath
      ? { categoryPath: e.categoryPath.map((v) => `新${v}`) }
      : {}),
  })),
  eventCategoryHeaders: ["領域", "用途", "詳細"],
  stateGroups: [{ id: "G", name: "復旧系", stateIds: ["A", "X"] }],
  transitions: [
    { fromStateId: "A", eventId: "E0", action: "再開処理", targetStateId: "B" },
    {
      fromStateId: "X",
      eventId: "E1",
      commonAction: "復旧共通",
      branches: [
        { condition: "修復可能", action: "修復する", targetStateId: "Z" },
        { condition: "再試行", action: null, targetStateId: "X" },
      ],
    },
    { fromStateId: "A", eventId: "E2", action: "復旧記録", targetStateId: "Z" },
  ],
};
const diagram = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
const canvas = (page: Page) => diagram(page).locator(".state-diagram-canvas");
const control = (page: Page, name: string) =>
  diagram(page).getByRole("button", { name, exact: true });
const selected = (page: Page, id: string) =>
  page.locator(`.state-table tr[data-state-id="${id}"] button`);
const empty: GlsModel = { states: [], events: [], transitions: [] };

async function start(page: Page) {
  await page.addInitScript(() => {
    const notices: { type: string; sequence?: number; version?: number }[] = [];
    const snapshots: unknown[] = [];
    const pending = new Map<ResizeObserver, () => void>();
    let held = false;
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          if (held) pending.set(observer, () => callback(entries, observer));
          else callback(entries, observer);
        });
      }
    };
    Object.assign(window, {
      notices,
      snapshots,
      holdMeasurements: () => {
        held = true;
      },
      pendingMeasurements: () => pending.size,
      releaseMeasurements: () => {
        held = false;
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback();
      },
      acquireVsCodeApi: () => ({
        postMessage: (message: {
          type: string;
          sequence?: number;
          version?: number;
        }) => {
          notices.push(message);
          if (message.type === "glitchstate.rendered") {
            const viewport = document.querySelector(".react-flow__viewport");
            snapshots.push({
              sequence: message.sequence,
              transform: viewport ? getComputedStyle(viewport).transform : null,
              names: Array.from(
                document.querySelectorAll(".state-node-label"),
                (el) => el.textContent,
              ),
            });
          }
        },
      }),
    });
  });
  await page.goto("/");
  await theme(page, false);
}
async function theme(page: Page, light: boolean) {
  await page.evaluate((light) => {
    for (const [name, value] of Object.entries({
      "--vscode-editor-background": light ? "#ffffff" : "#1e1e1e",
      "--vscode-foreground": light ? "#222222" : "#cccccc",
      "--vscode-button-background": light ? "#0060c0" : "#0e639c",
      "--vscode-button-foreground": "#ffffff",
      "--vscode-focusBorder": "#007fd4",
      "--vscode-panel-border": "#888888",
    }))
      document.documentElement.style.setProperty(name, value);
  }, light);
}
async function measurements(
  page: Page,
  action: "holdMeasurements" | "releaseMeasurements",
) {
  await page.evaluate(
    (action) => (window as unknown as Record<string, () => void>)[action](),
    action,
  );
}
async function send(
  page: Page,
  next: unknown = model,
  sequence = 1,
  uri = "file:///a.gls",
  hasErrors = false,
  version = sequence,
) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri,
    model: next,
    sequence,
    version,
    hasErrors,
  });
}
async function notices(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          notices: { type: string; sequence?: number; version?: number }[];
        }
      ).notices,
  );
}
async function show(
  page: Page,
  next: GlsModel | null = model,
  sequence = 1,
  uri = "file:///a.gls",
  hasErrors = false,
  version = sequence,
) {
  await send(page, next, sequence, uri, hasErrors, version);
  await expect
    .poll(async () =>
      (await notices(page))
        .filter((n) => n.type === "glitchstate.rendered")
        .map((n) => n.sequence),
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
async function view(page: Page) {
  return canvas(page).evaluate((el) => {
    const viewport = el.querySelector(".react-flow__viewport");
    if (!viewport) throw new Error("表示範囲がない");
    const m = new DOMMatrix(getComputedStyle(viewport).transform);
    return {
      x: m.e,
      y: m.f,
      zoom: m.a,
      width: el.clientWidth,
      height: el.clientHeight,
    };
  });
}
type View = Awaited<ReturnType<typeof view>>;
function center(v: View) {
  return { x: (v.width / 2 - v.x) / v.zoom, y: (v.height / 2 - v.y) / v.zoom };
}
async function assertView(page: Page, expected: View) {
  await expect
    .poll(async () => {
      const actual = await view(page);
      return Math.max(
        Math.abs(actual.x - expected.x),
        Math.abs(actual.y - expected.y),
        Math.abs(actual.zoom - expected.zoom),
      );
    })
    .toBeLessThan(0.001);
}
async function percentage(page: Page) {
  const actual = await view(page);
  await expect(
    diagram(page).getByLabel("表示倍率", { exact: true }),
  ).toHaveText(`${Math.round(actual.zoom * 100)}%`);
}
async function pan(page: Page) {
  await canvas(page).scrollIntoViewIfNeeded();
  const b = await canvas(page).boundingBox();
  if (!b) throw new Error("図がない");
  const before = await view(page);
  await page.mouse.move(b.x + b.width - 20, b.y + b.height - 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 100, b.y + b.height - 50, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await view(page)).x).not.toBe(before.x);
  await settle(page);
}
async function operate(page: Page) {
  await control(page, "拡大").click();
  await pan(page);
  return view(page);
}
async function assertFit(page: Page) {
  const region = await canvas(page).boundingBox();
  if (!region) throw new Error("図がない");
  for (const el of await diagram(page)
    .locator(".react-flow__node,.state-edge-path")
    .all()) {
    const b = await el.boundingBox();
    if (!b) throw new Error("要素がない");
    expect(b.x).toBeGreaterThanOrEqual(region.x - 1);
    expect(b.y).toBeGreaterThanOrEqual(region.y - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(region.x + region.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(region.y + region.height + 1);
  }
  await percentage(page);
}
async function contents(page: Page, expected: GlsModel) {
  await expect(page.locator(".state-table tbody button")).toHaveText(
    expected.states.map((s) => s.name),
  );
  await expect(page.locator(".state-meaning")).toHaveText(
    expected.states.map((s) => s.meaning),
  );
  await expect(diagram(page).locator(".state-node")).toHaveCount(
    expected.states.length,
  );
  for (const s of expected.states) {
    await expect(
      page.locator(`.state-table tr[data-state-id="${s.id}"] rect`),
    ).toHaveAttribute("fill", s.color);
    await expect(
      diagram(page).locator(
        `.react-flow__node[data-id="${s.id}"] .state-node-label`,
      ),
    ).toHaveText(s.name);
  }
  await expect(diagram(page).locator(".state-group-label")).toHaveText(
    (expected.stateGroups ?? []).map((g) => g.name),
  );
  await expect(page.locator(".transition-table thead th")).toHaveText([
    ...(expected.eventCategoryHeaders ?? []),
    "イベント",
    ...expected.states.map((s) => s.name),
  ]);
  const rows = page.locator(".transition-table tbody tr");
  await expect(rows).toHaveCount(expected.events.length);
  const name = (id: string | null) =>
    id === null ? "-" : (expected.states.find((s) => s.id === id)?.name ?? "");
  for (const [i, e] of expected.events.entries()) {
    const row = rows.nth(i);
    await expect(row).toHaveAttribute("data-event-id", e.id);
    await expect(row.locator("th[scope=row]")).toHaveText(e.name);
    const cells = row.locator("td[headers]");
    await expect(cells).toHaveCount(expected.states.length);
    for (const [j, s] of expected.states.entries()) {
      const t = expected.transitions.find(
        (t) => t.eventId === e.id && t.fromStateId === s.id,
      );
      const cell = cells.nth(j);
      if (!t) await expect(cell).toHaveText("未定義");
      else if ("branches" in t) {
        await expect(cell.locator(".transition-common")).toHaveText(
          t.commonAction ?? "-",
        );
        await expect(cell.locator(".branch-condition")).toHaveText(
          t.branches.map((b) => b.condition),
        );
        await expect(cell.locator(".branch-action")).toHaveText(
          t.branches.map((b) => b.action ?? "-"),
        );
        await expect(cell.locator(".branch-target")).toHaveText(
          t.branches.map((b) => name(b.targetStateId)),
        );
      } else
        await expect(cell.locator(":scope > *")).toHaveText([
          t.action ?? "-",
          name(t.targetStateId),
        ]);
    }
  }
  for (const value of new Set(
    expected.events.flatMap((e) => e.categoryPath ?? []),
  ))
    await expect(
      page
        .locator(".event-category")
        .filter({ hasText: new RegExp(`^${value}$`) })
        .first(),
    ).toBeVisible();
}
async function pairs(page: Page, expected: string[]) {
  expect(
    await diagram(page)
      .locator(".react-flow__edge")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-id")).sort()),
  ).toEqual([...expected].sort());
  for (const path of await diagram(page).locator(".state-edge-path").all())
    await assertArrowheadFollowsPath(path);
}
async function geometry(page: Page) {
  return diagram(page)
    .locator(".react-flow__node,.state-edge-path")
    .evaluateAll((els) =>
      els.map((el) => [
        el.getAttribute("data-id"),
        (el as HTMLElement).style.transform,
        (el as HTMLElement).style.width,
        (el as HTMLElement).style.height,
        el.getAttribute("d"),
      ]),
    );
}

test("REQ-038-S01 REQ-038-S02 操作の順序と実際の倍率、中心、内容と選択を保つ", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await assertFit(page);
  await expect(diagram(page).getByRole("button")).toHaveText([
    "-",
    "Reset",
    "+",
    "⇩",
  ]);
  for (const name of ["縮小", "等倍", "拡大"])
    await expect(control(page, name)).toHaveCount(1);
  const toolbar = await diagram(page)
    .getByRole("group", { name: "図の表示操作" })
    .boundingBox();
  const box = await canvas(page).boundingBox();
  expect(toolbar && box && toolbar.y + toolbar.height <= box.y).toBe(true);
  await selected(page, "A").click();
  await pan(page);
  const before = await view(page);
  const shape = await geometry(page);
  const tableSizes = await page
    .locator(".state-table,.transition-table")
    .evaluateAll((els) => els.map((el) => [el.clientWidth, el.clientHeight]));
  for (const [name, delta] of [
    ["拡大", c.zoomStep],
    ["縮小", -c.zoomStep],
  ] as const) {
    const previous = await view(page);
    await control(page, name).click();
    const after = await view(page);
    expect(after.zoom).toBeCloseTo(previous.zoom + delta, 5);
    expect(center(after).x).toBeCloseTo(center(previous).x, 2);
    expect(center(after).y).toBeCloseTo(center(previous).y, 2);
    await percentage(page);
  }
  await assertView(page, before);
  expect(await geometry(page)).toEqual(shape);
  expect(
    await page
      .locator(".state-table,.transition-table")
      .evaluateAll((els) => els.map((el) => [el.clientWidth, el.clientHeight])),
  ).toEqual(tableSizes);
  await expect(selected(page, "A")).toHaveAttribute("aria-pressed", "true");
  await contents(page, model);
  await pairs(page, ["A:A", "B:A", "Z:B", "state-group:G:X"]);
});
test("REQ-038-S03 設定した上下限はボタンとホイールで共通にする", async ({
  page,
}) => {
  await start(page);
  await show(page);
  for (let i = 0; i < Math.ceil((c.maxZoom - c.minZoom) / c.zoomStep) + 2; i++)
    await control(page, "拡大").click();
  expect((await view(page)).zoom).toBe(c.maxZoom);
  await canvas(page).hover();
  await page.mouse.wheel(0, -3000);
  await settle(page);
  expect((await view(page)).zoom).toBe(c.maxZoom);
  for (let i = 0; i < Math.ceil((c.maxZoom - c.minZoom) / c.zoomStep) + 2; i++)
    await control(page, "縮小").click();
  expect((await view(page)).zoom).toBe(c.minZoom);
  await canvas(page).hover();
  await page.mouse.wheel(0, 3000);
  await settle(page);
  expect((await view(page)).zoom).toBe(c.minZoom);
  await percentage(page);
});
test("REQ-038-S04 TabとEnterとSpaceは一度だけ倍率を変える", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await selected(page, "F").focus();
  const original = await view(page);
  for (const [name, key] of [
    ["縮小", "Enter"],
    ["等倍", "Space"],
    ["拡大", "Enter"],
  ] as const) {
    const before = await view(page);
    await page.keyboard.press("Tab");
    await expect(control(page, name)).toBeFocused();
    await assertView(page, before);
    await expect(control(page, name)).toHaveCSS("outline-style", "solid");
    await page.keyboard.press(key);
    const expected =
      name === "縮小"
        ? before.zoom - c.zoomStep
        : name === "等倍"
          ? 1
          : before.zoom + c.zoomStep;
    expect((await view(page)).zoom).toBeCloseTo(expected, 5);
    await percentage(page);
  }
  expect((await view(page)).zoom).not.toBe(original.zoom);
});
test("REQ-038-S05 ドラッグとホイールを維持し表示倍率を追従させる", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const before = await view(page);
  await pan(page);
  expect((await view(page)).zoom).toBe(before.zoom);
  await canvas(page).hover();
  await page.mouse.wheel(0, -200);
  await expect
    .poll(async () => (await view(page)).zoom)
    .toBeGreaterThan(before.zoom);
  await settle(page);
  await percentage(page);
});
for (const next of [empty, null])
  test(`REQ-038-S06 図がない場合は操作部を作らない: ${next === null ? "解析エラー" : "空"}`, async ({
    page,
  }) => {
    await start(page);
    await show(page, next, 1, "file:///a.gls", next === null);
    await expect(diagram(page).getByRole("button")).toHaveCount(0);
    await expect(page.getByLabel("表示倍率", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").first()).toBeVisible();
  });
test("REQ-038-S07 計測中の操作を受け付けない", async ({ page }) => {
  await start(page);
  await measurements(page, "holdMeasurements");
  await send(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { pendingMeasurements(): number }
        ).pendingMeasurements(),
      ),
    )
    .toBeGreaterThan(0);
  for (const name of ["縮小", "等倍", "拡大"])
    await expect(control(page, name)).toBeDisabled();
  expect(
    (await notices(page)).filter((n) => n.type === "glitchstate.rendered"),
  ).toEqual([]);
  await measurements(page, "releaseMeasurements");
  await expect(control(page, "拡大")).toBeEnabled();
  await control(page, "拡大").click();
  await percentage(page);
});
for (const light of [false, true])
  test(`REQ-038-S08 明暗テーマで操作とフォーカスを表示する: ${light}`, async ({
    page,
  }) => {
    await start(page);
    await theme(page, light);
    await show(page);
    await selected(page, "F").focus();
    await page.keyboard.press("Tab");
    await expect(control(page, "縮小")).toBeFocused();
    await expect(control(page, "縮小")).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
    await expect(control(page, "縮小")).toHaveCSS(
      "background-color",
      light ? "rgb(0, 96, 192)" : "rgb(14, 99, 156)",
    );
    await expect(control(page, "縮小")).toHaveCSS(
      "outline-color",
      "rgb(0, 127, 212)",
    );
    await expect(control(page, "図をエクスポート")).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
    await expect(control(page, "図をエクスポート")).toHaveCSS(
      "background-color",
      light ? "rgb(0, 96, 192)" : "rgb(14, 99, 156)",
    );
    await control(page, "図をエクスポート").focus();
    await expect(control(page, "図をエクスポート")).toHaveCSS(
      "outline-color",
      "rgb(0, 127, 212)",
    );
    await contents(page, model);
  });
for (const above of [false, true])
  test(`REQ-039-S01 REQ-039-S02 Resetは全体表示へ戻さず現在の中心で100%にする: 拡大後=${above}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    const initial = await view(page);
    expect(initial.zoom).toBeLessThan(1);
    if (above) {
      await control(page, "等倍").click();
      await control(page, "拡大").click();
      expect((await view(page)).zoom).toBeGreaterThan(1);
    }
    await pan(page);
    const before = await view(page);
    await control(page, "等倍").click();
    const after = await view(page);
    expect(after.zoom).toBe(1);
    expect(center(after).x).toBeCloseTo(center(before).x, 2);
    expect(center(after).y).toBeCloseTo(center(before).y, 2);
    await percentage(page);
    await control(page, "等倍").click();
    await assertView(page, after);
  });
for (const initial of ["図", "空", "解析エラー"] as const)
  test(`REQ-040-S01 初めて表示できる現在の図を収める: ${initial}`, async ({
    page,
  }) => {
    await start(page);
    if (initial !== "図")
      await show(
        page,
        initial === "空" ? empty : null,
        1,
        "file:///a.gls",
        initial === "解析エラー",
      );
    await show(page, model, initial === "図" ? 1 : 2);
    await contents(page, model);
    await assertFit(page);
  });
const edits: { name: string; next: GlsModel; edges: string[] }[] = [
  {
    name: "名前と意味とカラー",
    next: { ...model, states: repaired.states.slice().reverse() },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "状態追加",
    next: {
      ...model,
      states: [
        ...model.states,
        { id: "H", name: "追加H", meaning: "追加した状態", color: "#0088FF" },
      ],
    },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "状態削除",
    next: { ...model, states: model.states.filter((s) => s.id !== "F") },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "定義順",
    next: { ...model, states: [...model.states].reverse() },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "所属",
    next: { ...model, stateGroups: repaired.stateGroups },
    edges: ["A:A", "A:X", "B:A", "B:X", "Z:B"],
  },
  {
    name: "グループ追加",
    next: {
      ...model,
      stateGroups: [
        ...(model.stateGroups ?? []),
        { id: "H", name: "追加枠", stateIds: ["Z", "C"] },
      ],
    },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "グループ除去",
    next: { ...model, stateGroups: [] },
    edges: ["A:A", "A:X", "B:A", "B:X", "Z:B"],
  },
  {
    name: "分類と見出し",
    next: {
      ...model,
      events: repaired.events,
      eventCategoryHeaders: repaired.eventCategoryHeaders,
    },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "処理と条件",
    next: {
      ...model,
      transitions: model.transitions.map((t) =>
        "branches" in t
          ? {
              ...t,
              commonAction: "新共通",
              branches: t.branches.map((b) => ({
                ...b,
                condition: `新${b.condition}`,
                action: "新分岐処理",
              })),
            }
          : { ...t, action: "新処理" },
      ),
    },
    edges: ["A:A", "B:A", "Z:B", "state-group:G:X"],
  },
  {
    name: "遷移先と分岐",
    next: { ...model, transitions: repaired.transitions },
    edges: ["A:B", "A:Z", "X:X", "X:Z"],
  },
];
for (const edit of edits)
  test(`REQ-040-S02 配置が変わる編集も現在の内容へ更新して範囲を保つ: ${edit.name}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    await selected(page, "A").click();
    const before = await operate(page);
    await show(page, edit.next, 2);
    await assertView(page, before);
    await contents(page, edit.next);
    await pairs(page, edit.edges);
    await expect(selected(page, "A")).toHaveAttribute("aria-pressed", "true");
  });
test("REQ-040-S03 正常、参照エラーで保持と追加操作、異なる現在の内容へ回復する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await selected(page, "A").click();
  await operate(page);
  await show(page, model, 2, "file:///a.gls", true);
  await expect(page.getByRole("alert")).toBeVisible();
  await contents(page, model);
  const before = await operate(page);
  await show(page, repaired, 3);
  await assertView(page, before);
  await contents(page, repaired);
  await pairs(page, ["A:B", "X:X", "state-group:G:Z"]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(selected(page, "A")).toHaveAttribute("aria-pressed", "true");
});
test("REQ-040-S04 状態0件から再追加しても表示範囲を保つ", async ({ page }) => {
  await start(page);
  await show(page);
  const before = await operate(page);
  await show(page, empty, 2);
  await expect(diagram(page).getByRole("button")).toHaveCount(0);
  await show(page, repaired, 3);
  await assertView(page, before);
  await contents(page, repaired);
});
for (const kind of ["同じ図", "異なる図", "正常表示なし"] as const)
  test(`REQ-040-S05 別URIと元URIへの復帰で全体表示から始める: ${kind}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    const initial = await view(page);
    await operate(page);
    const next =
      kind === "同じ図" ? model : kind === "異なる図" ? repaired : null;
    await show(page, next, 2, "file:///b.gls", next === null);
    if (next) {
      await contents(page, next);
      await assertFit(page);
    } else {
      await expect(diagram(page)).toHaveCount(0);
      await expect(page.getByRole("alert")).toBeVisible();
    }
    await show(page, model, 3);
    await assertView(page, initial);
    await assertFit(page);
  });
for (const command of [false, true])
  test(`REQ-040-S06 小さい版番号の現在の内容でも範囲を保つ: コマンド=${command}`, async ({
    page,
  }) => {
    await start(page);
    await show(page, model, 1, "file:///a.gls", false, 9);
    const before = await operate(page);
    await show(page, repaired, 2, "file:///a.gls", false, command ? 1 : 2);
    await assertView(page, before);
    await contents(page, repaired);
    expect(
      (await notices(page))
        .filter((n) => n.type === "glitchstate.rendered")
        .map((n) => [n.sequence, n.version]),
    ).toContainEqual([2, command ? 1 : 2]);
  });
test("REQ-040-S07 拒否する通知と遅れた計測完了で現在の範囲と内容を戻さない", async ({
  page,
}) => {
  await start(page);
  await show(page, model, 5);
  const before = await operate(page);
  await send(page, repaired, 4, "file:///b.gls");
  await settle(page);
  await assertView(page, before);
  await contents(page, model);
  await send(page, { ...model, states: [model.states[0]] }, 6, "file:///b.gls");
  await settle(page);
  await assertView(page, before);
  await contents(page, model);
  await measurements(page, "holdMeasurements");
  await send(page, repaired, 7);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { pendingMeasurements(): number }
        ).pendingMeasurements(),
      ),
    )
    .toBeGreaterThan(0);
  const latest = {
    ...repaired,
    states: repaired.states.map((s) => ({ ...s, name: `最新${s.id}` })),
  };
  await send(page, latest, 8);
  await expect(diagram(page).locator(".state-node-label").first()).toHaveText(
    "最新F",
  );
  await measurements(page, "releaseMeasurements");
  await expect
    .poll(async () =>
      (await notices(page))
        .filter((n) => n.type === "glitchstate.rendered")
        .map((n) => n.sequence),
    )
    .toContain(8);
  await assertView(page, before);
  await contents(page, latest);
  const sequences = (await notices(page))
    .filter((n) => n.type === "glitchstate.rendered")
    .map((n) => n.sequence);
  for (const rejected of [4, 6, 7]) expect(sequences).not.toContain(rejected);
  const snapshots = await page.evaluate(
    () =>
      (
        window as unknown as {
          snapshots: { sequence: number; transform: string; names: string[] }[];
        }
      ).snapshots,
  );
  const current = snapshots.filter((s) => s.sequence === 8);
  expect(current).toHaveLength(1);
  expect(current[0].names).toEqual(latest.states.map((s) => s.name));
  const m = current[0].transform
    .match(/matrix\(([^)]+)\)/)?.[1]
    .split(",")
    .map(Number);
  expect(m?.[0]).toBeCloseTo(before.zoom, 5);
  expect(m?.[4]).toBeCloseTo(before.x, 2);
  expect(m?.[5]).toBeCloseTo(before.y, 2);
});
test("REQ-040-S08 新しいWebviewでは過去の倍率と位置を復元しない", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const initial = await view(page);
  await operate(page);
  await page.reload();
  await theme(page, false);
  await show(page);
  await assertView(page, initial);
  await assertFit(page);
});
test("REQ-040-S09 表示操作と選択だけでは内容と描画完了を変えない", async ({
  page,
}) => {
  await start(page);
  await show(page, model, 1, "file:///a.gls", true);
  await selected(page, "A").click();
  const before = await notices(page);
  const shape = await geometry(page);
  const tables = await page
    .locator(".state-table,.transition-table")
    .evaluateAll((els) =>
      els.map((el) => [el.textContent, el.clientWidth, el.clientHeight]),
    );
  for (const name of ["拡大", "縮小", "等倍"]) {
    await control(page, name).click();
    await expect(selected(page, "A")).toHaveAttribute("aria-pressed", "true");
  }
  await pan(page);
  const current = await view(page);
  await selected(page, "B").click();
  await selected(page, "B").click();
  await assertView(page, current);
  await expect(selected(page, "A")).toHaveAttribute("aria-pressed", "false");
  await settle(page);
  expect(await notices(page)).toEqual(before);
  expect(await geometry(page)).toEqual(shape);
  expect(
    await page
      .locator(".state-table,.transition-table")
      .evaluateAll((els) =>
        els.map((el) => [el.textContent, el.clientWidth, el.clientHeight]),
      ),
  ).toEqual(tables);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("REQ-040-S10 領域サイズ変更で全体を収め直し、その後の編集で新しい範囲を保つ", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await operate(page);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect
    .poll(async () => {
      try {
        await assertFit(page);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const resized = await view(page);
  await show(page, repaired, 2);
  await assertView(page, resized);
  await contents(page, repaired);
  await pairs(page, ["A:B", "X:X", "state-group:G:Z"]);
});
