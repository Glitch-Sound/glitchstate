import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type GlsModel, parseGls } from "../../src/core";

const states = [
  { id: "IDLE", name: "待機", color: "#4F46E5", meaning: "待つ" },
  { id: "RUNNING", name: "実行中", color: "#22C55E", meaning: "走る" },
  { id: "FAILED", name: "失敗", color: "#FF0000", meaning: "止まる" },
  { id: "RECOVERED", name: "回復済み", color: "#F97316", meaning: "回復した" },
];
const events = [{ id: "START", name: "開始", categoryPath: ["操作", "運転"] }];
const conditional = {
  fromStateId: "IDLE",
  eventId: "START",
  commonAction: "要求を記録する",
  branches: [
    { condition: "準備完了", action: "開始する", targetStateId: "RUNNING" },
    { condition: "それ以外", action: "拒否する", targetStateId: "FAILED" },
  ],
};
const plain = {
  fromStateId: "RUNNING",
  eventId: "START",
  action: "平坦な処理",
  targetStateId: "IDLE",
};
const model: GlsModel = {
  states,
  events,
  eventCategoryHeaders: ["系統", "区分", "種別"],
  transitions: [conditional, plain],
};

const repairedModel: GlsModel = {
  ...model,
  states: [{ ...states[0], name: "再開待ち" }, ...states.slice(1)],
  events: [{ ...events[0], categoryPath: ["業務", "復旧"] }],
  eventCategoryHeaders: ["領域", "用途"],
  transitions: [
    {
      ...conditional,
      commonAction: "再開要求を記録する",
      branches: [
        {
          condition: "復旧可能",
          action: "復旧する",
          targetStateId: "RECOVERED",
        },
        conditional.branches[1],
      ],
    },
    plain,
  ],
};
const table = (page: Page) =>
  page.getByRole("table", { name: "状態遷移表", exact: true });
const stateTable = (page: Page) =>
  page.getByRole("table", { name: "状態定義", exact: true });
const diagram = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
const node = (page: Page, id: string) =>
  diagram(page).locator(`.react-flow__node[data-id="${id}"]`);
const edges = (page: Page) => diagram(page).locator(".state-edge-path");
const edge = (page: Page, from: string, to: string) =>
  diagram(page).locator(
    `.react-flow__edge[data-id="${from}:${to}"] .state-edge-path`,
  );
const cell = (page: Page, event = "START", column = 0) =>
  table(page).locator(`tr[data-event-id="${event}"] td[headers]`).nth(column);

async function start(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      glsMessages: [] as unknown[],
      branchSnapshots: [] as unknown[],
      acquireVsCodeApi: () => ({
        postMessage: (value: unknown) => {
          (window as unknown as { glsMessages: unknown[] }).glsMessages.push(
            value,
          );
          if ((value as { type: string }).type === "glitchstate.rendered")
            (
              window as unknown as { branchSnapshots: unknown[] }
            ).branchSnapshots.push({
              ...(value as object),
              names: Array.from(
                document.querySelectorAll(".state-node-label"),
              ).map((el) => el.textContent),
              conditions: Array.from(
                document.querySelectorAll(".branch-condition"),
              ).map((el) => el.textContent),
              paths: Array.from(
                document.querySelectorAll(".state-edge-path"),
              ).map((el) => ({
                id: el.closest(".react-flow__edge")?.getAttribute("data-id"),
                length: (el as SVGPathElement).getTotalLength(),
              })),
            });
        },
      }),
    });
  });
  await page.goto("/");
  await page.evaluate(() =>
    document.documentElement.style.setProperty(
      "--vscode-panel-border",
      "#555555",
    ),
  );
}
async function send(
  page: Page,
  next: unknown,
  sequence = 1,
  hasErrors = false,
  version = sequence,
  uri = "file:///conditional.gls",
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
  uri = "file:///conditional.gls",
) {
  await send(page, next, sequence, hasErrors, version, uri);
  await waitAck(page, sequence);
}
async function assertCells(page: Page, next: GlsModel) {
  await expect(table(page).locator("tbody tr")).toHaveCount(next.events.length);
  for (const event of next.events) {
    const row = table(page).locator(`tr[data-event-id="${event.id}"]`);
    await expect(row.locator('th[scope="row"]')).toHaveText(event.name);
    await expect(row.locator("td[headers]")).toHaveCount(next.states.length);
    for (const [column, state] of next.states.entries()) {
      const target = cell(page, event.id, column);
      const transition = next.transitions.find(
        (t) => t.eventId === event.id && t.fromStateId === state.id,
      );
      const name = (id: string | null) =>
        id === null ? "-" : (next.states.find((s) => s.id === id)?.name ?? "");
      if (!transition) {
        await expect(target).toHaveText("未定義");
        continue;
      }
      if ("branches" in transition) {
        await expect(target.locator(".transition-common")).toHaveText(
          transition.commonAction ?? "-",
        );
        await expect(target.locator(".branch-condition")).toHaveText(
          transition.branches.map((b) => b.condition),
        );
        await expect(target.locator(".branch-action")).toHaveText(
          transition.branches.map((b) => b.action ?? "-"),
        );
        await expect(target.locator(".branch-target")).toHaveText(
          transition.branches.map((b) => name(b.targetStateId)),
        );
      } else {
        await expect(target.locator(":scope > *")).toHaveText([
          transition.action ?? "-",
          name(transition.targetStateId),
        ]);
        await expect(target.locator(".transition-branch")).toHaveCount(0);
      }
    }
  }
}

