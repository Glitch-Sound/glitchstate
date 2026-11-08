/** 共通処理の下に定義順の分岐を並べてセル内部を描画する。 */
import type { ReactElement } from "react";
import type { ConditionalTransitionDefinition } from "../../../../core";

/** 共通処理と各条件の処理と遷移先を表示する。
 * @param props 同じ交点の分岐付き遷移と、状態IDに対応する表示名。
 * @returns 共通処理の下部だけを横方向へ分割したセルの内容。
 */
export function ConditionalTransitionCell(props: {
  transition: ConditionalTransitionDefinition;
  names: ReadonlyMap<string, string>;
}): ReactElement {
  const { transition, names } = props;
  return (
    <>
      <div className="transition-common">{transition.commonAction ?? "-"}</div>
      <div
        className="transition-branches"
        style={{
          gridTemplateColumns: `repeat(${transition.branches.length}, minmax(0, 1fr))`,
        }}
      >
        {transition.branches.map((branch) => (
          <div key={branch.condition} className="transition-branch">
            <div className="branch-condition">{branch.condition}</div>
            <div className="branch-action">{branch.action ?? "-"}</div>
            <div className="branch-target">
              {branch.targetStateId === null
                ? "-"
                : names.get(branch.targetStateId)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
