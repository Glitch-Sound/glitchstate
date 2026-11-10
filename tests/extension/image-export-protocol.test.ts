import { expect, test } from "vitest";
import {
  readExportMessage,
  readWebviewMessage,
} from "../../src/preview-protocol";

const identity = {
  requestId: "export-1",
  uri: "file:///a.gls",
  version: 1,
  sequence: 9,
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>';
test("REQ-043-S03 保存の起動、生成要求、成功と失敗、終了を区別する", () => {
  for (const message of [
    { type: "glitchstate.export-start", ...identity },
    { type: "glitchstate.export", ...identity, format: "svg" },
    {
      type: "glitchstate.export-result",
      ...identity,
      format: "svg",
      success: true,
      data: svg,
    },
    {
      type: "glitchstate.export-result",
      ...identity,
      format: "png",
      success: false,
      error: "変換できない",
    },
    { type: "glitchstate.export-finished", ...identity },
  ])
    expect(readExportMessage(message)).toEqual(message);
  expect(
    readWebviewMessage({ type: "glitchstate.export-start", ...identity }),
  ).not.toBeNull();
  expect(
    readWebviewMessage({
      type: "glitchstate.export",
      ...identity,
      format: "svg",
    }),
  ).toBeNull();
});
test("REQ-043-S03 不正な識別子と形式と画像応答を受け付けない", () => {
  const result = {
    type: "glitchstate.export-result",
    ...identity,
    format: "svg",
    success: true,
    data: svg,
  };
  for (const bad of [
    { ...result, requestId: "" },
    { ...result, uri: "" },
    { ...result, version: -1 },
    { ...result, sequence: 0 },
    { ...result, format: "pdf" },
    { ...result, data: null },
    { ...result, data: "" },
    { ...result, data: 1 },
    { ...result, data: undefined },
    { ...result, format: "png" },
    { ...result, format: "png", data: "iVBORw0KGgo=" },
    { ...result, data: "<html>画像ではない</html>" },
    { ...result, destination: "file:///unexpected.svg" },
  ])
    expect(readExportMessage(bad)).toBeNull();
});
