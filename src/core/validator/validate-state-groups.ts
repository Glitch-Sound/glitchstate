/** グループの名前と所属状態、重複を元の宣言位置で検証する。 */
import type {
  GlsDiagnostic,
  StateDefinition,
  StateGroupDefinition,
} from "../model/gls-model";

export interface StateGroupCandidate {
  readonly group: StateGroupDefinition;
  readonly line: number;
  readonly members: readonly { readonly text: string; readonly line: number }[];
}

/** 全状態の宣言に対してグループと所属の整合性を確かめる。
 * @param candidates 宣言行と各所属行を持つグループ候補。
 * @param states 文書内で宣言された参照先の状態。
 * @returns 誤りの理由と1始まりの元の行番号。
 */
export function validateStateGroups(
  candidates: readonly StateGroupCandidate[],
  states: readonly StateDefinition[],
): GlsDiagnostic[] {
  const diagnostics: GlsDiagnostic[] = [];
  const stateIds = new Set(states.map((state) => state.id));
  const groupIds = new Set<string>();
  const owners = new Map<string, number>();
  const report = (code: string, line: number, message: string) =>
    diagnostics.push({ code, line, message });
  for (const [index, { group, line, members }] of candidates.entries()) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(group.id))
      report("id", line, "グループIDの形式が不正");
    if (!group.name.trim())
      report("name", line, "グループの名前には空白以外の文字が必要");
    if (groupIds.has(group.id))
      report(
        "duplicate-group-id",
        line,
        `グループID ${group.id} が重複している`,
      );
    groupIds.add(group.id);
    if (group.stateIds.length < 2)
      report("group-size", line, "グループには異なる2状態以上が必要");
    const seen = new Set<string>();
    for (const member of members) {
      const id = member.text.replace(/ +$/, "");
      if (/\s|,|:/.test(id))
        report(
          "group-member-syntax",
          member.line,
          "所属には1行1件の状態IDが必要",
        );
      else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))
        report("id", member.line, "所属状態IDの形式が不正");
      else if (!stateIds.has(id))
        report("reference", member.line, `所属状態ID ${id} は未宣言`);
      if (seen.has(id))
        report(
          "duplicate-group-member",
          member.line,
          `所属状態ID ${id} が同じグループ内で重複している`,
        );
      else if (owners.has(id) && owners.get(id) !== index)
        report(
          "duplicate-group-membership",
          member.line,
          `所属状態ID ${id} が複数グループに所属している`,
        );
      seen.add(id);
      owners.set(id, index);
    }
  }
  return diagnostics;
}
