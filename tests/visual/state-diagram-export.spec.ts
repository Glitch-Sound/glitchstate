import { expect, type Page, test } from "@playwright/test";
import type { GlsModel } from "../../src/core";
import { assertArrowheadFollowsPath } from "./arrowhead-direction";

const ids = ["W", "A", "B", "C", "X", "Y", "Z", "U", "V"];
const long = "折り返しを必要とする長い名前を最後まで表示するための状態名の末尾";
const model: GlsModel = {
  states: ids.map((id) => ({
    id,
    name: id === "A" ? "<b>待機A&B</b>" : id === "C" ? long : `状態${id}`,
    meaning: `意味${id}`,
    color: id === "A" ? "#4F46E5" : "#22C55E",
  })),
  events: [{ id: "GO", name: "開始イベント" }],
  stateGroups: [
    {
      id: "G",
      name: "長いグループ名の折り返しを確認する稼働系の末尾",
      stateIds: ["A", "B", "C"],
    },
    { id: "H", name: "外部系", stateIds: ["Y", "Z"] },
  ],
  transitions: [
    ...["A", "B", "Z"].map((fromStateId) => ({
      fromStateId,
      eventId: "GO",
      action: "処理の文字",
      targetStateId: "X",
    })),
    {
      fromStateId: "C",
      eventId: "GO",
      commonAction: "共通処理",
      branches: [
        { condition: "条件1", action: null, targetStateId: "C" },
        { condition: "条件2", action: "処理", targetStateId: "Y" },
      ],
    },
    { fromStateId: "X", eventId: "GO", action: null, targetStateId: "A" },
    { fromStateId: "U", eventId: "GO", action: null, targetStateId: "V" },
    { fromStateId: "V", eventId: "GO", action: null, targetStateId: "U" },
    { fromStateId: "W", eventId: "GO", action: null, targetStateId: "W" },
  ],
};
const pairs = [
  "C:C",
  "C:Y",
  "U:V",
  "V:U",
  "W:W",
  "X:A",
  "Z:X",
  "state-group:G:X",
];
const region = (page: Page) =>
  page.getByRole("region", { name: "状態遷移図", exact: true });
