/** イベントの名前と識別子を検証する。 */
import type { EventDefinition, GlsDiagnostic } from "../model/gls-model";

export interface EventCandidate {
  readonly event: EventDefinition;
  readonly line: number;
}

/** イベントの必須項目とIDの重複を検証する。
 * @param candidates 元の宣言行とイベントの組。
 * @returns 不正な項目の理由と1始まりの行番号。
 */
export function validateEvents(
  candidates: readonly EventCandidate[],
): GlsDiagnostic[] {
  const diagnostics: GlsDiagnostic[] = [];
  const ids = new Set<string>();
  for (const { event, line } of candidates) {
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