test("REQ-025-S01 共通処理の下だけを縦線で左右に分割する", async ({ page }) => {
  await start(page);
  await show(page);
  const td = cell(page);
  await expect(td.getByText("要求を記録する", { exact: true })).toHaveCount(1);
  await expect(td.locator(".branch-condition")).toHaveText([
    "準備完了",
    "それ以外",
  ]);
  await assertCells(page, model);
  const common = await bounds(td.locator(".transition-common"));
  const group = await bounds(td.locator(".transition-branches"));
  const branches = td.locator(".transition-branch");
  const left = await bounds(branches.nth(0));
  const right = await bounds(branches.nth(1));
  expect(group.y).toBeGreaterThanOrEqual(common.y + common.height);
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  expect(left.y).toBeCloseTo(right.y, 1);
  expect(common.width).toBeCloseTo(group.width, 1);
  for (const item of [
    td,
    td.locator(".transition-common"),
    td.locator(".transition-branches"),
    branches.first(),
  ]) {
    await expect(item).toHaveCSS("border-left-width", "0px");
    await expect(item).toHaveCSS("border-right-width", "0px");
  }
  const line = await td.evaluate((el) =>
    getComputedStyle(el)
      .getPropertyValue("--transition-branch-line-width")
      .trim(),
  );
  expect(Number.parseFloat(line)).toBeGreaterThan(0);
  await expect(branches.nth(1)).toHaveCSS("border-left-width", line);
  await expect(branches.nth(1)).toHaveCSS("border-left-style", "solid");
  for (const branch of await branches.all()) {
    const condition = await bounds(branch.locator(".branch-condition"));
    const action = await bounds(branch.locator(".branch-action"));
    const target = await bounds(branch.locator(".branch-target"));
    expect(action.y).toBeGreaterThanOrEqual(condition.y + condition.height);
    expect(target.y).toBeGreaterThanOrEqual(action.y + action.height);
  }
  for (const label of ["共通処理", "条件", "処理", "遷移先"])
    await expect(td.getByText(label, { exact: true })).toHaveCount(0);
});
for (const [commonAction, action, targetStateId] of [
  [null, "記録する", "RUNNING"],
  ["記録する", null, "RUNNING"],
  ["記録する", "処理する", null],
  [null, null, null],
  ["記録する", "処理する", "IDLE"],
] as const) {
  test(`REQ-025-S02 1分岐と各なしを別の領域に表示する: ${commonAction}/${action}/${targetStateId}`, async ({
    page,
  }) => {
    await start(page);
    const next = {
      ...model,
      transitions: [
        {
          ...conditional,
          commonAction,
          branches: [{ condition: "確認", action, targetStateId }],
        },
      ],
    };
    await show(page, next);
    await assertCells(page, next);
    await expect(cell(page).locator(".transition-branch")).toHaveCount(1);
    await expect(cell(page).locator(".transition-branch")).toHaveCSS(
      "border-left-width",
      "0px",
    );
    await expect(cell(page)).not.toContainText("未定義");
  });
}
test("REQ-025-S03 分岐数が異なっても1行4状態の交点の内側に保つ", async ({
  page,
}) => {
  await start(page);
  const next = {
    ...model,
    transitions: [
      { ...conditional, branches: [conditional.branches[0]] },
      {
        ...conditional,
        fromStateId: "RUNNING",
        commonAction: "3分岐の共通",
        branches: [
          conditional.branches[0],
          conditional.branches[1],
          { condition: "再確認", action: "確認する", targetStateId: null },
        ],
      },
      { ...plain, fromStateId: "FAILED" },
    ],
  };
  await show(page, next);
  await expect(table(page).locator("thead th")).toHaveCount(7);
  await assertCells(page, next);
  await expect(
    cell(page, "START", 1).locator(".transition-branch"),
  ).toHaveCount(3);
  await expect(cell(page, "START", 2).locator(":scope > *")).toHaveText([
    "平坦な処理",
    "待機",
  ]);
  await expect(cell(page, "START", 3)).toHaveClass("transition-undefined");
});
test("REQ-025-S04 3段と浅い分類の結合、空欄、全交点を維持する", async ({
  page,
}) => {
  await start(page);
  const categoryEvents = [
    { id: "START", name: "開始", categoryPath: ["操作", "運転", "開始系"] },
    { id: "STOP", name: "停止", categoryPath: ["操作", "運転"] },
    { id: "RESET", name: "初期化", categoryPath: ["操作"] },
    { id: "PING", name: "疎通" },
  ];
  const next: GlsModel = {
    ...model,
    events: categoryEvents,
    transitions: categoryEvents.flatMap((event, row) =>
      states.map((state, column) =>
        (row + column) % 2
          ? {
              ...plain,
              eventId: event.id,
              fromStateId: state.id,
              action: `平坦${row}-${column}`,
            }
          : {
              ...conditional,
              eventId: event.id,
              fromStateId: state.id,
              commonAction: `共通${row}-${column}`,
              branches: [
                {
                  condition: `条件${row}-${column}`,
                  action: `処理${row}-${column}`,
                  targetStateId: states[(column + 1) % states.length].id,
                },
              ],
            },
      ),
    ),
  };
  await show(page, next);
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "種別",
    "イベント",
    "待機",
    "実行中",
    "失敗",
    "回復済み",
  ]);
  expect(
    await table(page)
      .locator(".event-category")
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLTableCellElement).rowSpan),
      ),
  ).toEqual([3, 2, 1]);
  await expect(
    table(page).locator('tbody tr[data-event-id="PING"] td[colspan="3"]'),
  ).toHaveText("");
  await expect(
    table(page).locator('tbody tr[data-event-id="RESET"] td[colspan="2"]'),
  ).toHaveText("");
  await assertCells(page, next);
  const columns = await table(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll("td[headers]")).map(
          (td) => td.getBoundingClientRect().x,
        ),
      ),
    );
  for (const row of columns) expect(row).toEqual(columns[0]);
  for (const el of await table(page).locator(".event-category").all())
    await expect(el).toHaveCSS("border-left-width", "0px");
});
test("REQ-025-S05 条件と複数行の処理を文字列で表示し末尾まで折り返す", async ({
  page,
}) => {
  await start(page);
  const literal = "<script>window.glsBranchExecuted = true</script>\n続く行";
  const long = `${"長い条件名".repeat(80)}末尾の条件`;
  const next = {
    ...model,
    transitions: [
      {
        ...conditional,
        commonAction: literal,
        branches: [
          {
            condition: "<b>準備完了</b>",
            action: literal,
            targetStateId: "RUNNING",
          },
          {
            condition: long,
            action: "先頭の処理\n末尾の処理",
            targetStateId: null,
          },
        ],
      },
    ],
  };
  await show(page, next);
  await assertCells(page, next);
  await expect(table(page).locator("script,b")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { glsBranchExecuted?: boolean })
          .glsBranchExecuted,
    ),
  ).toBeUndefined();
  await expect(cell(page).locator(".branch-action").nth(1)).toHaveCSS(
    "white-space",
    "pre-wrap",
  );
  const dimensions = await cell(page)
    .locator(".branch-condition")
    .nth(1)
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return {
        lines: range.getClientRects().length,
        height: el.clientHeight,
        scrollHeight: el.scrollHeight,
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
      };
    });
  expect(dimensions.lines).toBeGreaterThan(1);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
});
test("REQ-026-S01 全分岐先の実経路と矢尻をラベルなしで表示する", async ({
  page,
}) => {
  await start(page);
  await show(page, {
    ...model,
    transitions: [
      {
        ...conditional,
        branches: [
          conditional.branches[0],
          { ...conditional.branches[1], action: null },
        ],
      },
    ],
  });
  await expect(edges(page)).toHaveCount(2);
  for (const target of ["RUNNING", "FAILED"]) {
    await assertArrow(page, "IDLE", target);
    await assertArrowheadFollowsPath(edge(page, "IDLE", target));
  }
  await expect(diagram(page).locator(".react-flow__node")).toHaveCount(4);
  for (const label of [
    "準備完了",
    "それ以外",
    "要求を記録する",
    "開始する",
    "START",
  ])
    await expect(diagram(page)).not.toContainText(label);
});
test("REQ-026-S02 同じ分岐先と旧形式の有向ペアを1本へまとめる", async ({
  page,
}) => {
  await start(page);
  await show(page, {
    ...model,
    events: [...events, { id: "RETRY", name: "再試行" }],
    transitions: [
      {
        ...conditional,
        branches: conditional.branches.map((branch) => ({
          ...branch,
          targetStateId: "RUNNING",
        })),
      },
      {
        ...plain,
        fromStateId: "IDLE",
        eventId: "RETRY",
        targetStateId: "RUNNING",
      },
    ],
  });
  await expect(edges(page)).toHaveCount(1);
  await assertArrow(page, "IDLE", "RUNNING");
});
for (const [title, branches, extra, pairs] of [
  [
    "すべてなし",
    conditional.branches.map((b) => ({ ...b, targetStateId: null })),
    [],
    [],
  ],
  [
    "自己遷移",
    [
      { ...conditional.branches[0], targetStateId: "IDLE" },
      { ...conditional.branches[1], targetStateId: null },
    ],
    [],
    [["IDLE", "IDLE"]],
  ],
  [
    "相互遷移",
    [conditional.branches[0]],
    [plain],
    [
      ["IDLE", "RUNNING"],
      ["RUNNING", "IDLE"],
    ],
  ],
] as const) {
  test(`REQ-026-S03 分岐の実経路と矢尻の方向: ${title}`, async ({ page }) => {
    await start(page);
    await show(page, {
      ...model,
      transitions: [{ ...conditional, branches }, ...extra],
    });
    await expect(edges(page)).toHaveCount(pairs.length);
    for (const [from, to] of pairs) {
      await assertArrow(page, from, to);
      await assertArrowheadFollowsPath(edge(page, from, to));
    }
    if (title === "自己遷移")
      expect((await bounds(edge(page, "IDLE", "IDLE"))).y).toBeLessThan(
        (await bounds(node(page, "IDLE"))).y,
      );
    if (title === "相互遷移") {
      const midpoints = await edges(page).evaluateAll((els) =>
        els.map((el) => {
          const p = el as SVGPathElement;
          const q = p.getPointAtLength(p.getTotalLength() / 2);
          return [q.x, q.y];
        }),
      );
      expect(midpoints[0]).not.toEqual(midpoints[1]);
    }
  });
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

test("REQ-027-S01 共通処理と分岐、形式、分類と行順を現在の交点へ反映する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const basePairs = ["IDLE:FAILED", "IDLE:RUNNING", "RUNNING:IDLE"];
  const cases: { title: string; next: GlsModel; pairs: string[] }[] = [
    {
      title: "共通処理",
      next: {
        ...model,
        transitions: [{ ...conditional, commonAction: "変更した共通" }, plain],
      },
      pairs: basePairs,
    },
    {
      title: "条件名",
      next: {
        ...model,
        transitions: [
          {
            ...conditional,
            branches: [
              { ...conditional.branches[0], condition: "変更した条件" },
              conditional.branches[1],
            ],
          },
          plain,
        ],
      },
      pairs: basePairs,
    },
    {
      title: "分岐の処理",
      next: {
        ...model,
        transitions: [
          {
            ...conditional,
            branches: [
              { ...conditional.branches[0], action: "変更した処理" },
              conditional.branches[1],
            ],
          },
          plain,
        ],
      },
      pairs: basePairs,
    },
    {
      title: "別の分岐先",
      next: {
        ...model,
        transitions: [
          {
            ...conditional,
            branches: [
              { ...conditional.branches[0], targetStateId: "RECOVERED" },
              conditional.branches[1],
            ],
          },
          plain,
        ],
      },
      pairs: ["IDLE:FAILED", "IDLE:RECOVERED", "RUNNING:IDLE"],
    },
    {
      title: "遷移なし",
      next: {
        ...model,
        transitions: [
          {
            ...conditional,
            branches: [
              { ...conditional.branches[0], targetStateId: null },
              conditional.branches[1],
            ],
          },
          plain,
        ],
      },
      pairs: ["IDLE:FAILED", "RUNNING:IDLE"],
    },
    {
      title: "分岐追加",
      next: {
        ...model,
        transitions: [
          {
            ...conditional,
            branches: [
              ...conditional.branches,
              { condition: "追加", action: "追加処理", targetStateId: "IDLE" },
            ],
          },
          plain,
        ],
      },
      pairs: ["IDLE:FAILED", "IDLE:IDLE", "IDLE:RUNNING", "RUNNING:IDLE"],
    },
    {
      title: "分岐除去",
      next: {
        ...model,
        transitions: [
          { ...conditional, branches: [conditional.branches[0]] },
          plain,
        ],
      },
      pairs: ["IDLE:RUNNING", "RUNNING:IDLE"],
    },
    {
      title: "分岐の順序",
      next: {
        ...model,
        transitions: [
          {
            ...conditional,
            branches: [conditional.branches[1], conditional.branches[0]],
          },
          plain,
        ],
      },
      pairs: basePairs,
    },
    {
      title: "分岐なしへ変更",
      next: {
        ...model,
        transitions: [
          { ...plain, fromStateId: "IDLE", targetStateId: "RUNNING" },
          plain,
        ],
      },
      pairs: ["IDLE:RUNNING", "RUNNING:IDLE"],
    },
    { title: "分岐付きへ戻す", next: model, pairs: basePairs },
    {
      title: "分類の移動",
      next: {
        ...model,
        events: [{ ...events[0], categoryPath: ["通信", "監視"] }],
      },
      pairs: basePairs,
    },
    {
      title: "列見出し",
      next: { ...model, eventCategoryHeaders: ["領域", "用途"] },
      pairs: basePairs,
    },
    {
      title: "イベントを先頭へ追加",
      next: {
        ...model,
        events: [{ id: "EXTRA", name: "追加イベント" }, ...events],
      },
      pairs: basePairs,
    },
    {
      title: "イベント行の順序",
      next: {
        ...model,
        events: [...events, { id: "EXTRA", name: "追加イベント" }],
      },
      pairs: basePairs,
    },
  ];
  let sequence = 2;
  for (const change of cases) {
    await test.step(change.title, async () => {
      await show(page, change.next, sequence++);
      await assertCells(page, change.next);
      await expect(table(page).locator(".event-category-header")).toHaveText(
        change.next.eventCategoryHeaders?.slice(0, 2) ?? [],
      );
      const path =
        change.title === "分類の移動" ? ["通信", "監視"] : ["操作", "運転"];
      await expect(table(page).locator(".event-category")).toHaveText(path);
      await expect(
        stateTable(page).locator("tbody td:nth-child(2)"),
      ).toHaveText(["待機", "実行中", "失敗", "回復済み"]);
      await expect(diagram(page).locator(".state-node-label")).toHaveText([
        "待機",
        "実行中",
        "失敗",
        "回復済み",
      ]);
      expect(
        await diagram(page)
          .locator(".react-flow__edge")
          .evaluateAll((items) =>
            items.map((el) => el.getAttribute("data-id")).sort(),
          ),
      ).toEqual(change.pairs);
    });
  }
});

