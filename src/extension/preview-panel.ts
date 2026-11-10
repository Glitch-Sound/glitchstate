/** 単一のWebviewパネルと文書の表示通知を管理する。 */
import { readFileSync } from "node:fs";
import * as vscode from "vscode";
import { type PreviewUpdate, readWebviewMessage } from "../preview-protocol";
import { createDiagramExport } from "./diagram-export";

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
    `img-src blob:`,
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
  let displayed: PreviewUpdate | undefined;
  let listeners: vscode.Disposable[] = [];
  const rendered = new vscode.EventEmitter<PreviewUpdate>();
  const exporter = createDiagramExport({
    current: () => (panel ? current : undefined),
    pickFormat: async (items) =>
      (
        await vscode.window.showQuickPick(items, {
          placeHolder: "エクスポート形式を選択",
        })
      )?.format,
    pickDestination: async (options) =>
      (
        await vscode.window.showSaveDialog({
          ...options,
          defaultUri: vscode.Uri.parse(options.defaultUri),
        })
      )?.toString(),
    send: async (message) =>
      panel ? panel.webview.postMessage(message) : false,
    write: async (uri, bytes) =>
      vscode.workspace.fs.writeFile(vscode.Uri.parse(uri), bytes),
    notify: (message) => {
      void vscode.window.showErrorMessage(message);
    },
  });
  const accept = (data: PreviewUpdate) => {
    const changed =
      current?.uri !== data.uri ||
      current?.sequence !== data.sequence ||
      current?.version !== data.version;
    current = data;
    if (changed) {
      displayed = undefined;
      exporter.cancel();
    }
  };
  const send = () => {
    if (ready && current && panel) void panel.webview.postMessage(current);
  };
  const close = () => {
    ready = false;
    current = undefined;
    displayed = undefined;
    exporter.cancel();
    panel = undefined;
    for (const listener of listeners) listener.dispose();
    listeners = [];
  };
  return {
    onDidRenderPreview: rendered.event,
    currentPreviewUri: () => current?.uri,
    show(data: PreviewUpdate) {
      accept(data);
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
          exporter.receive(value);
          const message = readWebviewMessage(value);
          if (!message) return;
          if (message.type === "glitchstate.ready") {
            ready = true;
            send();
          } else if (message.type === "glitchstate.export-start") {
            if (
              displayed &&
              current?.model?.states.length &&
              message.uri === displayed.uri &&
              message.sequence === displayed.sequence &&
              message.version === displayed.version
            )
              void exporter.start(message);
            else
              void created.webview.postMessage({
                ...message,
                type: "glitchstate.export-finished",
              });
          } else if (
            message.type === "glitchstate.rendered" &&
            current &&
            message.uri === current.uri &&
            message.version === current.version &&
            message.sequence === current.sequence
          ) {
            displayed = current;
            rendered.fire(current);
          }
        }),
        created.onDidDispose(close),
        created.onDidChangeViewState(() => {
          if (created.visible) send();
        }),
      );
      created.webview.html = webviewHtml(created.webview, context.extensionUri);
    },
    update(data: PreviewUpdate) {
      // 文書を開き直すと版番号が戻るため、再オープンをまたぐ通知順で比較する。
      if (
        !current ||
        current.uri !== data.uri ||
        data.sequence <= current.sequence
      )
        return;
      accept(data);
      send();
    },
    dispose() {
      panel?.dispose();
      close();
      rendered.dispose();
    },
  };
}
