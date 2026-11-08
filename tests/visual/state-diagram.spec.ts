import { expect, type Locator, type Page, test } from "@playwright/test";
import type { GlsModel } from "../../src/core";

const states = [
  { id: "Z_IDLE", name: "待機", meaning: "待つ", color: "#4F46E5" },
  { id: "A_RUN", name: "実行中", meaning: "走る", color: "#22C55E" },
];
const events = [
  { id: "START", name: "開始要求" },
  { id: "RETRY", name: "再試行" },
];
const transition = {
  fromStateId: "Z_IDLE",
  eventId: "START",
  action: "開始を記録する",
  targetStateId: "A_RUN",
};
const model: GlsModel = { states, events, transitions: [transition] };
const diagram = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
const nodes = (page: Page) => diagram(page).locator(".react-flow__node");
const node = (page: Page, id: string) =>
  diagram(page).locator(`.react-flow__node[data-id="${id}"]`);
const edges = (page: Page) => diagram(page).locator(".state-edge-path");
const edge = (page: Page, from: string, to: string) =>
  diagram(page).locator(
    `.react-flow__edge[data-id="${from}:${to}"] .state-edge-path`,
  );
const stateTable = (page: Page) =>
  page.getByRole("table", { name: "状態定義", exact: true });
const transitionTable = (page: Page) =>
  page.getByRole("table", { name: "状態遷移表", exact: true });

