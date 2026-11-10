/** 現在の文書の表示範囲と、中心を保つ倍率変更を管理する。 */
import { createStore } from "zustand/vanilla";
import { DIAGRAM_CONFIG as c } from "./diagram-config";

/** 図の座標から画面の座標への移動量と倍率。 */
export interface DiagramViewport {
  x: number;
  y: number;
  zoom: number;
}

/** 倍率を制限し、表示中心に対応する図上の位置を維持する。
 * @param current 現在の移動量と倍率。
 * @param width 表示領域の幅。単位はCSSピクセル。
 * @param height 表示領域の高さ。単位はCSSピクセル。
 * @param requested 操作で指定した倍率。1は等倍。
 * @returns 設定した倍率の範囲に収めた新しい移動量と倍率。
 */
export function zoomAroundCenter(
  current: DiagramViewport,
  width: number,
  height: number,
  requested: number,
): DiagramViewport {
  const zoom = Math.max(c.minZoom, Math.min(c.maxZoom, requested));
  if (zoom === current.zoom) return current;
  return {
    x: width / 2 - ((width / 2 - current.x) / current.zoom) * zoom,
    y: height / 2 - ((height / 2 - current.y) / current.zoom) * zoom,
    zoom,
  };
}

/** 表示範囲の適用時に確定した表示領域の寸法。単位はCSSピクセル。 */
export interface DiagramViewportSize {
  width: number;
  height: number;
}

interface ViewportState {
  uri: string | null;
  generation: number;
  viewport: DiagramViewport | null;
  size: DiagramViewportSize | null;
  accept: (uri: string) => number;
  record: (
    uri: string,
    generation: number,
    viewport: DiagramViewport,
    size?: DiagramViewportSize,
  ) => void;
}

/** 現在の文書だけの表示範囲を記憶する独立したストアを作る。
 * @returns 受理通知の世代と表示範囲の記録を扱うストア。
 */
export function createDiagramViewportStore() {
  return createStore<ViewportState>((set, get) => ({
    uri: null,
    generation: 0,
    viewport: null,
    size: null,
    accept: (uri) => {
      const previous = get();
      const generation = previous.generation + 1;
      set({
        uri,
        generation,
        viewport: previous.uri === uri ? previous.viewport : null,
        size: previous.uri === uri ? previous.size : null,
      });
      return generation;
    },
    record: (uri, generation, viewport, size) => {
      const current = get();
      if (current.uri === uri && current.generation === generation)
        set({ viewport, ...(size ? { size } : {}) });
    },
  }));
}

/** このWebview内の現在の文書の表示範囲。永続化しない。 */
export const diagramViewportStore = createDiagramViewportStore();
