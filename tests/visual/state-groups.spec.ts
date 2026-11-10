import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type GlsModel, parseGls } from "../../src/core";
import { DIAGRAM_CONFIG as c } from "../../src/webview/pages/preview/model/diagram-config";

const states = ["A", "U", "B", "C", "X", "Y"].map((id, i) => ({
  id,
  name: `状態${id}`,
  meaning: `意味${id}`,
  color: i % 2 ? "#22C55E" : "#4F46E5",
}));
const plain = (
  fromStateId: string,
  targetStateId: string | null,
  eventId = "START",
) => ({ fromStateId, targetStateId, eventId, action: `処理${fromStateId}` });
const branch = {
  fromStateId: "B",
  eventId: "RETRY",
  commonAction: "共通B",
  branches: [
    { condition: "別", action: "別の処理", targetStateId: "Y" },
    { condition: "一致", action: null, targetStateId: "X" },
  ],
};
const model: GlsModel = {
  states,
  events: [
    { id: "START", name: "開始", categoryPath: ["操作", "運転"] },
    { id: "RETRY", name: "再試行" },
  ],
  eventCategoryHeaders: ["系統", "区分", "種別"],
  stateGroups: [{ id: "G", name: "稼働系", stateIds: ["C", "B", "A"] }],
  transitions: [plain("A", "X"), branch],
};
const diagram = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
const table = (page: Page) =>
  page.getByRole("table", { name: "状態遷移表", exact: true });
const stateTable = (page: Page) =>
  page.getByRole("table", { name: "状態定義", exact: true });
const node = (page: Page, id: string) =>
  diagram(page).locator(`.react-flow__node[data-id="${id}"]`);
const edge = (page: Page, from: string, to: string) =>
  diagram(page).locator(
    `.react-flow__edge[data-id="${from}:${to}"] .state-edge-path`,
  );
const frame = (page: Page, id = "G") =>
  node(page, `state-group:${id}`).locator(".state-group");
const groupLabel = (page: Page, id = "G") =>
  frame(page, id).locator(".state-group-label");