async function start(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      glsMessages: [] as unknown[],
      glsRenderSnapshots: [] as unknown[],
      acquireVsCodeApi: () => ({
        postMessage: (value: unknown) => {
          (window as unknown as { glsMessages: unknown[] }).glsMessages.push(
            value,
          );
          if ((value as { type?: string }).type === "glitchstate.rendered") {
            (
              window as unknown as { glsRenderSnapshots: unknown[] }
            ).glsRenderSnapshots.push({
              sequence: (value as { sequence: number }).sequence,
              names: Array.from(
                document.querySelectorAll(".state-node-label"),
              ).map((n) => n.textContent),
              edges: Array.from(
                document.querySelectorAll(".state-edge-path"),
              ).map((n) => ({
                id: n.id,
                length: (n as SVGPathElement).getTotalLength(),
              })),
            });
          }
        },
      }),
    });
  });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      "--vscode-foreground",
      "#cccccc",
    );
    document.documentElement.style.setProperty(
      "--vscode-editor-background",
      "#1e1e1e",
    );
  });
}
async function update(
  page: Page,
  next: GlsModel | null = model,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///a.gls",
) {
  await page.evaluate(
    (data) => {
      Object.assign(window, {
        glsSentSequence: Math.max(
          (window as unknown as { glsSentSequence?: number }).glsSentSequence ??
            0,
          data.sequence,
        ),
      });
      window.postMessage(data, "*");
    },
    {
      type: "glitchstate.update",
      uri,
      model: next,
      sequence,
      hasErrors,
      version,
    },
  );
}
async function bounds(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  if (!result) throw new Error("描画領域がない");
  return result;
}
async function pathInfo(path: Locator) {
  return path.evaluate((element) => {
    const path = element as SVGPathElement;
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error("SVGの座標変換がない");
    const first = path.getPointAtLength(0).matrixTransform(matrix);
    const last = path
      .getPointAtLength(path.getTotalLength())
      .matrixTransform(matrix);
    const marker = path.getAttribute("marker-end") ?? "";
    const id = marker.match(/#([^)'"]+)/)?.[1];
    return {
      length: path.getTotalLength(),
      first: { x: first.x, y: first.y },
      last: { x: last.x, y: last.y },
      markerExists:
        !!id &&
        !!document.getElementById(id)?.querySelector("path, polygon, polyline"),
    };
  });
}
async function assertArrow(page: Page, from: string, to: string) {
  const sequence = await page.evaluate(
    () => (window as unknown as { glsSentSequence: number }).glsSentSequence,
  );
  await waitAck(page, sequence);
  const path = edge(page, from, to);
  await expect(path).toBeAttached();
  await expect
    .poll(async () => (await pathInfo(path)).length)
    .toBeGreaterThan(0);
  const info = await pathInfo(path);
  expect(info.markerExists).toBe(true);
  const source = await bounds(node(page, from));
  const target = await bounds(node(page, to));
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  for (const [point, box] of [
    [info.first, source],
    [info.last, target],
  ] as const) {
    expect(point.x).toBeGreaterThanOrEqual(box.x - 2);
    expect(point.x).toBeLessThanOrEqual(box.x + box.width + 2);
    expect(point.y).toBeGreaterThanOrEqual(box.y - 2);
    expect(point.y).toBeLessThanOrEqual(box.y + box.height + 2);
  }
}

test("REQ-014-S01 2表の間に指定色と名前の図を表示する", async ({ page }) => {
  await start(page);
  await update(page);
  await expect(nodes(page)).toHaveText(["待機", "実行中"]);
  await expect(node(page, "Z_IDLE").locator(".state-node-label")).toHaveCSS(
    "color",
    "rgb(79, 70, 229)",
  );
  await expect(node(page, "A_RUN").locator(".state-node-label")).toHaveCSS(
    "color",
    "rgb(34, 197, 94)",
  );
  const boxes = await Promise.all([
    bounds(stateTable(page)),
    bounds(diagram(page)),
    bounds(transitionTable(page)),
  ]);
  expect(boxes[0].y + boxes[0].height).toBeLessThan(boxes[1].y);
  expect(boxes[1].y + boxes[1].height).toBeLessThan(boxes[2].y);
});
test("REQ-014-S02 同名の状態をIDで区別して接続する", async ({ page }) => {
  await start(page);
  await update(page, {
    ...model,
    states: states.map((s) => ({ ...s, name: "待機" })),
    transitions: [
      transition,
      { ...transition, fromStateId: "A_RUN", targetStateId: "Z_IDLE" },
    ],
  });
  await expect(nodes(page)).toHaveText(["待機", "待機"]);
  await assertArrow(page, "Z_IDLE", "A_RUN");
  await assertArrow(page, "A_RUN", "Z_IDLE");
});
for (const variant of ["状態だけ", "イベントあり", "孤立状態あり"] as const) {
  test(`REQ-014-S03 遷移に現れない状態を表示する: ${variant}`, async ({
    page,
  }) => {
    await start(page);
    await update(page, {
      states,
      events: variant === "状態だけ" ? [] : events,
      transitions:
        variant === "孤立状態あり"
          ? [{ ...transition, targetStateId: "Z_IDLE" }]
          : [],
    });
    await expect(nodes(page)).toHaveText(["待機", "実行中"]);
    await expect(edges(page)).toHaveCount(variant === "孤立状態あり" ? 1 : 0);
  });
}
for (const remainingEvents of [[], events]) {
  test(`REQ-014-S04 有効な状態0件で古い図を消す: ${remainingEvents.length}`, async ({
    page,
  }) => {
    await start(page);
    await update(page);
    await expect(edges(page)).toHaveCount(1);
    await update(
      page,
      { states: [], events: remainingEvents, transitions: [] },
      2,
    );
    await expect(nodes(page)).toHaveCount(0);
    await expect(edges(page)).toHaveCount(0);
    await expect(diagram(page).getByRole("status")).toHaveText(
      "状態が定義されていない。",
    );
    await expect(diagram(page)).not.toContainText("待機");
  });
}
test("REQ-014-S05 名前のHTMLを実行しない", async ({ page }) => {
  const names = [
    "<script>window.glsDiagramExecuted = true</script>",
    "<b>待機</b>",
  ];
  await start(page);
  await update(page, {
    ...model,
    states: states.map((s, i) => ({ ...s, name: names[i] })),
  });
  await expect(nodes(page)).toHaveText(names);
  await expect(diagram(page).locator("script, b")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { glsDiagramExecuted?: boolean })
          .glsDiagramExecuted,
    ),
  ).toBeUndefined();
});
test("REQ-015-S01 始点と終点に対応する矢印だけをラベルなしで描く", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await expect(edges(page)).toHaveCount(1);
  await assertArrow(page, "Z_IDLE", "A_RUN");
  for (const label of ["開始要求", "START", "開始を記録する"])
    await expect(diagram(page)).not.toContainText(label);
});
for (const [action, target, count] of [
  [null, "A_RUN", 1],
  ["記録", null, 0],
  [null, null, 0],
  [undefined, undefined, 0],
] as const) {
  test(`REQ-015-S02 処理${action}と遷移先${target}を表示でも区別する`, async ({
    page,
  }) => {
    await start(page);
    await update(page, {
      ...model,
      transitions:
        target === undefined
          ? []
          : [{ ...transition, action, targetStateId: target }],
    });
    await expect(nodes(page)).toHaveCount(2);
    await expect(edges(page)).toHaveCount(count);
    if (count) await assertArrow(page, "Z_IDLE", "A_RUN");
  });
}
test("REQ-015-S03 イベントが異なる同じ向きの矢印を1本にする", async ({
  page,
}) => {
  await start(page);
  await update(page, {
    ...model,
    transitions: [
      transition,
      { ...transition, eventId: "RETRY", action: "再試行を記録" },
    ],
  });
  await expect(edges(page)).toHaveCount(1);
  await assertArrow(page, "Z_IDLE", "A_RUN");
  await expect(transitionTable(page).locator(".transition-action")).toHaveText([
    "開始を記録する",
    "再試行を記録",
  ]);
});
test("REQ-015-S04 自己ループをノードの外側へ描く", async ({ page }) => {
  await start(page);
  await update(page, {
    ...model,
    transitions: [
      { ...transition, targetStateId: "Z_IDLE" },
      { ...transition, eventId: "RETRY", targetStateId: "Z_IDLE" },
    ],
  });
  await expect(edges(page)).toHaveCount(1);
  await assertArrow(page, "Z_IDLE", "Z_IDLE");
  const pathBox = await bounds(edge(page, "Z_IDLE", "Z_IDLE"));
  const nodeBox = await bounds(node(page, "Z_IDLE"));
  expect(pathBox.y).toBeLessThan(nodeBox.y);
  expect(pathBox.height).toBeGreaterThan(0);
});
test("REQ-015-S05 相互遷移を異なる経路で描く", async ({ page }) => {
  await start(page);
  await update(page, {
    ...model,
    transitions: [
      transition,
      { ...transition, fromStateId: "A_RUN", targetStateId: "Z_IDLE" },
    ],
  });
  await expect(edges(page)).toHaveCount(2);
  await assertArrow(page, "Z_IDLE", "A_RUN");
  await assertArrow(page, "A_RUN", "Z_IDLE");
  const midpoints = await edges(page).evaluateAll((elements) =>
    elements.map((element) => {
      const p = element as SVGPathElement;
      const point = p.getPointAtLength(p.getTotalLength() / 2);
      return { x: point.x, y: point.y };
    }),
  );
  expect(
    Math.hypot(
      midpoints[0].x - midpoints[1].x,
      midpoints[0].y - midpoints[1].y,
    ),
  ).toBeGreaterThan(1);
});

