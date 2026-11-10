import { afterEach, expect, test, vi } from "vitest";
import {
  createDiagramExport,
  EXPORT_TIMEOUT_MS,
} from "../../src/extension/diagram-export";
import type { ExportMessage, ExportRequest } from "../../src/preview-protocol";

const source = { uri: "file:///folder/design.gls", version: 1, sequence: 9 };
const begin = {
  type: "glitchstate.export-start" as const,
  requestId: "save-1",
  ...source,
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>';
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=";
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup(format: "svg" | "png" = "svg") {
  let current: typeof source | undefined = { ...source };
  const requests: ExportRequest[] = [];
  const port = {
    current: () => current,
    pickFormat: vi.fn(
      async (_options: unknown) => format as "svg" | "png" | undefined,
    ),
    pickDestination: vi.fn(
      async (_options: unknown) =>
        `file:///output/result.${format}` as string | undefined,
    ),
    send: vi.fn(async (message: ExportMessage) => {
      if (message.type === "glitchstate.export") requests.push(message);
      return true;
    }),
    write: vi.fn(async (_uri: string, _bytes: Uint8Array) => {}),
    notify: vi.fn((_message: string) => {}),
  };
  const flow = createDiagramExport(port);
  const answer = (changes = {}) =>
    flow.receive({
      ...requests.at(-1),
      success: true,
      data: format === "svg" ? svg : png,
      ...changes,
      type: "glitchstate.export-result",
    });
  return {
    flow,
    port,
    requests,
    answer,
    change: (value?: typeof source) => {
      current = value;
    },
  };
}
afterEach(() => vi.useRealTimers());
for (const format of ["png", "svg"] as const)
  test(`REQ-041-S01 指定した${format}の保存先へ画像のバイト列を書き込む`, async () => {
    const h = setup(format);
    const task = h.flow.start(begin);
    await flush();
    expect(h.port.pickFormat.mock.calls[0][0]).toEqual([
      { label: "PNG", description: "高解像度の画像", format: "png" },
      { label: "SVG", description: "拡大可能なベクター画像", format: "svg" },
    ]);
    expect(h.port.pickDestination).toHaveBeenCalledWith({
      defaultUri: `file:///folder/design.${format}`,
      filters: { [format.toUpperCase()]: [format] },
      saveLabel: "図を保存",
    });
    h.answer();
    await task;
    expect(h.port.write).toHaveBeenCalledExactlyOnceWith(
      `file:///output/result.${format}`,
      format === "svg" ? Buffer.from(svg) : Buffer.from(png, "base64"),
    );
    expect(h.port.notify).not.toHaveBeenCalled();
    expect(h.port.send).toHaveBeenLastCalledWith({
      type: "glitchstate.export-finished",
      ...source,
      requestId: "save-1",
    });
  });
for (const stage of ["pickFormat", "pickDestination"] as const)
  test(`REQ-041-S05 ${stage}のキャンセルは書き込まず再操作できる`, async () => {
    const h = setup();
    h.port[stage].mockResolvedValueOnce(undefined);
    await h.flow.start(begin);
    expect(h.port.write).not.toHaveBeenCalled();
    expect(h.port.notify).not.toHaveBeenCalled();
    const retry = h.flow.start({ ...begin, requestId: "save-2" });
    await flush();
    h.answer();
    await retry;
    expect(h.port.write).toHaveBeenCalledTimes(1);
  });
test("REQ-041-S04 保存中はダイアログと画像生成を重複させない", async () => {
  const h = setup();
  const first = h.flow.start(begin);
  await flush();
  await h.flow.start({ ...begin, requestId: "duplicate" });
  expect(h.port.pickFormat).toHaveBeenCalledTimes(1);
  expect(h.requests).toHaveLength(1);
  h.answer();
  await first;
});
for (const stage of ["pickFormat", "pickDestination", "generation"] as const)
  test(`REQ-043-S02 ${stage}で更新された内容を保存しない`, async () => {
    const h = setup();
    if (stage !== "generation")
      h.port[stage].mockImplementationOnce(async () => {
        h.change({ ...source, sequence: 10 });
        return stage === "pickFormat" ? "svg" : "file:///output/result.svg";
      });
    const task = h.flow.start(begin);
    await flush();
    if (stage === "generation") {
      h.change({ ...source, uri: "file:///other.gls" });
      h.answer();
    }
    await task;
    expect(h.port.write).not.toHaveBeenCalled();
    expect(h.port.notify).toHaveBeenCalledWith(expect.stringContaining("更新"));
  });
test("REQ-043-S03 古い要求、別文書と古い通知の応答を無視する", async () => {
  const h = setup();
  const task = h.flow.start(begin);
  await flush();
  for (const changes of [
    { requestId: "old" },
    { uri: "file:///other.gls" },
    { sequence: 8 },
    { version: 2 },
  ]) {
    h.answer(changes);
    await flush();
    expect(h.port.write).not.toHaveBeenCalled();
  }
  expect(h.port.write).not.toHaveBeenCalled();
  expect(h.port.notify).not.toHaveBeenCalled();
  h.answer();
  await task;
  expect(h.port.write).toHaveBeenCalledTimes(1);
});
for (const switchDocument of [false, true])
  test(`REQ-043-S02 PNG生成待機中の更新を中止し現在の対象へ再操作する switch=${switchDocument}`, async () => {
    const h = setup("png");
    const first = h.flow.start(begin);
    await flush();
    const previous = h.requests[0];
    const current = {
      uri: switchDocument ? "file:///other.gls" : source.uri,
      version: switchDocument ? 1 : 2,
      sequence: 10,
    };
    h.change(current);
    h.flow.cancel();
    await first;
    h.flow.receive({
      ...previous,
      type: "glitchstate.export-result",
      success: true,
      data: png,
    });
    expect(h.port.write).not.toHaveBeenCalled();
    expect(h.port.notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("更新"),
    );
    const retry = h.flow.start({
      ...begin,
      ...current,
      requestId: "current-png",
    });
    await flush();
    expect(h.requests.at(-1)).toEqual({
      ...current,
      requestId: "current-png",
      type: "glitchstate.export",
      format: "png",
    });
    h.answer();
    await retry;
    expect(h.port.write).toHaveBeenCalledExactlyOnceWith(
      "file:///output/result.png",
      Buffer.from(png, "base64"),
    );
  });
for (const changes of [
  { format: "png" },
  { data: "not an image" },
  { data: "" },
  { success: false, error: "画像を生成できない" },
])
  test(`REQ-043-S03 不正な現在の結果は保存しない ${JSON.stringify(changes)}`, async () => {
    const h = setup();
    const task = h.flow.start(begin);
    await flush();
    h.answer(changes);
    await task;
    expect(h.port.write).not.toHaveBeenCalled();
    expect(h.port.notify).toHaveBeenCalledTimes(1);
  });
for (const failure of ["send", "write", "extension", "timeout"] as const)
  test(`REQ-043-S04 ${failure}の失敗を通知して再操作する`, async () => {
    const h = setup();
    vi.useFakeTimers();
    if (failure === "send") h.port.send.mockResolvedValueOnce(false);
    if (failure === "write")
      h.port.write.mockRejectedValueOnce(new Error("書き込めない"));
    if (failure === "extension")
      h.port.pickDestination.mockResolvedValueOnce("file:///output/result.png");
    const task = h.flow.start(begin);
    await flush();
    if (failure === "timeout")
      await vi.advanceTimersByTimeAsync(EXPORT_TIMEOUT_MS);
    else if (failure === "write") h.answer();
    await task;
    expect(h.port.notify).toHaveBeenCalledTimes(1);
    if (failure !== "write") expect(h.port.write).not.toHaveBeenCalled();
    const retry = h.flow.start({ ...begin, requestId: "save-2" });
    await flush();
    h.answer();
    await retry;
    expect(h.port.write).toHaveBeenLastCalledWith(
      "file:///output/result.svg",
      Buffer.from(svg),
    );
  });
test("REQ-043-S05 パネルを閉じた後の応答では書き込まない", async () => {
  const h = setup();
  const task = h.flow.start(begin);
  await flush();
  h.change();
  h.flow.cancel();
  await task;
  h.answer();
  expect(h.port.write).not.toHaveBeenCalled();
});
