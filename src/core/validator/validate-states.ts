/** 状態定義の内容と識別子の整合性を検証する。 */
import type { GlsDiagnostic, StateDefinition } from "../model/gls-model";

export interface StateCandidate {
  readonly state: StateDefinition;
  readonly line: number;
}

/** 解析した状態の必須項目とIDの重複を検証する。
 * @param candidates 元の宣言行と状態定義の組。
 * @returns 不正な項目の理由と1始まりの行番号。
 */
export function validateStates(
  candidates: readonly StateCandidate[],
): GlsDiagnostic[] {
  const diagnostics: GlsDiagnostic[] = [];
  const ids = new Set<string>();
  for (const { state, line } of candidates) {
    const add = (code: string, message: string) =>
      diagnostics.push({ code, line, message });
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(state.id))
      add("id", "状態IDの形式が不正");
    if (!state.name.trim()) add("name", "状態名には空白以外の文字が必要");
    if (!/^#[a-fA-F0-9]{6}$/.test(state.color))
      add("color", "カラーは#と6桁の16進数字で指定する");
    if (!state.meaning.trim()) add("meaning", "状態の意味が必要");
    if (ids.has(state.id))
      add("duplicate-id", `状態ID ${state.id} が重複している`);
    ids.add(state.id);
  }
  return diagnostics;
}
