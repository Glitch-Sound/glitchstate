/** 定義順と実測した高さから状態ノードを配置する。 */
import type { StateDiagramNode } from "./build-state-diagram";
import { DIAGRAM_CONFIG as c } from "./diagram-config";

/** 各行の最大高さを確保してノードを折り返す。
 * @param nodes 定義順の状態ノード。入力は変更しない。
 * @param heights ノードIDごとの実測の高さ。未計測なら最小高さを使う。
 * @returns 図の座標と固定幅を付けたノード。
 */
export function layoutStateNodes(
  nodes: readonly StateDiagramNode[],
  heights: ReadonlyMap<string, number> = new Map(),
): StateDiagramNode[] {
  const result: StateDiagramNode[] = [];
  let y: number = c.margin;
  for (let row = 0; row < nodes.length; row += c.columns) {
    const items = nodes.slice(row, row + c.columns);
    let height: number = c.nodeMinHeight;
    for (const [column, node] of items.entries()) {
      height = Math.max(height, heights.get(node.id) ?? c.nodeMinHeight);
      result.push({
        ...node,
        width: c.nodeWidth,
        measured: heights.get(node.id)
          ? { width: c.nodeWidth, height: heights.get(node.id) }
          : undefined,
        position: { x: c.margin + column * (c.nodeWidth + c.columnGap), y },
      });
    }
    y += height + c.rowGap;
  }
  return result;
}