test("REQ-027-S02 正常、参照エラーで保持、異なる全内容へ回復する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await show(page, model, 2, true);
  await expect(page.getByRole("alert")).toBeVisible();
  await assertCells(page, model);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "待機",
    "実行中",
    "失敗",
    "回復済み",
  ]);
  await expect(table(page).locator(".event-category")).toHaveText([
    "操作",
    "運転",
  ]);
  await assertArrow(page, "IDLE", "RUNNING");
  await show(page, repairedModel, 3);
  await assertCells(page, repairedModel);
  await expect(table(page).locator("thead th")).toHaveText([
    "領域",
    "用途",
    "イベント",
    "再開待ち",
    "実行中",
    "失敗",
    "回復済み",
  ]);
  await expect(table(page).locator(".event-category")).toHaveText([
    "業務",
    "復旧",
  ]);
  await expect(stateTable(page).locator("tbody td:nth-child(2)")).toHaveText([
    "再開待ち",
    "実行中",
    "失敗",
    "回復済み",
  ]);
  await expect(node(page, "IDLE").locator(".state-node-label")).toHaveText(
    "再開待ち",
  );
  await assertArrow(page, "IDLE", "RECOVERED");
  await expect(edge(page, "IDLE", "RUNNING")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("REQ-027-S03 古い通知と対象項目だけが不正な分岐モデルを拒否する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await show(page, repairedModel, 2);
  await send(page, model, 1);
  const base = {
    ...conditional,
    commonAction: "再開要求を記録する",
    branches: [
      { condition: "復旧可能", action: "復旧する", targetStateId: "RECOVERED" },
      conditional.branches[1],
    ],
  };
  const invalid: unknown[] = [
    ...[undefined, "", " ", 1, []].map((commonAction) => ({
      ...base,
      commonAction,
    })),
    ...[undefined, [], null, {}].map((branches) => ({ ...base, branches })),
    ...[undefined, "", " ", 1].map((action) => ({
      ...base,
      branches: [base.branches[0], { ...base.branches[1], action }],
    })),
    ...[undefined, "", " ", 1, 'A"B', "A\nB", "A\rB"].map((condition) => ({
      ...base,
      branches: [base.branches[0], { ...base.branches[1], condition }],
    })),
    ...[undefined, 1, "1BAD", "MISSING"].map((targetStateId) => ({
      ...base,
      branches: [base.branches[0], { ...base.branches[1], targetStateId }],
    })),
    {
      ...base,
      branches: [
        base.branches[0],
        { ...base.branches[1], condition: "復旧可能" },
      ],
    },
    {
      ...base,
      branches: [{ ...base.branches[0], branches: [base.branches[1]] }],
    },
    { ...base, action: "旧処理" },
    { ...base, targetStateId: "IDLE" },
  ];
  const invalidModels = [
    ...invalid.map((value) => ({
      ...repairedModel,
      transitions: [value, plain],
    })),
    {
      ...repairedModel,
      transitions: [base, { ...plain, fromStateId: "IDLE" }],
    },
  ];
  let sequence = 3;
  for (const next of invalidModels) {
    await send(page, next, sequence);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await assertCells(page, repairedModel);
    await expect(table(page).locator(".event-category")).toHaveText([
      "業務",
      "復旧",
    ]);
    await expect(node(page, "IDLE").locator(".state-node-label")).toHaveText(
      "再開待ち",
    );
    expect(await ackSequences(page)).not.toContain(sequence++);
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const operation of ["自動更新", "コマンド再実行"]) {
  test(`REQ-027-S04 小さい版番号で同じプレビューの分岐を更新する: ${operation}`, async ({
    page,
  }) => {
    await start(page);
    await show(page, model, 1, false, 9);
    await show(page, repairedModel, 2, false, 2);
    await assertCells(page, repairedModel);
    await expect(table(page).locator(".event-category")).toHaveText([
      "業務",
      "復旧",
    ]);
    await expect(diagram(page)).toHaveCount(1);
    await assertArrow(page, "IDLE", "RECOVERED");
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              glsMessages: { sequence?: number; version?: number }[];
            }
          ).glsMessages.find((m) => m.sequence === 2)?.version,
      ),
    ).toBe(2);
  });
}