async function start(page: Page, light = false) {
  await page.addInitScript(() => {
    Object.assign(window, {
      notices: [],
      acquireVsCodeApi: () => ({
        postMessage: (value: unknown) =>
          (window as unknown as { notices: unknown[] }).notices.push(value),
      }),
    });
  });
  await page.goto("/");
  await page.evaluate((light) => {
    for (const [name, value] of Object.entries({
      "--vscode-foreground": light ? "#222222" : "#cccccc",
      "--vscode-editor-background": light ? "#ffffff" : "#1e1e1e",
      "--vscode-font-family": "sans-serif",
      "--vscode-button-background": "#0060c0",
      "--vscode-button-foreground": "#ffffff",
      "--vscode-focusBorder": "#007fd4",
    }))
      document.documentElement.style.setProperty(name, value);
  }, light);
}
async function show(
  page: Page,
  next: GlsModel | null = model,
  sequence = 1,
  hasErrors = false,
) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri: "file:///a.gls",
    version: sequence,
    sequence,
    model: next,
    hasErrors,
  });
  await expect
    .poll(() =>
      page.evaluate(
        (sequence) =>
          (
            window as unknown as {
              notices: { type: string; sequence: number }[];
            }
          ).notices.some(
            (m) => m.type === "glitchstate.rendered" && m.sequence === sequence,
          ),
        sequence,
      ),
    )
    .toBe(true);
}
async function image(page: Page) {
  return page.evaluate(async () => {
    const capturePath = "/pages/preview/ui/capture-state-diagram.ts";
    const serializePath = "/pages/preview/model/serialize-state-diagram.ts";
    const { captureStateDiagram } = await import(capturePath);
    const { serializeStateDiagram } = await import(serializePath);
    return serializeStateDiagram(
      captureStateDiagram(
        document.querySelector(".state-diagram-canvas") as HTMLElement,
      ),
    );
  });
}
async function openImage(page: Page, svg: string) {
  const exported = await page.context().newPage();
  await exported.goto(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
  return exported;
}
test("REQ-042-S01 図全体のノードと全有向ペアと実際の矢尻を保存する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const before = await image(page);
  await region(page).getByRole("button", { name: "拡大", exact: true }).click();
  const box = await region(page).locator(".react-flow__pane").boundingBox();
  if (!box) throw new Error("図がない");
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
  await page.mouse.up();
  const svg = await image(page);
  expect(svg).toBe(before);
  const exported = await openImage(page, svg);
  await expect(exported.locator("g[data-state-id]")).toHaveCount(ids.length);
  await expect(exported.locator("g[data-group-id]")).toHaveCount(2);
  expect(
    await exported
      .locator("path[data-edge-id]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-edge-id")).sort(),
      ),
  ).toEqual(pairs);
  for (const id of pairs)
    await assertArrowheadFollowsPath(
      exported.locator(`path[data-edge-id="${id}"]`),
    );
  const contained = await exported.locator("svg").evaluate((svg) => {
    const view = (svg as SVGSVGElement).viewBox.baseVal;
    return Array.from(
      svg.querySelectorAll(
        "g[data-state-id],g[data-group-id],path[data-edge-id]",
      ),
    ).every((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return (
        b.x >= view.x &&
        b.y >= view.y &&
        b.x + b.width <= view.x + view.width &&
        b.y + b.height <= view.y + view.height
      );
    });
  });
  expect(contained).toBe(true);
  await exported.close();
});
test("REQ-042-S02 選択強調と表と操作部を含めず通常の背景を保存する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const before = await image(page);
  await page.locator('.state-table tr[data-state-id="A"] button').click();
  expect(await image(page)).toBe(before);
  await expect(
    page.locator('.state-table tr[data-state-id="A"] button'),
  ).toHaveAttribute("aria-pressed", "true");
  const exported = await openImage(page, before);
  await expect(exported.locator("text")).toHaveCount(model.states.length + 2);
  await expect(
    exported.locator(
      "button,table,foreignObject,image,script,.react-flow__handle",
    ),
  ).toHaveCount(0);
  expect(await exported.locator("svg").textContent()).not.toMatch(
    /意味|開始イベント|共通処理|条件1|状態定義|状態遷移図|Reset|100%/,
  );
});
for (const light of [false, true])
  test(`REQ-042-S03 テーマの不透明背景と指定カラーを保存する light=${light}`, async ({
    page,
  }) => {
    await start(page, light);
    await show(page);
    const exported = await openImage(page, await image(page));
    await expect(exported.locator("svg > rect").first()).toHaveAttribute(
      "fill",
      light ? "rgb(255, 255, 255)" : "rgb(30, 30, 30)",
    );
    await expect(exported.locator('g[data-state-id="A"] text')).toHaveAttribute(
      "fill",
      "rgb(79, 70, 229)",
    );
    expect(
      await exported.locator("svg").evaluate((el) => el.outerHTML),
    ).not.toContain("var(");
  });
test("REQ-042-S04 REQ-042-S06 単独SVGで名前の文字列と折り返しの末尾を保つ", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const exported = await openImage(page, await image(page));
  expect(
    await exported.locator('g[data-state-id="A"] text').textContent(),
  ).toBe("<b>待機A&B</b>");
  expect(
    await exported.locator('g[data-state-id="C"] text').textContent(),
  ).toBe(long);
  await expect(exported.locator('g[data-state-id="C"] tspan')).not.toHaveCount(
    1,
  );
  expect(
    await exported
      .locator('g[data-group-id="state-group:G"] text')
      .textContent(),
  ).toBe(model.stateGroups?.[0].name);
  await expect(
    exported.locator("b,script,style,foreignObject,image,[href],[src]"),
  ).toHaveCount(0);
});
test("REQ-042-S07 矢印のない有効な状態も画像にする", async ({ page }) => {
  await start(page);
  await show(page, { states: model.states, events: [], transitions: [] });
  const exported = await openImage(page, await image(page));
  await expect(exported.locator("g[data-state-id]")).toHaveCount(ids.length);
  await expect(exported.locator("path[data-edge-id]")).toHaveCount(0);
});
test("REQ-042-S05 REQ-042-S03 PNGをデコードし不透明背景、状態、文字と矢印の実画素を確認する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  const svg = await image(page);
  const result = await page.evaluate(async (svg) => {
    const policy = document.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy";
    policy.content = "img-src blob:";
    document.head.append(policy);
    const path = "/pages/preview/ui/rasterize-state-diagram.ts";
    const { rasterizeStateDiagram } = await import(path);
    const data = await rasterizeStateDiagram(svg);
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvasがない");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    let colored = 0,
      light = 0,
      opaque = true;
    for (let i = 0; i < pixels.length; i += 4) {
      opaque &&= pixels[i + 3] === 255;
      if (pixels[i + 1] > pixels[i] + 20) colored++;
      if (
        pixels[i] > 60 &&
        Math.abs(pixels[i] - pixels[i + 1]) < 4 &&
        Math.abs(pixels[i] - pixels[i + 2]) < 4
      )
        light++;
    }
    return {
      signature: data.slice(0, 11),
      width: img.width,
      height: img.height,
      corner: Array.from(pixels.slice(0, 4)),
      colored,
      light,
      opaque,
    };
  }, svg);
  expect(result.signature).toBe("iVBORw0KGgo");
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.corner).toEqual([30, 30, 30, 255]);
  expect(result.opaque).toBe(true);
  expect(result.colored).toBeGreaterThan(100);
  expect(result.light).toBeGreaterThan(100);
});
const saveButton = (page: Page) =>
  region(page).getByRole("button", { name: "図をエクスポート", exact: true });
