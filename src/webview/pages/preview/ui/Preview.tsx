/** 共通モデルから状態定義表、状態遷移図、状態遷移表を描画する。 */
import { type ReactElement, useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { GlsModel } from "../../../../core";
import { stateSelectionStore } from "../model/state-selection";
import { StateDiagram } from "./StateDiagram";
import { TransitionTable } from "./TransitionTable";
import "./preview.css";

interface PreviewProps {
  documentUri: string;
  generation: number;
  model: GlsModel | null;
  hasErrors: boolean;
  onRenderReady?: () => void;
}

/** 状態定義の内容と現在の解析状況を表示する。
 * @param props 対象文書のURIと描画世代、定義順のモデル、解析状況と3表示の準備完了の通知先。
 * @returns 状態定義表、状態遷移図、状態遷移表、または表示できない理由。
 */
export function Preview(props: PreviewProps): ReactElement {
  const { documentUri, generation, model, hasErrors, onRenderReady } = props;
  const root = useRef<HTMLElement>(null);
  const selection = useStore(stateSelectionStore);
  const selectedStateId =
    selection.uri === documentUri &&
    model?.states.some((state) => state.id === selection.stateId)
      ? selection.stateId
      : null;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const previewDocument = element.ownerDocument;
    // 行のセルとネイティブbuttonからの起動を、同じclickで一度だけ処理する。
    const select = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const row = event.target.closest(".state-table tbody tr[data-state-id]");
      const id = row?.getAttribute("data-state-id");
      if (id && element.contains(row) && model?.states.some((s) => s.id === id))
        stateSelectionStore.getState().toggle(documentUri, id);
    };
    const clear = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        stateSelectionStore.getState().uri === documentUri
      )
        stateSelectionStore.getState().clear();
    };
    element.addEventListener("click", select);
    // 非フォーカス要素のクリック後はbodyへ届くため、同じWebview文書で受け取る。
    previewDocument.addEventListener("keydown", clear);
    return () => {
      element.removeEventListener("click", select);
      previewDocument.removeEventListener("keydown", clear);
    };
  }, [documentUri, model]);
  useEffect(() => {
    if (model === null) onRenderReady?.();
  }, [model, onRenderReady]);
  return (
    <main ref={root} className="preview">
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
                  <tr
                    key={state.id}
                    data-state-id={state.id}
                    data-state-selected={state.id === selectedStateId}
                  >
                    <td>
                      <svg
                        className="state-swatch"
                        viewBox="0 0 1 1"
                        aria-hidden="true"
                      >
                        <rect width="1" height="1" fill={state.color} />
                      </svg>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="state-select"
                        aria-pressed={state.id === selectedStateId}
                      >
                        {state.name}
                      </button>
                    </td>
                    <td className="state-meaning">{state.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {model.states.length === 0 && (
              <p role="status">状態が定義されていない。</p>
            )}
          </section>
          <StateDiagram
            model={model}
            documentUri={documentUri}
            generation={generation}
            selectedStateId={selectedStateId}
            onRenderReady={onRenderReady}
          />
          <TransitionTable model={model} selectedStateId={selectedStateId} />
        </>
      )}
    </main>
  );
}