test("REQ-027-S05 対象外編集を無視し別文書の初回エラーで古い3表示を消す", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await page.evaluate(() =>
    window.postMessage({ type: "editor.changed", uri: "file:///b.gls" }, "*"),
  );
  await assertCells(page, model);
  await show(page, null, 2, true, 1, "file:///b.gls");
  await expect(table(page)).toHaveCount(0);
  await expect(stateTable(page)).toHaveCount(0);
  await expect(diagram(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "解析エラーのため表示できない。",
  );
});

test("REQ-027-S06 図の計測前の編集を最初の完了へ反映し古い完了を使わない", async ({
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
  await expect(node(page, "IDLE").locator(".state-node-label")).toHaveText(
    "再開待ち",
  );
  await page.evaluate(() =>
    (
      window as unknown as { releaseGlsMeasurements(): void }
    ).releaseGlsMeasurements(),
  );
  await waitAck(page, 2);
  await assertCells(page, repairedModel);
  await assertArrow(page, "IDLE", "RECOVERED");
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
          branchSnapshots: {
            sequence: number;
            names: string[];
            conditions: string[];
            paths: { id: string; length: number }[];
          }[];
        }
      ).branchSnapshots,
  );
  expect(
    snapshots.some(
      (s) =>
        s.sequence === 2 &&
        s.names[0] === "再開待ち" &&
        s.conditions[0] === "復旧可能" &&
        s.paths.some((p) => p.id === "IDLE:RECOVERED" && p.length > 0),
    ),
  ).toBe(true);
});

