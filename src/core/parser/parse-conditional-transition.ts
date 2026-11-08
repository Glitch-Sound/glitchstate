/** 分岐付き遷移の共通処理と各分岐を元の行番号を保って解析する。 */
import type { GlsDiagnostic, TransitionBranch } from "../model/gls-model";
import type { TransitionCandidate } from "../validator/validate-transitions";

type BodyLine = { readonly text: string; readonly line: number };
type Section = {
  kind: "common" | "branch";
  line: number;
  condition?: string;
  targetStateId?: string | null;
  body: BodyLine[];
};

/** 分岐宣言と処理本文から検証用の遷移候補を作る。
 * @param reference Transition行の遷移元とイベントのID。
 * @param line Transition宣言の1始まりの行番号。
 * @param body インデントを含む本文と各行の元の行番号。
 * @returns 共通処理と定義順の分岐を持つ候補、構造と本文の診断。
 */
export function parseConditionalTransition(
  reference: { fromStateId: string; eventId: string },
  line: number,
  body: readonly BodyLine[],
): { candidate: TransitionCandidate; diagnostics: GlsDiagnostic[] } {
  const diagnostics: GlsDiagnostic[] = [];
  const branches: TransitionBranch[] = [];
  const branchLines: number[] = [];
  let commonAction: string | null = "";
  let commonCount = 0;
  let section: Section | undefined;
  const report = (code: string, at: number, message: string) => {
    diagnostics.push({ code, line: at, message });
  };
  const finish = () => {
    if (!section) return;
    const text = section.body.map((item) => item.text).join("\n");
    if (!text.trim())
      report(
        "action",
        section.line,
        `${section.kind === "common" ? "Common" : "Branch"}の処理または処理なしの指定が必要`,
      );
    if (
      section.body.length > 1 &&
      section.body.some((item) => item.text === "-")
    )
      report(
        "mixed-action",
        section.body[1].line,
        "処理なしの指定と他の本文行は混在できない",
      );
    const action = text === "-" ? null : text;
    if (section.kind === "common") commonAction = action;
    else {
      branches.push({
        condition: section.condition ?? "",
        action,
        targetStateId: section.targetStateId ?? null,
      });
      branchLines.push(section.line);
    }
    section = undefined;
  };
  for (const item of body) {
    if (/^ {4}\S/.test(item.text)) {
      finish();
      const text = item.text.slice(4);
      if (/^Common: *$/.test(text)) {
        commonCount++;
        if (commonCount > 1)
          report("duplicate-common", item.line, "Commonの宣言が重複している");
        else if (branches.length)
          report(
            "conditional-order",
            item.line,
            "Commonは分岐より先の順序で宣言する",
          );
        section = { kind: "common", line: item.line, body: [] };
      } else {
        const branch = /^Branch +"([^"\r\n]*)" +-> +([^ :]+): *$/.exec(text);
        if (branch)
          section = {
            kind: "branch",
            condition: branch[1],
            targetStateId: branch[2] === "-" ? null : branch[2],
            line: item.line,
            body: [],
          };
        else
          report(
            "conditional-syntax",
            item.line,
            "CommonまたはBranchの宣言の構文が不正",
          );
      }
    } else if (/^ {8}\S/.test(item.text)) {
      if (section)
        section.body.push({ text: item.text.slice(8), line: item.line });
      else
        report(
          "conditional-syntax",
          item.line,
          "処理に対応するCommonまたはBranchの宣言が必要",
        );
    } else
      report(
        "indent",
        item.line,
        "分岐のインデントには宣言で半角空白4個、処理で8個を使う",
      );
  }
  finish();
  if (!commonCount) report("conditional-common", line, "Commonの宣言が必要");
  if (!branches.length)
    report("conditional-branches", line, "1件以上の分岐の宣言が必要");
  return {
    candidate: {
      transition: { ...reference, commonAction, branches },
      line,
      body: [],
      branchLines,
    },
    diagnostics,
  };
}
