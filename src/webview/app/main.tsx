/** VS Codeの通知を受け取り、共通モデルをプレビューへ渡す。 */
import React, { useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  isPreviewUpdate,
  type PreviewUpdate,
  type WebviewMessage,
} from "../../preview-protocol";
import { Preview } from "../pages/preview";
import { completePreviewRender } from "./render-completion";
import "./style.css";

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewMessage): void;
};
const vscode = acquireVsCodeApi();
const element = document.getElementById("root");
if (element === null) throw new Error("Webviewの起動先が見つからない");
const root = createRoot(element);

function PreviewRoot({ message }: { message: PreviewUpdate }) {
  const onRenderReady = useCallback(() => {
    completePreviewRender(message, latest, (value) =>
      vscode.postMessage(value),
    );
  }, [message]);
  return (
    <Preview
      model={message.model}
      hasErrors={message.hasErrors}
      onRenderReady={onRenderReady}
    />
  );
}

let latest: PreviewUpdate | undefined;
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isPreviewUpdate(message)) return;
  // 同じURIでも文書の再オープンで版番号が戻るため、通知の通し番号を使う。
  if (latest && message.sequence < latest.sequence) return;
  latest = message;
  root.render(
    <React.StrictMode>
      <PreviewRoot message={message} />
    </React.StrictMode>,
  );
});
root.render(<p role="status">プレビューを準備している。</p>);
vscode.postMessage({ type: "glitchstate.ready" });