for (const rename of [true, false]) {
  test(`REQ-033-S01 名前だけと所属だけの編集でも図を更新する: rename=${rename}`, async ({
    page,
  }) => {
    await start(page);
    await show(page);
    const next: GlsModel = {
      ...model,
      stateGroups: rename
        ? [{ id: "G", name: "名前だけ変更", stateIds: ["C", "B", "A"] }]
        : [
            { id: "G", name: "稼働系", stateIds: ["A", "C"] },
            { id: "H", name: "移動先", stateIds: ["B", "Y"] },
          ],
    };
    await show(page, next, 2);
    await assertTables(page, model);
    await expect(diagram(page).locator(".state-group-label")).toHaveText(
      rename ? ["名前だけ変更"] : ["稼働系", "移動先"],
    );
    await assertPairs(
      page,
      rename
        ? [
            ["state-group:G", "X"],
            ["B", "Y"],
          ]
        : [
            ["A", "X"],
            ["B", "Y"],
            ["B", "X"],
          ],
    );
    for (const group of next.stateGroups ?? [])
      for (const id of group.stateIds)
        contains(
          await bounds(frame(page, group.id)),
          await bounds(node(page, id)),
        );
  });
}
async function start(page: Page) {
  await page.addInitScript(() =>
    Object.assign(window, {
      glsMessages: [] as unknown[],
      groupSnapshots: [] as unknown[],
      acquireVsCodeApi: () => ({
        postMessage: (value: unknown) => {
          (window as unknown as { glsMessages: unknown[] }).glsMessages.push(
            value,
          );
          if ((value as { type: string }).type === "glitchstate.rendered")
            (
              window as unknown as { groupSnapshots: unknown[] }
            ).groupSnapshots.push({
              ...(value as object),
              labels: Array.from(
                document.querySelectorAll(".state-group-label"),
              ).map((n) => n.textContent),
              boxes: Array.from(
                document.querySelectorAll(".react-flow__node"),
              ).map((n) => ({
                id: n.getAttribute("data-id"),
                box: n.getBoundingClientRect().toJSON(),
              })),
              paths: Array.from(
                document.querySelectorAll(".state-edge-path"),
              ).map((n) => ({
                id: n.closest(".react-flow__edge")?.getAttribute("data-id"),
                length: (n as SVGPathElement).getTotalLength(),
              })),
            });
        },
      }),
    }),
  );
  await page.goto("/");
}
async function send(
  page: Page,
  next: unknown,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///groups.gls",
) {
  await page.evaluate(
    (data) => {
      Object.assign(window, { glsSentSequence: data.sequence });
      window.postMessage(data, "*");
    },
    {
      type: "glitchstate.update",
      uri,
      sequence,
      version,
      model: next,
      hasErrors,
    },
  );
}
async function ackSequences(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        glsMessages: { type: string; sequence?: number }[];
      }
    ).glsMessages
      .filter((m) => m.type === "glitchstate.rendered")
      .map((m) => m.sequence),
  );
}
async function waitAck(page: Page, sequence: number) {
  await expect.poll(() => ackSequences(page)).toContain(sequence);
}
async function show(
  page: Page,
  next: GlsModel | null = model,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///groups.gls",
) {
  await send(page, next, sequence, hasErrors, version, uri);
  await waitAck(page, sequence);
}
async function assertTables(page: Page, expected: GlsModel) {
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText(
    expected.states.map((s) => s.name),
  );
  await expect(stateTable(page).locator(".state-meaning")).toHaveText(
    expected.states.map((s) => s.meaning),
  );
  const depth = Math.max(
    0,
    ...expected.events.map((e) => e.categoryPath?.length ?? 0),
  );
  await expect(table(page).locator("thead th")).toHaveText([
    ...(expected.eventCategoryHeaders ?? []).slice(0, depth),
    "イベント",
    ...expected.states.map((s) => s.name),
  ]);
  await expect(table(page).locator("tbody tr")).toHaveCount(
    expected.events.length,
  );
  for (const [rowIndex, event] of expected.events.entries()) {
    const row = table(page).locator("tbody tr").nth(rowIndex);
    await expect(row).toHaveAttribute("data-event-id", event.id);
    await expect(row.locator('th[scope="row"]')).toHaveText(event.name);
    for (const [column, state] of expected.states.entries()) {
      const cell = row.locator("td[headers]").nth(column);
      const value = expected.transitions.find(
        (t) => t.fromStateId === state.id && t.eventId === event.id,
      );
      const name = (id: string | null) =>
        id === null
          ? "-"
          : (expected.states.find((s) => s.id === id)?.name ?? "");
      if (!value) {
        await expect(cell).toHaveText("未定義");
        await expect(cell).toHaveClass("transition-undefined");
      } else if ("branches" in value) {
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
          value.branches.map((b) => name(b.targetStateId)),
        );
      } else
        await expect(cell.locator(":scope > *")).toHaveText([
          value.action ?? "-",
          name(value.targetStateId),
        ]);
    }
  }
}
async function assertPairs(
  page: Page,
  pairs: readonly (readonly [string, string])[],
  acceptedSequence?: number,
) {
  await expect(diagram(page).locator(".state-edge-path")).toHaveCount(
    pairs.length,
  );
  for (const [from, to] of pairs) {
    await assertArrow(page, from, to, acceptedSequence);
    await assertArrowheadFollowsPath(edge(page, from, to));
  }
}
function contains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(
    outer.y + outer.height + 1,
  );
}
test("REQ-030-S01 REQ-031-S01 REQ-031-S02 実線の所属枠から全メンバーを要求せず外部へ1本を出す", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await expect(frame(page)).toHaveCount(1);
  await expect(groupLabel(page)).toHaveText("稼働系");
  await expect(frame(page)).toHaveCSS("border-top-style", "solid");
  const line = await frame(page).evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--diagram-group-line-width").trim(),
  );
  expect(Number.parseFloat(line)).toBeGreaterThan(0);
  await expect(frame(page)).toHaveCSS("border-top-width", line);
  await expect(frame(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const g = await bounds(frame(page));
  for (const id of ["A", "B", "C"]) contains(g, await bounds(node(page, id)));
  const u = await bounds(node(page, "U"));
  expect(u.y).toBeGreaterThan(g.y + g.height);
  const positions = await Promise.all(
    ["A", "B", "C"].map((id) => bounds(node(page, id))),
  );
  expect(positions[0].x).toBeLessThan(positions[1].x);
  expect(positions[1].x).toBeLessThan(positions[2].x);
  for (const s of states) {
    await expect(node(page, s.id).locator(".state-node-label")).toHaveText(
      s.name,
    );
    await expect(node(page, s.id).locator(".state-node-label")).toHaveCSS(
      "color",
      s.color === "#4F46E5" ? "rgb(79, 70, 229)" : "rgb(34, 197, 94)",
    );
  }
  await assertPairs(page, [
    ["state-group:G", "X"],
    ["B", "Y"],
  ]);
  const p = await pathInfo(edge(page, "state-group:G", "X"));
  expect(
    Math.min(
      Math.abs(p.first.x - g.x),
      Math.abs(p.first.x - g.x - g.width),
      Math.abs(p.first.y - g.y),
      Math.abs(p.first.y - g.y - g.height),
    ),
  ).toBeLessThan(2);
  for (const b of positions)
    expect(
      p.first.x < b.x ||
        p.first.x > b.x + b.width ||
        p.first.y < b.y ||
        p.first.y > b.y + b.height,
    ).toBe(true);
  await expect(edge(page, "A", "X")).toHaveCount(0);
  await expect(edge(page, "B", "X")).toHaveCount(0);
  for (const label of ["START", "RETRY", "共通B", "一致", "別の処理"])
    await expect(diagram(page)).not.toContainText(label);
  expect((await bounds(stateTable(page))).y).toBeLessThan(
    (await bounds(diagram(page))).y,
  );
  expect((await bounds(diagram(page))).y).toBeLessThan(
    (await bounds(table(page))).y,
  );
});
test("REQ-030-S02 REQ-031-S05 同名グループとID衝突、別枠の終点と未所属からの複数矢印を区別する", async ({
  page,
}) => {
  await start(page);
  const next: GlsModel = {
    ...model,
    states: [
      ...states,
      ...["D", "E"].map((id) => ({ ...states[0], id, name: "同名状態" })),
    ],
    stateGroups: [
      { id: "G", name: "<b>稼働系</b>", stateIds: ["A", "B", "C"] },
      { id: "A", name: "<b>稼働系</b>", stateIds: ["X", "Y"] },
      { id: "J", name: "別", stateIds: ["D", "E"] },
    ],
    transitions: [
      plain("A", "X"),
      plain("B", "X"),
      plain("A", "Y", "RETRY"),
      plain("U", "X"),
      plain("U", "Y", "RETRY"),
      plain("D", "X"),
      plain("E", "X"),
    ],
  };
  await show(page, next);
  await expect(diagram(page).locator(".state-group-label")).toHaveText([
    "<b>稼働系</b>",
    "<b>稼働系</b>",
    "別",
  ]);
  await expect(diagram(page).locator("b")).toHaveCount(0);
  await expect(node(page, "A")).toHaveCount(1);
  await expect(node(page, "state-group:A")).toHaveCount(1);
  const g = await bounds(frame(page));
  const h = await bounds(frame(page, "A"));
  expect(h.y).toBeGreaterThan(g.y + g.height);
  const j = await bounds(frame(page, "J"));
  for (const id of ["D", "E"]) {
    await expect(node(page, id)).toHaveCount(1);
    await expect(node(page, id).locator(".state-node-label")).toHaveText(
      "同名状態",
    );
    const state = await bounds(node(page, id));
    contains(j, state);
    for (const other of [g, h])
      expect(
        state.x + state.width <= other.x ||
          state.x >= other.x + other.width ||
          state.y + state.height <= other.y ||
          state.y >= other.y + other.height,
      ).toBe(true);
  }
  await assertPairs(page, [
    ["state-group:G", "X"],
    ["A", "Y"],
    ["U", "X"],
    ["U", "Y"],
    ["state-group:J", "X"],
  ]);
});
test("REQ-030-S03 長い名前と実ループを枠に収め画面から欠落させない", async ({
  page,
}) => {
  await start(page);
  const long = `${"長いグループ名".repeat(70)}末尾の名前`;
  const next = {
    ...model,
    states: states.map((s) =>
      s.id === "A" ? { ...s, name: "長い状態名".repeat(35) } : s,
    ),
    stateGroups: [
      { id: "G", name: long, stateIds: ["A", "B", "C"] },
      { id: "H", name: "別枠", stateIds: ["X", "Y"] },
    ],
    transitions: [plain("A", "A")],
  };
  await show(page, next);
  await expect(groupLabel(page)).toHaveText(long);
  const label = await bounds(groupLabel(page));
  const g = await bounds(frame(page));
  const a = await bounds(node(page, "A"));
  contains(g, label);
  contains(g, a);
  contains(g, await bounds(edge(page, "A", "A")));
  expect(label.y + label.height).toBeLessThan(
    a.y - c.loopExtent * (a.width / c.nodeWidth),
  );
  expect((await bounds(frame(page, "H"))).y).toBeGreaterThan(g.y + g.height);
  const region = await bounds(diagram(page).locator(".state-diagram-canvas"));
  for (const el of await diagram(page)
    .locator(".react-flow__node,.state-edge-path")
    .all())
    contains(region, await bounds(el));
  await assertArrowheadFollowsPath(edge(page, "A", "A"));
  await expect(diagram(page).getByRole("button")).toHaveText([
    "-",
    "Reset",
    "+",
    "⇩",
  ]);
  for (const name of ["縮小", "等倍", "拡大"])
    await expect(
      diagram(page).getByRole("button", { name, exact: true }),
    ).toHaveCount(1);
  await node(page, "A").click({ force: true });
  await expect(diagram(page).locator(".react-flow__node.selected")).toHaveCount(
    0,
  );
});
test("REQ-030-S04 REQ-032-S01 両表の個別セルと分類を保ちグループ除去で元の配置へ戻す", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await assertTables(page, model);
  await expect(table(page).locator(".event-category")).toHaveText([
    "操作",
    "運転",
  ]);
  const next = { ...model, stateGroups: [] };
  await show(page, next, 2);
  await assertTables(page, model);
  await expect(frame(page)).toHaveCount(0);
  await assertPairs(page, [
    ["A", "X"],
    ["B", "Y"],
    ["B", "X"],
  ]);
  const positions = await diagram(page)
    .locator(".react-flow__node")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  const { stateGroups: _, ...legacy } = model;
  await show(page, legacy, 3);
  expect(
    await diagram(page)
      .locator(".react-flow__node")
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
      ),
  ).toEqual(positions);
});
test("REQ-032-S02 グループ付きでも分類なしと3段分類の見出しと結合と全交点を保つ", async ({
  page,
}) => {
  const next: GlsModel = {
    ...model,
    events: [
      { id: "RETRY", name: "再試行" },
      { id: "START", name: "開始", categoryPath: ["操作", "運転", "開始系"] },
      { id: "STOP", name: "停止", categoryPath: ["操作", "運転", "停止系"] },
      { id: "CHECK", name: "点検", categoryPath: ["操作", "保守"] },
      { id: "RESET", name: "初期化", categoryPath: ["通信"] },
    ],
    transitions: [
      { ...plain("A", null, "RETRY"), action: null },
      {
        ...branch,
        commonAction: "再試行の共通処理",
        branches: [
          { condition: "待機", action: null, targetStateId: null },
          { condition: "復旧", action: "復旧を記録", targetStateId: "Y" },
        ],
      },
      { ...plain("A", "X"), action: "Aの開始" },
      { ...plain("B", "Y"), action: null },
      { ...plain("A", "Y", "STOP"), action: "Aの停止" },
      { ...plain("U", null, "STOP"), action: "Uの停止" },
      { ...plain("B", null, "CHECK"), action: null },
      { ...plain("A", "X", "RESET"), action: "Aの初期化" },
    ],
  };
  await start(page);
  for (const [index, current] of [
    next,
    { ...next, stateGroups: [] },
  ].entries()) {
    await show(page, current, index + 1);
    await expect(frame(page)).toHaveCount(index === 0 ? 1 : 0);
    await assertTables(page, next);
    await expect(table(page).locator("thead th")).toHaveText([
      "系統",
      "区分",
      "種別",
      "イベント",
      "状態A",
      "状態U",
      "状態B",
      "状態C",
      "状態X",
      "状態Y",
    ]);
    const rows = table(page).locator("tbody tr");
    expect(
      await rows.evaluateAll((rows) =>
        rows.map((row) =>
          Array.from(
            row.querySelectorAll(
              ":scope > .event-category, :scope > td:not([headers])",
            ),
          ).map((cell) => ({
            text: cell.textContent,
            rowSpan: (cell as HTMLTableCellElement).rowSpan,
            colSpan: (cell as HTMLTableCellElement).colSpan,
          })),
        ),
      ),
    ).toEqual([
      [{ text: "", rowSpan: 1, colSpan: 3 }],
      [
        { text: "操作", rowSpan: 3, colSpan: 1 },
        { text: "運転", rowSpan: 2, colSpan: 1 },
        { text: "開始系", rowSpan: 1, colSpan: 1 },
      ],
      [{ text: "停止系", rowSpan: 1, colSpan: 1 }],
      [
        { text: "保守", rowSpan: 1, colSpan: 1 },
        { text: "", rowSpan: 1, colSpan: 1 },
      ],
      [
        { text: "通信", rowSpan: 1, colSpan: 1 },
        { text: "", rowSpan: 1, colSpan: 2 },
      ],
    ]);
    for (const row of await rows.all())
      await expect(row.locator("td[headers]")).toHaveCount(next.states.length);
  }
});
test("REQ-031-S03 同じ1メンバーの重複では集約しない", async ({ page }) => {
  await start(page);
  await show(page, {
    ...model,
    transitions: [
      plain("A", "X"),
      {
        ...branch,
        fromStateId: "A",
        branches: branch.branches.map((b) => ({ ...b, targetStateId: "X" })),
      },
    ],
  });
  await assertPairs(page, [["A", "X"]]);
});
test("REQ-031-S04 内部と自己遷移、なしを各状態のまま描く", async ({ page }) => {
  await start(page);
  await show(page, {
    ...model,
    transitions: [
      plain("A", "C"),
      plain("B", "C"),
      plain("A", "A", "RETRY"),
      plain("B", null, "RETRY"),
    ],
  });
  await assertPairs(page, [
    ["A", "C"],
    ["B", "C"],
    ["A", "A"],
  ]);
});
test("REQ-031-S06 集約往路と個別復路の実経路と矢尻を区別する", async ({
  page,
}) => {
  await start(page);
  await show(page, {
    ...model,
    transitions: [plain("A", "X"), plain("B", "X"), plain("X", "A")],
  });
  await assertPairs(page, [
    ["state-group:G", "X"],
    ["X", "A"],
  ]);
  const points = await diagram(page)
    .locator(".state-edge-path")
    .evaluateAll((els) =>
      els.map((el) => {
        const p = el as SVGPathElement;
        const point = p.getPointAtLength(p.getTotalLength() / 2);
        return [point.x, point.y];
      }),
    );
  expect(points[0]).not.toEqual(points[1]);
});

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
async function assertArrow(
  page: Page,
  from: string,
  to: string,
  acceptedSequence?: number,
) {
  const sequence =
    acceptedSequence ??
    (await page.evaluate(
      () => (window as unknown as { glsSentSequence: number }).glsSentSequence,
    ));
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

async function assertArrowheadFollowsPath(path: Locator) {
  const direction = await path.evaluate((element) => {
    const curve = element as SVGPathElement;
    const length = curve.getTotalLength();
    const end = curve.getPointAtLength(length);
    // 終端の接線を十分短い区間で近似し、曲線の途中の向きと混同しない。
    const before = curve.getPointAtLength(length - Math.min(1, length / 1000));
    const tangent = { x: end.x - before.x, y: end.y - before.y };
    const screen = curve.getScreenCTM();
    if (!screen) throw new Error("経路の画面座標がない");
    const reference = getComputedStyle(curve).markerEnd;
    const id = reference.match(/#([^)"']+)/)?.[1];
    const marker = id ? document.getElementById(id) : null;
    if (!(marker instanceof SVGMarkerElement))
      throw new Error("矢尻のマーカーがない");
    const shape = marker.querySelector("path");
    if (!shape) throw new Error("矢尻の形状がない");
    // 実際の輪郭から三角形の頂点を読み取り、先端の座標を決め打ちしない。
    const number = "[+-]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][+-]?\\d+)?";
    const vertex = `([ML])\\s*(${number})[\\s,]+(${number})`;
    const outline = shape.getAttribute("d") ?? "";
    const triangle = new RegExp(
      `^\\s*${vertex}\\s*${vertex}\\s*${vertex}\\s*[Zz]\\s*$`,
    );
    const coordinates = outline.match(triangle);
    if (!coordinates) throw new Error("矢尻が3頂点の輪郭ではない");
    const vertices = [1, 4, 7].map((index) => ({
      x: Number(coordinates[index + 1]),
      y: Number(coordinates[index + 2]),
    }));
    const squaredDistance = (a: DOMPointInit, b: DOMPointInit) =>
      ((a.x ?? 0) - (b.x ?? 0)) ** 2 + ((a.y ?? 0) - (b.y ?? 0)) ** 2;
    const candidates = vertices.filter((point, index) => {
      const left = squaredDistance(point, vertices[(index + 1) % 3]);
      const right = squaredDistance(point, vertices[(index + 2) % 3]);
      const base = squaredDistance(
        vertices[(index + 1) % 3],
        vertices[(index + 2) % 3],
      );
      return Math.abs(left - right) < 1e-6 && Math.abs(left - base) > 1e-6;
    });
    if (candidates.length !== 1)
      throw new Error("矢尻の先端を一意に識別できない");
    const tip = candidates[0];
    const base = vertices.filter((point) => point !== tip);
    const tail = {
      x: (base[0].x + base[1].x) / 2,
      y: (base[0].y + base[1].y) / 2,
    };
    let tipPoint = new DOMPoint(tip.x, tip.y);
    let tailPoint = new DOMPoint(tail.x, tail.y);
    // 輪郭やグループに指定された変換も、ブラウザが使う計算済み値で反映する。
    for (
      let node: Element | null = shape;
      node && node !== marker;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const transform =
        style.transform === "none"
          ? new DOMMatrix()
          : new DOMMatrix(style.transform);
      const [originX, originY] = style.transformOrigin
        .split(" ")
        .map(Number.parseFloat);
      const matrix = new DOMMatrix()
        .translate(originX, originY)
        .multiply(transform)
        .translate(-originX, -originY);
      tipPoint = tipPoint.matrixTransform(matrix);
      tailPoint = tailPoint.matrixTransform(matrix);
    }
    const viewBox = marker.viewBox.baseVal;
    let scaleX = marker.markerWidth.baseVal.value / viewBox.width;
    let scaleY = marker.markerHeight.baseVal.value / viewBox.height;
    const aspect = marker.preserveAspectRatio.baseVal;
    if (aspect.align !== SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE) {
      const scale =
        aspect.meetOrSlice === SVGPreserveAspectRatio.SVG_MEETORSLICE_SLICE
          ? Math.max(scaleX, scaleY)
          : Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
    }
    const orient = marker.getAttribute("orient")?.trim();
    const angle =
      orient === "auto" || orient === "auto-start-reverse"
        ? Math.atan2(tangent.y, tangent.x)
        : (marker.orientAngle.baseVal.value * Math.PI) / 180;
    const local = {
      x: (tipPoint.x - tailPoint.x) * scaleX,
      y: (tipPoint.y - tailPoint.y) * scaleY,
    };
    const rotated = {
      x: local.x * Math.cos(angle) - local.y * Math.sin(angle),
      y: local.x * Math.sin(angle) + local.y * Math.cos(angle),
    };
    const toScreenVector = (vector: { x: number; y: number }) => ({
      x: screen.a * vector.x + screen.c * vector.y,
      y: screen.b * vector.x + screen.d * vector.y,
    });
    const travel = toScreenVector(tangent);
    const arrowhead = toScreenVector(rotated);
    const travelLength = Math.hypot(travel.x, travel.y);
    const arrowheadLength = Math.hypot(arrowhead.x, arrowhead.y);
    return {
      travel,
      arrowhead,
      travelLength,
      arrowheadLength,
      alignment:
        (travel.x * arrowhead.x + travel.y * arrowhead.y) /
        (travelLength * arrowheadLength),
      orient,
    };
  });
  expect(direction.travelLength).toBeGreaterThan(0);
  expect(direction.arrowheadLength).toBeGreaterThan(0);
  // 曲線終端の数値近似の誤差を1度以内に収め、逆向きや固定角度を許容しない。
  expect(direction.alignment, JSON.stringify(direction)).toBeGreaterThan(
    Math.cos(Math.PI / 180),
  );
}

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
          return hold &&
            (this.classList.contains("react-flow__node") ||
              this.classList.contains("state-group-label"))
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
            entries.some(
              (entry) =>
                entry.target.classList.contains("react-flow__node") ||
                entry.target.classList.contains("state-group-label"),
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

const repairedModel: GlsModel = {
  ...model,
  states: states.map((s) => (s.id === "A" ? { ...s, name: "再開待ち" } : s)),
  events: [
    { id: "START", name: "開始", categoryPath: ["業務", "復旧"] },
    { id: "RETRY", name: "再試行" },
  ],
  eventCategoryHeaders: ["領域", "用途"],
  stateGroups: [{ id: "G", name: "復旧系", stateIds: ["B", "C"] }],
  transitions: [
    { ...plain("A", "Y"), action: "再開処理" },
    {
      ...branch,
      commonAction: "復旧要求",
      branches: [
        { condition: "待つ", action: null, targetStateId: null },
        { condition: "復旧可能", action: "復旧処理", targetStateId: "Y" },
      ],
    },
    { ...plain("C", "Y", "RETRY"), action: "Cの復旧" },
  ],
};
async function assertRepaired(page: Page, acceptedSequence?: number) {
  await assertTables(page, repairedModel);
  await expect(groupLabel(page)).toHaveText("復旧系");
  const g = await bounds(frame(page));
  for (const id of ["B", "C"]) contains(g, await bounds(node(page, id)));
  const a = await bounds(node(page, "A"));
  expect(a.y + a.height).toBeLessThan(g.y);
  await expect(node(page, "A").locator(".state-node-label")).toHaveText(
    "再開待ち",
  );
  await expect(table(page).locator(".event-category")).toHaveText([
    "業務",
    "復旧",
  ]);
  await assertPairs(
    page,
    [
      ["A", "Y"],
      ["state-group:G", "Y"],
    ],
    acceptedSequence,
  );
  await expect(edge(page, "state-group:G", "X")).toHaveCount(0);
}
test("REQ-033-S01 未保存の通知系列で枠と集約の成立と解除、両表を更新する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const { stateGroups: _, ...legacy } = model;
  const cases: {
    next: GlsModel;
    pairs: [string, string][];
    labels: string[];
  }[] = [
    {
      next: legacy,
      pairs: [
        ["A", "X"],
        ["B", "Y"],
        ["B", "X"],
      ],
      labels: [],
    },
    {
      next: model,
      pairs: [
        ["state-group:G", "X"],
        ["B", "Y"],
      ],
      labels: ["稼働系"],
    },
    {
      next: {
        ...model,
        stateGroups: [
          { id: "G", name: "名前だけ変更", stateIds: ["C", "B", "A"] },
        ],
      },
      pairs: [
        ["state-group:G", "X"],
        ["B", "Y"],
      ],
      labels: ["名前だけ変更"],
    },
    {
      next: {
        ...model,
        stateGroups: [
          { id: "G", name: "稼働系", stateIds: ["A", "C"] },
          { id: "H", name: "別", stateIds: ["B", "Y"] },
        ],
      },
      pairs: [
        ["A", "X"],
        ["B", "Y"],
        ["B", "X"],
      ],
      labels: ["稼働系", "別"],
    },
    {
      next: {
        ...model,
        transitions: [
          plain("A", "X"),
          {
            ...branch,
            branches: [
              branch.branches[0],
              { ...branch.branches[1], targetStateId: null },
            ],
          },
        ],
      },
      pairs: [
        ["A", "X"],
        ["B", "Y"],
      ],
      labels: ["稼働系"],
    },
    {
      next: {
        ...model,
        transitions: [
          plain("A", "X"),
          {
            ...branch,
            branches: [
              branch.branches[0],
              { ...branch.branches[1], targetStateId: "Y" },
            ],
          },
        ],
      },
      pairs: [
        ["A", "X"],
        ["B", "Y"],
      ],
      labels: ["稼働系"],
    },
    {
      next: {
        ...model,
        transitions: [
          plain("A", "X"),
          {
            ...branch,
            branches: [
              branch.branches[0],
              { ...branch.branches[1], targetStateId: null },
            ],
          },
          plain("C", "X"),
        ],
      },
      pairs: [
        ["state-group:G", "X"],
        ["B", "Y"],
      ],
      labels: ["稼働系"],
    },
  ];
  let seq = 2;
  for (const item of cases) {
    await show(page, item.next, seq++);
    await assertTables(page, item.next);
    await expect(diagram(page).locator(".state-group-label")).toHaveText(
      item.labels,
    );
    await assertPairs(page, item.pairs);
    for (const group of item.next.stateGroups ?? []) {
      const outer = await bounds(frame(page, group.id));
      for (const id of group.stateIds)
        contains(outer, await bounds(node(page, id)));
    }
  }
});
test("REQ-033-S02 正常、所属エラーで保持、異なるすべての内容へ回復する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await show(page, model, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await assertTables(page, model);
  await expect(groupLabel(page)).toHaveText("稼働系");
  await assertPairs(page, [
    ["state-group:G", "X"],
    ["B", "Y"],
  ]);
  await show(page, repairedModel, 3);
  await assertRepaired(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("REQ-033-S03 古い通知と対象だけが不正なグループを拒否する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await show(page, repairedModel, 2);
  await send(page, model, 1);
  const g = { id: "G", name: "復旧系", stateIds: ["B", "C"] };
  const invalid: unknown[] = [
    null,
    {},
    1,
    ...[undefined, "", "1BAD", 1].map((id) => [{ ...g, id }]),
    ...[undefined, "", " ", 1, 'A"B', "A\nB", "A\rB"].map((name) => [
      { ...g, name },
    ]),
    ...[
      undefined,
      null,
      {},
      [],
      ["B"],
      ["B", 1],
      ["B", "1BAD"],
      ["B", "MISSING"],
      ["B", "B"],
    ].map((stateIds) => [{ ...g, stateIds }]),
    [{ ...g, children: [] }],
    [{ ...g, states: [] }],
    [{ ...g, transitions: [] }],
    [g, { id: "G", name: "別", stateIds: ["X", "Y"] }],
    [g, { id: "H", name: "別", stateIds: ["X", "B"] }],
  ];
  let sequence = 3;
  for (const stateGroups of invalid) {
    await send(page, { ...repairedModel, stateGroups }, sequence);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await assertTables(page, repairedModel);
    await expect(groupLabel(page)).toHaveText("復旧系");
    expect(await ackSequences(page)).not.toContain(sequence++);
  }
  await assertRepaired(page, 2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
for (const operation of ["自動更新", "コマンド再実行"]) {
  test(`REQ-033-S04 小さい版番号で現在のグループを描く: ${operation}`, async ({
    page,
  }) => {
    await start(page);
    await show(page, model, 1, false, 9);
    await show(page, repairedModel, 2, false, 1);
    await assertRepaired(page);
    await expect(diagram(page)).toHaveCount(1);
    const messages = await page.evaluate(
      () =>
        (
          window as unknown as {
            glsMessages: { sequence?: number; version?: number }[];
          }
        ).glsMessages,
    );
    expect(messages.find((m) => m.sequence === 2)?.version).toBe(1);
  });
}
test("REQ-033-S05 別文書の初回エラーで枠と両表を混入させない", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await page.evaluate(() =>
    window.postMessage({ type: "editor.changed", uri: "file:///b.gls" }, "*"),
  );
  await expect(groupLabel(page)).toHaveText("稼働系");
  await assertTables(page, model);
  await show(page, null, 2, true, 1, "file:///b.gls");
  await expect(diagram(page)).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
  await expect(stateTable(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "解析エラーのため表示できない。",
  );
});
test("REQ-033-S06 枠と状態の実計測前の編集を最初の完了へ反映する", async ({
  page,
}) => {
  await holdNodeMeasurements(page);
  await start(page);
  await send(page, model, 1, false, 9);
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
  await send(page, repairedModel, 2, false, 1);
  await expect(groupLabel(page)).toHaveText("復旧系");
  await page.evaluate(() =>
    (
      window as unknown as { releaseGlsMeasurements(): void }
    ).releaseGlsMeasurements(),
  );
  await waitAck(page, 2);
  await assertRepaired(page);
  await send(page, model, 1, true, 9);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await ackSequences(page)).not.toContain(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const snapshots = await page.evaluate(
    () =>
      (
        window as unknown as {
          groupSnapshots: {
            sequence: number;
            labels: string[];
            paths: { id: string; length: number }[];
            boxes: {
              id: string;
              box: { x: number; y: number; width: number; height: number };
            }[];
          }[];
        }
      ).groupSnapshots,
  );
  expect(snapshots.every((s) => s.sequence === 2)).toBe(true);
  const snapshot = snapshots.find((s) => s.sequence === 2);
  expect(snapshot?.labels).toEqual(["復旧系"]);
  expect(snapshot?.paths.map((p) => p.id).sort()).toEqual([
    "A:Y",
    "state-group:G:Y",
  ]);
  for (const path of snapshot?.paths ?? [])
    expect(path.length).toBeGreaterThan(0);
  const parent = snapshot?.boxes.find((b) => b.id === "state-group:G")?.box;
  expect(parent).toBeDefined();
  for (const id of ["B", "C"]) {
    const child = snapshot?.boxes.find((b) => b.id === id)?.box;
    if (!parent || !child) throw new Error("完了時の枠と所属状態がない");
    contains(parent, child);
  }
});

test("REQ-028-S01 REQ-030-S01 REQ-031-S01 REQ-032-S01 サンプルの集約と個別遷移を確認する", async ({
  page,
}) => {
  const result = parseGls(readFileSync("examples/state-groups.gls", "utf8"));
  expect(result.diagnostics).toEqual([]);
  if (!result.model) throw new Error("サンプルの解析に失敗した");
  await start(page);
  await show(page, result.model);
  await expect(groupLabel(page, "WORK")).toHaveText("稼働系");
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "イベント",
    "準備待ち",
    "実行中",
    "復旧中",
    "完了",
    "失敗",
  ]);
  const row = table(page).locator('tr[data-event-id="START"]');
  await expect(row.locator(".transition-action")).toHaveText([
    "要求を記録する",
  ]);
  await expect(row.locator(".transition-common")).toHaveText("検査を記録する");
  await expect(row.locator(".branch-condition")).toHaveText(["許可", "異常"]);
  await expect(row.locator(".branch-action")).toHaveText(["-", "通知する"]);
  await expect(row.locator(".branch-target")).toHaveText(["完了", "失敗"]);
  await expect(row.locator(".transition-undefined")).toHaveCount(3);
  await assertPairs(page, [
    ["state-group:WORK", "DONE"],
    ["RUNNING", "FAILED"],
    ["RECOVERING", "IDLE"],
    ["IDLE", "IDLE"],
  ]);
  await assertTables(page, result.model);
});