test("REQ-016-S01 線と矢尻へ共通の淡い設定色を使う", async ({ page }) => {
  await start(page);
  await update(page, {
    ...model,
    transitions: [
      transition,
      { ...transition, fromStateId: "A_RUN", targetStateId: "A_RUN" },
    ],
  });
  await expect(edges(page)).toHaveCount(2);
  const expectedColor = await diagram(page).evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--diagram-edge-color)";
    element.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  for (const path of await edges(page).all())
    await expect(path).toHaveCSS("stroke", expectedColor);
  await expect(diagram(page).locator("marker path")).toHaveCSS(
    "fill",
    expectedColor,
  );
  expect(expectedColor).not.toBe("rgb(79, 70, 229)");
  expect(expectedColor).not.toBe("rgb(204, 204, 204)");
});

async function assertInside(page: Page) {
  const canvas = await bounds(diagram(page).locator(".state-diagram-canvas"));
  expect(canvas).not.toBeNull();
  for (const item of await diagram(page)
    .locator(".react-flow__node, .state-edge-path")
    .all()) {
    const box = await bounds(item);
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(canvas.x);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  }
}
test("REQ-014-S01 長い名前と折り返した行、自己ループを表示範囲へ収める", async ({
  page,
}) => {
  await start(page);
  const manyStates = Array.from({ length: 6 }, (_, i) => ({
    ...states[0],
    id: `S${i}`,
    name: i === 0 ? "長い名前".repeat(40) : `状態${i}`,
  }));
  await update(page, {
    states: manyStates,
    events,
    transitions: [{ ...transition, fromStateId: "S0", targetStateId: "S0" }],
  });
  await expect(nodes(page)).toHaveCount(6);
  await assertArrow(page, "S0", "S0");
  await expect
    .poll(async () => {
      const a = await bounds(node(page, "S0"));
      const b = await bounds(node(page, "S4"));
      return b.y - (a.y + a.height);
    })
    .toBeGreaterThan(0);
  await assertInside(page);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect
    .poll(async () => {
      try {
        await assertInside(page);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
  await expect(
    diagram(page).locator(
      ".react-flow__controls, .react-flow__minimap, .react-flow__node.selected",
    ),
  ).toHaveCount(0);
  const before = await node(page, "S0").getAttribute("style");
  const nodeBounds = await bounds(node(page, "S0"));
  await page.mouse.click(
    nodeBounds.x + nodeBounds.width / 2,
    nodeBounds.y + nodeBounds.height / 2,
  );
  await expect(node(page, "S0")).not.toHaveClass(
    /selected|draggable|connectable/,
  );
  expect(await node(page, "S0").getAttribute("style")).toBe(before);
});
test("REQ-014-S04 状態0件から増減しても図を準備する", async ({ page }) => {
  await start(page);
  await update(page, { states: [], events: [], transitions: [] });
  await expect(diagram(page).getByRole("status")).toBeVisible();
  await update(page, model, 2);
  await expect(nodes(page)).toHaveCount(2);
  await assertArrow(page, "Z_IDLE", "A_RUN");
  await update(
    page,
    {
      states: [states[0]],
      events,
      transitions: [{ ...transition, targetStateId: "Z_IDLE" }],
    },
    3,
  );
  await expect(nodes(page)).toHaveCount(1);
  await assertArrow(page, "Z_IDLE", "Z_IDLE");
  await assertInside(page);
});

async function assertViews(page: Page, names: string[], pairs: string[]) {
  await expect(nodes(page)).toHaveText(names);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText(
    names,
  );
  await expect(transitionTable(page).getByRole("columnheader")).toHaveText([
    "イベント",
    ...names,
  ]);
  await expect(edges(page)).toHaveCount(pairs.length);
  expect(
    await diagram(page)
      .locator(".react-flow__edge")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-id")).sort(),
      ),
  ).toEqual([...pairs].sort());
}
const edited: GlsModel = {
  ...model,
  states: [{ ...states[0], name: "修正後", color: "#FF8800" }, states[1]],
  transitions: [
    { ...transition, action: "修正後の処理", targetStateId: "Z_IDLE" },
  ],
};
const third = {
  id: "THIRD",
  name: "追加状態",
  color: "#0088FF",
  meaning: "追加",
};
const duplicates: GlsModel = {
  ...model,
  transitions: [
    transition,
    { ...transition, eventId: "RETRY", action: "再試行の処理" },
  ],
};
for (const change of [
  {
    title: "名前とカラー",
    before: model,
    after: { ...model, states: edited.states },
    names: ["修正後", "実行中"],
    pairs: ["Z_IDLE:A_RUN"],
  },
  {
    title: "状態追加",
    before: model,
    after: { ...model, states: [...states, third] },
    names: ["待機", "実行中", "追加状態"],
    pairs: ["Z_IDLE:A_RUN"],
  },
  {
    title: "状態削除",
    before: { ...model, states: [...states, third] },
    after: model,
    names: ["待機", "実行中"],
    pairs: ["Z_IDLE:A_RUN"],
  },
  {
    title: "遷移先変更",
    before: model,
    after: {
      ...model,
      transitions: [{ ...transition, targetStateId: "Z_IDLE" }],
    },
    names: ["待機", "実行中"],
    pairs: ["Z_IDLE:Z_IDLE"],
  },
  {
    title: "遷移なし",
    before: model,
    after: { ...model, transitions: [{ ...transition, targetStateId: null }] },
    names: ["待機", "実行中"],
    pairs: [],
  },
  {
    title: "最後の定義を削除",
    before: model,
    after: { ...model, transitions: [] },
    names: ["待機", "実行中"],
    pairs: [],
  },
  {
    title: "重複の1件を削除",
    before: duplicates,
    after: model,
    names: ["待機", "実行中"],
    pairs: ["Z_IDLE:A_RUN"],
  },
  {
    title: "遷移なしから自己遷移",
    before: { ...model, transitions: [{ ...transition, targetStateId: null }] },
    after: {
      ...model,
      transitions: [{ ...transition, targetStateId: "Z_IDLE" }],
    },
    names: ["待機", "実行中"],
    pairs: ["Z_IDLE:Z_IDLE"],
  },
  {
    title: "イベントと処理だけ",
    before: model,
    after: {
      ...model,
      events: [{ ...events[0], name: "変更イベント" }, events[1]],
      transitions: [{ ...transition, action: "変更処理" }],
    },
    names: ["待機", "実行中"],
    pairs: ["Z_IDLE:A_RUN"],
  },
]) {
  test(`REQ-017-S01 同じ通知の3表示を更新する: ${change.title}`, async ({
    page,
  }) => {
    await start(page);
    await update(page, change.before);
    await expect(nodes(page)).toHaveCount(change.before.states.length);
    await update(page, change.after, 2);
    await assertViews(page, change.names, change.pairs);
    if (change.title === "名前とカラー") {
      await expect(node(page, "Z_IDLE").locator(".state-node-label")).toHaveCSS(
        "color",
        "rgb(255, 136, 0)",
      );
      await expect(stateTable(page).locator("rect").first()).toHaveAttribute(
        "fill",
        "#FF8800",
      );
      await expect(
        transitionTable(page).getByRole("columnheader").nth(1),
      ).toHaveCSS("color", "rgb(255, 136, 0)");
    }
    if (change.title === "イベントと処理だけ") {
      await expect(transitionTable(page).getByRole("rowheader")).toHaveText([
        "変更イベント",
        "再試行",
      ]);
      await expect(
        transitionTable(page).locator(".transition-action"),
      ).toHaveText(["変更処理"]);
    }
  });
}
test("REQ-017-S02 参照エラーの通知で正常な3表示を保つ", async ({ page }) => {
  await start(page);
  await update(page);
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  await update(page, model, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  await expect(transitionTable(page).locator(".transition-action")).toHaveText([
    "開始を記録する",
  ]);
  await expect(transitionTable(page).locator(".transition-target")).toHaveText([
    "実行中",
  ]);
});
test("REQ-017-S03 正常表示、参照エラーで保持、異なる名前と処理と遷移先へ修正する", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  await update(page, model, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  await expect(transitionTable(page).locator(".transition-action")).toHaveText([
    "開始を記録する",
  ]);
  await update(page, edited, 3);
  await assertViews(page, ["修正後", "実行中"], ["Z_IDLE:Z_IDLE"]);
  await assertArrow(page, "Z_IDLE", "Z_IDLE");
  await expect(transitionTable(page).locator(".transition-action")).toHaveText([
    "修正後の処理",
  ]);
  await expect(transitionTable(page).locator(".transition-target")).toHaveText([
    "修正後",
  ]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});
test("REQ-017-S04 正常な内容のない別文書へ切り替えたら以前の3表示を消す", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  await update(page, null, 2, true, 1, "file:///b.gls");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "解析エラーのため表示できない。",
  );
  await expect(diagram(page)).toHaveCount(0);
  await expect(stateTable(page)).toHaveCount(0);
  await expect(transitionTable(page)).toHaveCount(0);
});
test("REQ-017-S08 対象外の編集がプレビュー通知を出さない間は3表示を保つ", async ({
  page,
}) => {
  await start(page);
  await update(page);
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  // Extensionで対象外の編集が除外される通知境界を再現する。
  await page.evaluate(() =>
    window.postMessage({ type: "editor.changed", uri: "file:///b.gls" }, "*"),
  );
  await assertViews(page, ["待機", "実行中"], ["Z_IDLE:A_RUN"]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

async function holdNodeMeasurements(page: Page) {
  await page.addInitScript(() => {
    const Native = window.ResizeObserver;
    const pending: (() => void)[] = [];
    let hold = true;
    for (const property of ["offsetWidth", "offsetHeight"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        property,
      );
      const original = descriptor?.get;
      if (!original) throw new Error("寸法を取得できない");
      Object.defineProperty(HTMLElement.prototype, property, {
        configurable: true,
        get() {
          return hold && this.classList.contains("react-flow__node")
            ? 0
            : original.call(this);
        },
      });
    }
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          if (
            hold &&
            entries.some((entry) =>
              entry.target.classList.contains("react-flow__node"),
            )
          )
            pending.push(() => callback(entries, observer));
          else callback(entries, observer);
        });
      }
    };
    Object.assign(window, {
      releaseGlsMeasurements: () => {
        hold = false;
        for (const callback of pending.splice(0)) callback();
      },
      pendingGlsMeasurements: () => pending.length,
    });
  });
}
async function ackSequences(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { glsMessages: { type: string; sequence: number }[] }
    ).glsMessages
      .filter((m) => m.type === "glitchstate.rendered")
      .map((m) => m.sequence),
  );
}
async function releaseMeasurements(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { releaseGlsMeasurements(): void }
    ).releaseGlsMeasurements(),
  );
}
async function waitAck(page: Page, sequence: number) {
  await expect.poll(() => ackSequences(page)).toContain(sequence);
}
test("REQ-017-S07 計測前に完了を送らず準備中の編集を最初の図に使う", async ({
  page,
}) => {
  await holdNodeMeasurements(page);
  await start(page);
  await update(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { pendingGlsMeasurements(): number }
        ).pendingGlsMeasurements(),
      ),
    )
    .toBeGreaterThan(0);
  expect(await ackSequences(page)).toEqual([]);
  await update(page, edited, 2);
  await expect(nodes(page)).toHaveText(["修正後", "実行中"]);
  expect(await ackSequences(page)).toEqual([]);
  await releaseMeasurements(page);
  await waitAck(page, 2);
  expect(await ackSequences(page)).not.toContain(1);
  await assertViews(page, ["修正後", "実行中"], ["Z_IDLE:Z_IDLE"]);
  const snapshots = await page.evaluate(
    () =>
      (
        window as unknown as {
          glsRenderSnapshots: {
            sequence: number;
            names: string[];
            edges: { id: string; length: number }[];
          }[];
        }
      ).glsRenderSnapshots,
  );
  expect(
    snapshots.every(
      (s) =>
        s.sequence === 2 &&
        s.names.join(",") === "修正後,実行中" &&
        s.edges.length === 1 &&
        s.edges[0].id === "Z_IDLE:Z_IDLE" &&
        s.edges[0].length > 0,
    ),
  ).toBe(true);
});
test("REQ-017-S05 古い通知と遅れた計測完了でも新しい図を保つ", async ({
  page,
}) => {
  await holdNodeMeasurements(page);
  await start(page);
  await update(page, model, 1, false, 9);
  await expect(nodes(page)).toHaveCount(2);
  await update(page, edited, 2, false, 1);
  await expect(nodes(page)).toHaveText(["修正後", "実行中"]);
  await releaseMeasurements(page);
  await waitAck(page, 2);
  await update(page, model, 1, true, 9);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await assertViews(page, ["修正後", "実行中"], ["Z_IDLE:Z_IDLE"]);
  expect(await ackSequences(page)).not.toContain(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
for (const next of [
  null,
  { states: [], events: [], transitions: [] },
] as const) {
  test(`REQ-014-S04 ノードのない結果でも描画完了する: ${next === null ? "解析エラー" : "空モデル"}`, async ({
    page,
  }) => {
    await start(page);
    await update(page, next, 1, next === null);
    await waitAck(page, 1);
    await expect(nodes(page)).toHaveCount(0);
    await expect(edges(page)).toHaveCount(0);
  });
}

for (const [operation, version] of [
  ["自動更新", 2],
  ["コマンド再実行", 1],
] as const) {
  test(`REQ-017-S06 小さい版番号でも3表示を更新する: ${operation}`, async ({
    page,
  }) => {
    await start(page);
    await update(page, model, 1, false, 9);
    await waitAck(page, 1);
    await update(page, edited, 2, false, version);
    await waitAck(page, 2);
    await assertViews(page, ["修正後", "実行中"], ["Z_IDLE:Z_IDLE"]);
    await assertArrow(page, "Z_IDLE", "Z_IDLE");
    await expect(
      transitionTable(page).locator(".transition-action"),
    ).toHaveText(["修正後の処理"]);
    await expect(
      transitionTable(page).locator(".transition-target"),
    ).toHaveText(["修正後"]);
    await update(page, model, 1, true, 9);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await assertViews(page, ["修正後", "実行中"], ["Z_IDLE:Z_IDLE"]);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
