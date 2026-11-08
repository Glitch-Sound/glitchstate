/** VS Codeの通知を受け取り、共通モデルをプレビューへ渡す。 */
import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  isPreviewUpdate,
  type PreviewUpdate,
  type WebviewMessage,
} from "../../preview-protocol";
import { Preview } from "../pages/preview";
import "./style.css";

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewMessage): void;
};
const vscode = acquireVsCodeApi();
const element = document.getElementById("root");
if (element === null) throw new Error("Webviewの起動先が見つからない");
const root = createRoot(element);

function PreviewRoot({ message }: { message: PreviewUpdate }) {
  useLayoutEffect(() => {
    vscode.postMessage({
      type: "glitchstate.rendered",
      uri: message.uri,
      version: message.version,
      sequence: message.sequence,
    });
  }, [message]);
  return <Preview model={message.model} hasErrors={message.hasErrors} />;
}

let latest: PreviewUpdate | undefined;
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isPreviewUpdate(message)) return;
  if (
    latest &&
    (message.sequence < latest.sequence ||
      (message.uri === latest.uri && message.version < latest.version))
  )
    return;
  latest = message;
  root.render(
    <React.StrictMode>
      <PreviewRoot message={message} />
    </React.StrictMode>,
  );
});
root.render(<p role="status">プレビューを準備している。</p>);
vscode.postMessage({ type: "glitchstate.ready" });
