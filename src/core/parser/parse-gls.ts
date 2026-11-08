/** .glsの宣言と本文を元の行番号を保って解析する。 */
import type { GlsDiagnostic, ParseResult } from "../model/gls-model";

import {
  type StateCandidate,
  validateStates,
} from "../validator/validate-states";

/** 状態定義の本文を解析する。
 * @param source 保存前を含む文書の本文。
 * @returns 定義順のモデルまたは元の行を持つ診断。
 */
export function parseGls(source: string): ParseResult {
  const candidates: StateCandidate[] = [];
  const diagnostics: GlsDiagnostic[] = [];
  let current:
    | { id: string; name: string; color: string; line: number; lines: string[] }
    | undefined;
  const finish = () => {
    if (!current) return;
    candidates.push({
      line: current.line,
      state: {
        id: current.id,
        name: current.name,
        color: current.color,
        meaning: current.lines.join("\n"),
      },
    });
    current = undefined;
  };
  for (const [index, line] of source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .entries()) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) {
      if (current && /^ {4}\S/.test(line)) current.lines.push(line.slice(4));
      else
        diagnostics.push({
          code: "indent",
          line: index + 1,
          message: "意味のインデントには半角空白4個を使う",
        });
      continue;
    }
    finish();
    const match =
      /^State +([^ ]+) +as +"([^"\r\n]*)" +color +"([^"]*)": *$/.exec(line);
    if (match)
      current = {
        id: match[1],
        name: match[2],
        color: match[3],
        line: index + 1,
        lines: [],
      };
    else
      diagnostics.push({
        code: line.startsWith("State") ? "syntax" : "unsupported",
        line: index + 1,
        message: line.startsWith("State")
          ? "状態宣言の構文が不正"
          : "未対応の記述",
      });
  }
  finish();
  diagnostics.push(...validateStates(candidates));
  return {
    model: diagnostics.length
      ? null
      : { states: candidates.map((candidate) => candidate.state) },
    diagnostics,
  };
}
