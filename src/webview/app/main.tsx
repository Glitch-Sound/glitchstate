/** VS Codeの通知を受け取り、共通モデルをプレビューへ渡す。 */
import React, { useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  type ExportRequest,
  type ExportStart,
  isPreviewUpdate,
  type PreviewUpdate,
  readExportMessage,
  type WebviewMessage,
} from "../../preview-protocol";
import { MAX_EXPORT_ERROR_LENGTH } from "../../preview-protocol/export-config";
import {
  diagramViewportStore,
  Preview,
  rasterizeStateDiagram,
  stateSelectionStore,
} from "../pages/preview";
import { completePreviewRender } from "./render-completion";
import "./style.css";

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewMessage): void;
};
const vscode = acquireVsCodeApi();
const element = document.getElementById("root");
if (element === null) throw new Error("Webviewの起動先が見つからない");
const root = createRoot(element);

function PreviewRoot({
  message,
  generation,
  busy,
}: {
  message: PreviewUpdate;
  generation: number;
  busy: boolean;
}) {
  const onRenderReady = useCallback(() => {
    completePreviewRender(message, latest, (value) =>
      vscode.postMessage(value),
    );
  }, [message]);
  const onImageReady = useCallback(
    (capture: (() => string) | null) => {
      if (message === latest && generation === activeGeneration)
        currentCapture = capture ? { generation, capture } : null;
    },
    [message, generation],
  );
  const onExport = useCallback(() => {
    if (
      exporting ||
      message !== latest ||
      currentCapture?.generation !== generation
    )
      return;
    exporting = {
      type: "glitchstate.export-start",
      requestId: crypto.randomUUID(),
      uri: message.uri,
      version: message.version,
      sequence: message.sequence,
    };
    renderLatest();
    vscode.postMessage(exporting);
  }, [message, generation]);
  return (
    <Preview
      documentUri={message.uri}
      generation={generation}
      model={message.model}
      hasErrors={message.hasErrors}
      onRenderReady={onRenderReady}
      onImageReady={onImageReady}
      onExport={onExport}
      exportBusy={busy}
    />
  );
}

let latest: PreviewUpdate | undefined;
let activeGeneration = 0;
let exporting: ExportStart | null = null;
let currentCapture: { generation: number; capture(): string } | null = null;
const same = (
  a: Pick<PreviewUpdate, "uri" | "version" | "sequence">,
  b?: Pick<PreviewUpdate, "uri" | "version" | "sequence"> | null,
) => a.uri === b?.uri && a.version === b.version && a.sequence === b.sequence;
function renderLatest() {
  if (latest)
    root.render(
      <React.StrictMode>
        <PreviewRoot
          message={latest}
          generation={activeGeneration}
          busy={exporting !== null}
        />
      </React.StrictMode>,
    );
}
async function generateImage(request: ExportRequest) {
  try {
    if (
      !same(request, latest) ||
      !currentCapture ||
      currentCapture.generation !== activeGeneration ||
      request.requestId !== exporting?.requestId
    )
      throw new Error("図が更新されたため再操作してください");
    const generation = activeGeneration;
    const svg = currentCapture.capture();
    const data =
      request.format === "png" ? await rasterizeStateDiagram(svg) : svg;
    if (!same(request, latest) || generation !== activeGeneration)
      throw new Error("図が更新されたため再操作してください");
    vscode.postMessage({
      ...request,
      type: "glitchstate.export-result",
      success: true,
      data,
    });
  } catch (error) {
    vscode.postMessage({
      ...request,
      type: "glitchstate.export-result",
      success: false,
      error: (error instanceof Error ? error.message : String(error)).slice(
        0,
        MAX_EXPORT_ERROR_LENGTH,
      ),
    });
  }
}
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const exportMessage = readExportMessage(event.data);
  if (exportMessage?.type === "glitchstate.export") {
    void generateImage(exportMessage);
    return;
  }
  if (exportMessage?.type === "glitchstate.export-finished") {
    if (
      exporting &&
      exportMessage.requestId === exporting.requestId &&
      same(exportMessage, exporting)
    ) {
      exporting = null;
      renderLatest();
    }
    return;
  }
  const message = event.data;
  if (!isPreviewUpdate(message)) return;
  // 同じURIでも文書の再オープンで版番号が戻るため、通知の通し番号を使う。
  if (latest && message.sequence < latest.sequence) return;
  stateSelectionStore.getState().reconcile(message.uri, message.model);
  const generation = diagramViewportStore.getState().accept(message.uri);
  activeGeneration = generation;
  currentCapture = null;
  latest = message;
  renderLatest();
});
root.render(<p role="status">プレビューを準備している。</p>);
vscode.postMessage({ type: "glitchstate.ready" });
