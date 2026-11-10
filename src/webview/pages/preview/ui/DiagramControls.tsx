/** 図の倍率操作と現在の倍率を表示する。 */
import type { ReactElement } from "react";

/** 縮小、等倍、拡大の操作対象を表示する。
 * @param props 現在の倍率、準備状態と倍率操作の通知先。
 * @returns 図のキャンバスの外に置く操作部。
 */
export function DiagramControls(props: {
  zoom: number;
  ready: boolean;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
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
      <output role="note" aria-label="表示倍率">
        {Math.round(props.zoom * 100)}%
      </output>
    </fieldset>
  );
}
