/** VS Code拡張機能の起動と開発用Webviewの表示を担当する。 */
import { readFileSync } from "node:fs";
import * as vscode from "vscode";

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
  const contentSecurityPolicy = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src ${webview.cspSource}`,
  ].join("; ");

  return html
    .replaceAll("./assets/", `${assetRoot.toString()}/`)
    .replace(
      "</head>",
      `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"></head>`,
    );
}

/** 拡張機能を起動し、プレビュー画面を開くコマンドを登録する。
 *
 * @param context 拡張機能の登録情報と配置先を保持するコンテキスト。
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("glitchstate.openPreview", () => {
      const panel = vscode.window.createWebviewPanel(
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
      panel.webview.html = webviewHtml(panel.webview, context.extensionUri);
    }),
  );
}
