/** 遷移の処理、参照と組み合わせの重複を検証する。 */
import type {
  EventDefinition,
  GlsDiagnostic,
  StateDefinition,
  TransitionDefinition,
} from "../model/gls-model";

export interface TransitionCandidate {
  readonly transition: TransitionDefinition;
  readonly line: number;
  readonly body: readonly { readonly text: string; readonly line: number }[];
  readonly branchLines?: readonly number[];
}

/** 文書全体の宣言に対して遷移を検証する。
 * @param candidates 元の宣言行と処理の行を持つ遷移候補。
 * @param states 同じ文書で宣言された状態。
 * @param events 同じ文書で宣言されたイベント。
 * @returns 参照、処理、重複の理由と1始まりの行番号。
 */
export function validateTransitions(
  candidates: readonly TransitionCandidate[],
  states: readonly StateDefinition[],
  events: readonly EventDefinition[],
): GlsDiagnostic[] {
  const diagnostics: GlsDiagnostic[] = [];
  const stateIds = new Set(states.map((state) => state.id));
  const eventIds = new Set(events.map((event) => event.id));
  const pairs = new Set<string>();
  const reference = (
    id: string | null,
    kind: string,
    ids: Set<string>,
    line: number,
  ) => {
    if (id === null) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))
      diagnostics.push({
        code: "id",
        line,
        message: `${kind}IDの形式が不正`,
      });
    else if (!ids.has(id))
      diagnostics.push({
        code: "reference",
        line,
        message: `${kind}ID ${id} は未宣言`,
      });
  };
  for (const { transition, line, body, branchLines } of candidates) {
    const { fromStateId, eventId } = transition;
    reference(fromStateId, "遷移元状態", stateIds, line);
    reference(eventId, "イベント", eventIds, line);
    if ("branches" in transition) {
      const conditions = new Set<string>();
      for (const [index, branch] of transition.branches.entries()) {
        const at = branchLines?.[index] ?? line;
        reference(branch.targetStateId, "遷移先状態", stateIds, at);
        if (!branch.condition.trim())
          diagnostics.push({
            code: "condition",
            line: at,
            message: "条件名には空白以外の文字が必要",
          });
        if (conditions.has(branch.condition))
          diagnostics.push({
            code: "duplicate-condition",
            line: at,
            message: `条件名 ${branch.condition} が重複している`,
          });
        conditions.add(branch.condition);
      }
    } else {
      reference(transition.targetStateId, "遷移先状態", stateIds, line);
      const { action } = transition;
      if (action !== null && !action.trim())
        diagnostics.push({
          code: "action",
          line,
          message: "遷移の処理または処理なしの指定が必要",
        });
      if (body.length > 1 && body.some((item) => item.text === "-"))
        diagnostics.push({
          code: "mixed-action",
          line: body[1].line,
          message: "処理なしの指定と他の本文行は混在できない",
        });
    }
    const key = `${fromStateId}:${eventId}`;
    if (pairs.has(key))
      diagnostics.push({
        code: "duplicate-transition",
        line,
        message: `遷移元状態ID ${fromStateId} とイベントID ${eventId} の組み合わせが重複している`,
      });
    pairs.add(key);
  }
  return diagnostics;
}
