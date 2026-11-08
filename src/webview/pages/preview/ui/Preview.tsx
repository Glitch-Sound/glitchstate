/** 共通モデルから状態定義表を描画する。 */
import type { ReactElement } from "react";
import type { GlsModel } from "../../../../core";
import "./preview.css";

interface PreviewProps {
  model: GlsModel | null;
  hasErrors: boolean;
}

/** 状態定義の内容と現在の解析状況を表示する。
 * @param props 定義順のモデルと現在の解析エラーの有無。
 * @returns 状態定義表または表示できない理由。
 */
export function Preview(props: PreviewProps): ReactElement {
  const { model, hasErrors } = props;
  return (
    <main>
      <h1>状態定義</h1>
      {hasErrors && (
        <p role="alert">解析エラーがある。Problemsを確認すること。</p>
      )}
      {model === null ? (
        <p role="status">解析エラーのため表示できない。</p>
      ) : (
        <>
          <table className="state-table">
            <thead>
              <tr>
                <th scope="col">色</th>
                <th scope="col">状態</th>
                <th scope="col">意味</th>
              </tr>
            </thead>
            <tbody>
              {model.states.map((state) => (
                <tr key={state.id}>
                  <td>
                    <svg
                      className="state-swatch"
                      viewBox="0 0 1 1"
                      aria-hidden="true"
                    >
                      <rect width="1" height="1" fill={state.color} />
                    </svg>
                  </td>
                  <td>{state.name}</td>
                  <td className="state-meaning">{state.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {model.states.length === 0 && (
            <p role="status">状態が定義されていない。</p>
          )}
        </>
      )}
    </main>
  );
}