test("REQ-025-S04 REQ-026-S01 サンプルの分類、両形式と全分岐先を表示する", async ({
  page,
}) => {
  const result = parseGls(
    readFileSync("examples/conditional-transitions.gls", "utf8"),
  );
  expect(result.diagnostics).toEqual([]);
  if (!result.model) throw new Error("条件分岐サンプルを解析できない");
  await start(page);
  await show(page, result.model);
  await expect(table(page).locator("thead th")).toHaveText([
    "系統",
    "区分",
    "種別",
    "イベント",
    "待機",
    "実行中",
    "失敗",
  ]);
  await expect(cell(page).locator(".transition-common")).toHaveText(
    "要求を記録する",
  );
  await expect(cell(page).locator(".branch-condition")).toHaveText([
    "準備完了",
    "それ以外",
  ]);
  await expect(cell(page).locator(".branch-action")).toHaveText([
    "開始する",
    "-",
  ]);
  await expect(cell(page).locator(".branch-target")).toHaveText([
    "実行中",
    "失敗",
  ]);
  await expect(cell(page, "STOP", 1).locator(":scope > *")).toHaveText([
    "-",
    "待機",
  ]);
  await expect(cell(page, "PING", 0).locator(":scope > *")).toHaveText([
    "応答する",
    "-",
  ]);
  await assertCells(page, result.model);
  await expect(edges(page)).toHaveCount(3);
  for (const [from, to] of [
    ["IDLE", "RUNNING"],
    ["IDLE", "FAILED"],
    ["RUNNING", "IDLE"],
  ])
    await assertArrow(page, from, to);
});
