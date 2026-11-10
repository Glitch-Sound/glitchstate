/** 図の倍率と保存の操作、現在の倍率を表示する。 */
import type { ReactElement } from "react";

/** 縮小、等倍、拡大と画像保存の操作対象を表示する。
 * @param props 現在の倍率、準備と保存処理の状態、倍率と保存操作の通知先。
 * @returns 図のキャンバスの外に置く操作部。
 */
export function DiagramControls(props: {
  zoom: number;
  ready: boolean;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  exportBusy?: boolean;
  onExport?: () => void;
}): ReactElement {
  return (
    <fieldset className="diagram-controls" aria-label="図の表示操作">
      <button
        type="button"
        aria-label="縮小"
        disabled={!props.ready}
        onClick={props.onZoomOut}
      >
        -
      </button>
      <button
        type="button"
        aria-label="等倍"
        disabled={!props.ready}
        onClick={props.onReset}
      >
        Reset
      </button>
      <button
        type="button"
        aria-label="拡大"
        disabled={!props.ready}
        onClick={props.onZoomIn}
      >
        +
      </button>
      <button
        type="button"
        aria-label="図をエクスポート"
        title="図をエクスポート"
        disabled={!props.ready || props.exportBusy}
        onClick={props.onExport}
      >
        ⇩
      </button>
      <output role="note" aria-label="表示倍率">
        {Math.round(props.zoom * 100)}%
      </output>
    </fieldset>
  );
}
