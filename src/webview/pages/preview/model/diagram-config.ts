/** 名前と矢印のための空間を確保する図の初期配置値を定義する。 */
export const DIAGRAM_CONFIG = {
  columns: 4,
  nodeWidth: 160,
  nodeMinHeight: 64,
  columnGap: 96,
  rowGap: 112,
  margin: 64,
  loopExtent: 48,
  reciprocalOffset: 28,
  minZoom: 0.01,
  maxZoom: 1,
} as const;
