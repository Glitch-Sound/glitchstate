/** イベントの名前と識別子を検証する。 */
import type { EventDefinition, GlsDiagnostic } from "../model/gls-model";

export interface EventCandidate {
  readonly event: EventDefinition;
  readonly line: number;
}

export interface EventCategoryHeadersCandidate {
  readonly names: readonly string[];
  readonly line: number;
}

/** イベントの必須項目とIDの重複を検証する。
 * @param candidates 元の宣言行とイベントの組。
 * @param headers 文書内の列見出し宣言。省略された文書では空配列。
 * @returns 不正な項目の理由と1始まりの行番号。
 */
export function validateEvents(
  candidates: readonly EventCandidate[],
  headers: readonly EventCategoryHeadersCandidate[] = [],
): GlsDiagnostic[] {
  const diagnostics: GlsDiagnostic[] = [];
  const ids = new Set<string>();
  for (const [index, header] of headers.entries()) {
    if (index > 0)
      diagnostics.push({
        code: "duplicate-category-headers",
        line: header.line,
        message: "列見出し宣言が重複している",
      });
    if (header.names.length < 1 || header.names.length > 3)
      diagnostics.push({
        code: "category-headers-depth",
        line: header.line,
        message: "列見出しは1段から3段まで指定する",
      });
    if (header.names.some((name) => !name.trim()))
      diagnostics.push({
        code: "category-headers-name",
        line: header.line,
        message: "列見出し名には空白以外の文字が必要",
      });
  }
  let missingReported = false;
  for (const { event, line } of candidates) {
    const path = event.categoryPath;
    if (path) {
      if (path.length < 1 || path.length > 3)
        diagnostics.push({
          code: "category-depth",
          line,
          message: "分類は1段から3段まで指定する",
        });
      if (path.some((name) => !name.trim()))
        diagnostics.push({
          code: "category-name",
          line,
          message: "分類名には空白以外の文字が必要",
        });
      if (
        !missingReported &&
        path.length <= 3 &&
        path.length > (headers[0]?.names.length ?? 0)
      ) {
        diagnostics.push({
          code: "category-headers-missing",
          line,
          message: `分類${path.length}段に対する列見出し不足`,
        });
        missingReported = true;
      }
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(event.id))
      diagnostics.push({ code: "id", line, message: "イベントIDの形式が不正" });
    if (!event.name.trim())
      diagnostics.push({
        code: "name",
        line,
        message: "イベント名には空白以外の文字が必要",
      });
    if (ids.has(event.id))
      diagnostics.push({
        code: "duplicate-event-id",
        line,
        message: `イベントID ${event.id} が重複している`,
      });
    ids.add(event.id);
  }
  return diagnostics;
}
