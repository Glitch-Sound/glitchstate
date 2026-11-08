/** 単一のWebviewパネルと文書の表示通知を管理する。 */
import { readFileSync } from "node:fs";
import * as vscode from "vscode";
import { type PreviewUpdate, readWebviewMessage } from "../preview-protocol";

function webviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const outputUri = vscode.Uri.joinPath(extensionUri, "dist", "webview");
  const html = readFileSync(
    vscode.Uri.joinPath(outputUri, "index.html").fsPath,
    "utf8",
  );
  const assetRoot = webview.asWebviewUri(
    vscode.Uri.joinPath(outputUri, "assets"),
  );
  const policy = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
    `script-src ${webview.cspSource}`,
  ].join("; ");
  return html
    .replaceAll("./assets/", `${assetRoot.toString()}/`)
    .replace(
      "</head>",
      `<meta http-equiv="Content-Security-Policy" content="${policy}"></head>`,
    );
}

/** 準備完了と描画完了を照合して状態プレビューを管理する。
 * @param context 拡張機能の配置先と購読情報。
 * @returns 表示、対象の取得、描画完了の購読、後始末の操作。
 */
export function createPreviewPanel(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  let current: PreviewUpdate | undefined;
  let ready = false;
  let listeners: vscode.Disposable[] = [];
  const rendered = new vscode.EventEmitter<PreviewUpdate>();
  const send = () => {
    if (ready && current && panel) void panel.webview.postMessage(current);
  };
  const close = () => {
    ready = false;
    current = undefined;
    panel = undefined;
    for (const listener of listeners) listener.dispose();
    listeners = [];
  };
  return {
    onDidRenderPreview: rendered.event,
    currentPreviewUri: () => current?.uri,
    show(data: PreviewUpdate) {
      current = data;
      if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
        send();
        return;
      }
      const created = vscode.window.createWebviewPanel(
        "glitchstate.preview",
        "GlitchState",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "dist", "webview"),
          ],
        },
      );
      panel = created;
      listeners.push(
        created.webview.onDidReceiveMessage((value: unknown) => {
          const message = readWebviewMessage(value);
          if (!message) return;
          if (message.type === "glitchstate.ready") {
            ready = true;
            send();
          } else if (
            current &&
            message.uri === current.uri &&
            message.version === current.version &&
            message.sequence === current.sequence
          )
            rendered.fire(current);
        }),
        created.onDidDispose(close),
        created.onDidChangeViewState(() => {
          if (created.visible) send();
        }),
      );
      created.webview.html = webviewHtml(created.webview, context.extensionUri);
    },
    update(data: PreviewUpdate) {
      if (
        !current ||
        current.uri !== data.uri ||
        data.sequence <= current.sequence ||
        data.version < current.version
      )
        return;
      current = data;
      send();
    },
    dispose() {
      panel?.dispose();
      close();
      rendered.dispose();
    },
  };
}
