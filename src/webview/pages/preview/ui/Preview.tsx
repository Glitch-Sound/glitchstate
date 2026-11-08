/** 共通モデルから状態定義表、状態遷移図、状態遷移表を描画する。 */
import { type ReactElement, useEffect } from "react";
import type { GlsModel } from "../../../../core";
import { StateDiagram } from "./StateDiagram";
import { TransitionTable } from "./TransitionTable";
import "./preview.css";

interface PreviewProps {
  model: GlsModel | null;
  hasErrors: boolean;
  onRenderReady?: () => void;
}

/** 状態定義の内容と現在の解析状況を表示する。
 * @param props 定義順のモデル、解析エラーの有無と3表示の準備完了の通知先。
 * @returns 状態定義表、状態遷移図、状態遷移表、または表示できない理由。
 */
export function Preview(props: PreviewProps): ReactElement {
  const { model, hasErrors, onRenderReady } = props;
  useEffect(() => {
    if (model === null) onRenderReady?.();
  }, [model, onRenderReady]);
  return (
    <main>
      {hasErrors && (
        <p role="alert">解析エラーがある。Problemsを確認すること。</p>
      )}
      {model === null ? (
        <p role="status">解析エラーのため表示できない。</p>
      ) : (
        <>
          <section aria-labelledby="state-heading">
            <h1 id="state-heading">状態定義</h1>
            <table className="state-table" aria-label="状態定義">
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
          </section>
          <StateDiagram model={model} onRenderReady={onRenderReady} />
          <TransitionTable model={model} />
        </>
      )}
    </main>
  );
}
