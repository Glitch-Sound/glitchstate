/** VS Codeの文書をCoreで解析し、状態定義プレビューへ接続する。 */
import * as vscode from "vscode";
import { type GlsModel, parseGls } from "../core";
import type { PreviewUpdate } from "../preview-protocol";
import { publishDiagnostics } from "./diagnostics";
import { createPreviewPanel } from "./preview-panel";

/** 文書とプレビューの連携と変更監視を登録する。
 * @param context 拡張機能の登録情報と配置先。
 * @returns 実際の描画完了の購読と現在の対象URIの取得操作。
 */
export function activate(context: vscode.ExtensionContext) {
  const preview = createPreviewPanel(context);
  const diagnostics =
    vscode.languages.createDiagnosticCollection("glitchstate");
  const lastGood = new Map<string, GlsModel>();
  const versions = new Map<string, number>();
  const revisions = new Map<string, number>();
  let sequence = 0;
  let revision = 0;
  const refresh = (document: vscode.TextDocument, reveal: boolean) => {
    if (document.isClosed || !document.fileName.endsWith(".gls")) return;
    const uri = document.uri.toString();
    const version = document.version;
    if (version < (versions.get(uri) ?? 0)) return;
    versions.set(uri, version);
    const request = ++revision;
    revisions.set(uri, request);
    const parsed = parseGls(document.getText());
    if (document.version !== version || revisions.get(uri) !== request) return;
    if (parsed.model) lastGood.set(uri, parsed.model);
    publishDiagnostics(document, diagnostics, parsed.diagnostics);
    const data: PreviewUpdate = {
      type: "glitchstate.update",
      uri,
      version,
      sequence: ++sequence,
      model: parsed.model ?? lastGood.get(uri) ?? null,
      hasErrors: parsed.diagnostics.length > 0,
    };
    if (reveal) preview.show(data);
    else preview.update(data);
  };
  context.subscriptions.push(
    preview,
    diagnostics,
    {
      dispose: () => {
        versions.clear();
        revisions.clear();
        lastGood.clear();
      },
    },
    vscode.commands.registerCommand("glitchstate.openPreview", () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document) refresh(document, true);
    }),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      if (document.uri.toString() === preview.currentPreviewUri())
        refresh(document, false);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const uri = document.uri.toString();
      versions.delete(uri);
      revisions.delete(uri);
      lastGood.delete(uri);
      diagnostics.delete(document.uri);
    }),
  );
  return {
    onDidRenderPreview: preview.onDidRenderPreview,
    currentPreviewUri: preview.currentPreviewUri,
  };
}
