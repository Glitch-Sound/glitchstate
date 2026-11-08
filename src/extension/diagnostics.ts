/** Coreの診断をVS CodeのProblemsへ通知する。 */
import * as vscode from "vscode";
import type { GlsDiagnostic } from "../core";

/** 文書の現在の解析診断を登録し、解消した診断を除く。
 * @param document 診断の対象文書。
 * @param collection 拡張機能が管理する診断の登録先。
 * @param entries 元の行番号と理由を持つ現在の診断。
 */
export function publishDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  entries: readonly GlsDiagnostic[],
): void {
  collection.set(
    document.uri,
    entries.map((entry) => {
      const line = entry.line - 1;
      const range = new vscode.Range(
        line,
        0,
        line,
        document.lineAt(line).text.length,
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        entry.message,
        vscode.DiagnosticSeverity.Error,
      );
      diagnostic.code = entry.code;
      diagnostic.source = "GlitchState";
      return diagnostic;
    }),
  );
}