async function notices(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          notices: {
            type: string;
            requestId: string;
            sequence: number;
            data?: string;
            success?: boolean;
            format?: string;
          }[];
        }
      ).notices,
  );
}
async function finish(
  page: Page,
  start: { requestId: string; sequence: number },
) {
  await page.evaluate((data) => window.postMessage(data, "*"), {
    ...start,
    type: "glitchstate.export-finished",
    uri: "file:///a.gls",
    version: start.sequence,
  });
}
async function save(page: Page, format = "svg") {
  await saveButton(page).click();
  await expect
    .poll(
      async () =>
        (await notices(page)).filter(
          (n) => n.type === "glitchstate.export-start",
        ).length,
    )
    .toBeGreaterThan(0);
  const start = (await notices(page))
    .filter((n) => n.type === "glitchstate.export-start")
    .at(-1);
  if (!start) throw new Error("保存要求がない");
  await expect(saveButton(page)).toBeDisabled();
  await page.evaluate((data) => window.postMessage(data, "*"), {
    ...start,
    type: "glitchstate.export",
    uri: "file:///a.gls",
    version: start.sequence,
    format,
  });
  await expect
    .poll(async () =>
      (await notices(page)).some(
        (n) =>
          n.type === "glitchstate.export-result" &&
          n.requestId === start.requestId,
      ),
    )
    .toBe(true);
  const result = (await notices(page)).find(
    (n) =>
      n.type === "glitchstate.export-result" && n.requestId === start.requestId,
  );
  expect(result?.success).toBe(true);
  await finish(page, start);
  await expect(saveButton(page)).toBeEnabled();
  return result?.data ?? "";
}
test("REQ-041-S01 PNG生成要求を実際のPNG応答へ接続する", async ({ page }) => {
  await start(page);
  await show(page);
  expect(await save(page, "png")).toMatch(/^iVBORw0KGgo/);
});
test("REQ-041-S02 キーボードで保存を一度ずつ起動する", async ({ page }) => {
  await start(page);
  await show(page);
  await expect(saveButton(page)).toHaveText("⇩");
  await expect(saveButton(page)).toHaveAttribute("title", "図をエクスポート");
  for (const [i, key] of ["Enter", "Space"].entries()) {
    await region(page)
      .getByRole("button", { name: "拡大", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(saveButton(page)).toBeFocused();
    expect(
      (await notices(page)).filter(
        (n) => n.type === "glitchstate.export-start",
      ),
    ).toHaveLength(i);
    await expect(saveButton(page)).toHaveCSS("outline-style", "solid");
    await page.keyboard.press(key);
    await expect
      .poll(
        async () =>
          (await notices(page)).filter(
            (n) => n.type === "glitchstate.export-start",
          ).length,
      )
      .toBe(i + 1);
    const current = (await notices(page))
      .filter((n) => n.type === "glitchstate.export-start")
      .at(-1);
    if (!current) throw new Error("要求がない");
    await finish(page, current);
    await expect(saveButton(page)).toBeEnabled();
  }
});
for (const empty of [true, false])
  test(`REQ-041-S03 図がない場合は保存の入口がない empty=${empty}`, async ({
    page,
  }) => {
    await start(page);
    await show(
      page,
      empty ? { states: [], events: [], transitions: [] } : null,
      1,
      !empty,
    );
    await expect(saveButton(page)).toHaveCount(0);
    expect(
      (await notices(page)).filter(
        (n) => n.type === "glitchstate.export-start",
      ),
    ).toEqual([]);
  });
test("REQ-041-S03 計測中は保存せず準備後に保存できる", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.ResizeObserver;
    const callbacks: (() => void)[] = [];
    let held = true;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          if (held) callbacks.push(() => callback(entries, observer));
          else callback(entries, observer);
        });
      }
    };
    Object.assign(window, {
      release: () => {
        held = false;
        for (const f of callbacks.splice(0)) f();
      },
      pending: () => callbacks.length,
    });
  });
  await start(page);
  await page.evaluate((data) => window.postMessage(data, "*"), {
    type: "glitchstate.update",
    uri: "file:///a.gls",
    version: 1,
    sequence: 1,
    model,
    hasErrors: false,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { pending(): number }).pending(),
      ),
    )
    .toBeGreaterThan(0);
  await expect(saveButton(page)).toBeDisabled();
  expect(
    (await notices(page)).filter((n) => n.type === "glitchstate.export-start"),
  ).toEqual([]);
  await page.evaluate(() =>
    (window as unknown as { release(): void }).release(),
  );
  await expect(saveButton(page)).toBeEnabled();
  expect(await save(page)).toContain("<svg");
});
test("REQ-043-S01 未保存の正常表示を保持した後、修正した新しい図を保存する", async ({
  page,
}) => {
  await start(page);
  await show(page);
  await show(page, model, 2, true);
  const retained = await save(page);
  expect(retained).toContain("状態X");
  expect(retained).not.toContain("解析エラー");
  const repaired = {
    ...model,
    states: model.states.map((s) => ({ ...s, name: `修正${s.id}` })),
    transitions: [
      { fromStateId: "A", eventId: "GO", action: "新処理", targetStateId: "W" },
    ],
  };
  await show(page, repaired, 3);
  const current = await openImage(page, await save(page));
  await expect(current.locator('g[data-state-id="A"] text')).toHaveText(
    "修正A",
  );
  expect(
    await current.locator("path[data-edge-id]").getAttribute("data-edge-id"),
  ).toBe("A:W");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("REQ-043-S06 保存の成功、キャンセルと失敗で選択、図と両表、viewportと完了通知を変えない", async ({
  page,
}) => {
  await start(page);
  await show(page, model, 1, true);
  await page.locator('.state-table tr[data-state-id="A"] button').click();
  await region(page).getByRole("button", { name: "拡大", exact: true }).click();
  const snapshot = () =>
    page.evaluate(() => ({
      tables: Array.from(document.querySelectorAll("table"), (e) => [
        e.textContent,
        e.clientWidth,
        e.clientHeight,
      ]),
      viewport: document
        .querySelector(".react-flow__viewport")
        ?.getAttribute("style"),
      diagram: document.querySelector(".react-flow__nodes")?.innerHTML,
      ack: (
        window as unknown as { notices: { type: string }[] }
      ).notices.filter((n) => n.type === "glitchstate.rendered"),
    }));
  const before = await snapshot();
  await save(page);
  for (const fail of [false, true]) {
    await saveButton(page).click();
    const request = (await notices(page))
      .filter((n) => n.type === "glitchstate.export-start")
      .at(-1);
    if (!request) throw new Error("要求がない");
    if (fail) {
      await page.evaluate((data) => window.postMessage(data, "*"), {
        ...request,
        type: "glitchstate.export",
        uri: "file:///a.gls",
        version: 1,
        format: "svg",
        sequence: 2,
      });
    }
    await finish(page, request);
    await expect(saveButton(page)).toBeEnabled();
  }
  expect(await snapshot()).toEqual(before);
  await expect(
    page.locator('.state-table tr[data-state-id="A"] button'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toBeVisible();
});
