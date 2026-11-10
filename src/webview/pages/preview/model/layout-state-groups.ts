/** グループ名と状態の実測から重ならない枠と相対位置を決める。 */
import type { Rect } from "@xyflow/react";
import type { DiagramNode, StateDiagramNode } from "./build-state-diagram";
import { DIAGRAM_CONFIG as c } from "./diagram-config";
import { layoutStateNodes } from "./layout-state-nodes";

/** 親子ノードの位置を図全体の絶対矩形へ変換する。
 * @param nodes 親を先に持つ配置済みの図用ノード。
 * @returns ノードIDごとの絶対位置と幅、高さ。
 */
export function getAbsoluteNodeRects(
  nodes: readonly DiagramNode[],
): Map<string, Rect> {
  const boxes = new Map<string, Rect>();
  for (const node of nodes) {
    const parent = node.parentId ? boxes.get(node.parentId) : undefined;
    boxes.set(node.id, {
      x: node.position.x + (parent?.x ?? 0),
      y: node.position.y + (parent?.y ?? 0),
      width: node.width ?? node.measured?.width ?? c.nodeWidth,
      height: node.measured?.height ?? node.height ?? c.nodeMinHeight,
    });
  }
  return boxes;
}

/** 状態の定義順を基準に枠と未所属状態を配置する。
 * @param input 親グループと定義順の状態。入力は変更しない。
 * @param heights 状態IDごとの実測高。未計測では最小高さを使う。
 * @param labels グループノードIDごとの名前の実測高。未計測では最小高さを使う。
 * @returns 親の絶対位置、子の相対位置と寸法を持つ図用ノード。
 * @throws 所属状態の親グループがない場合。
 */
export function layoutStateGroups(
  input: readonly DiagramNode[],
  heights: ReadonlyMap<string, number> = new Map(),
  labels: ReadonlyMap<string, number> = new Map(),
): DiagramNode[] {
  const groups = input.filter((node) => node.type === "stateGroup");
  const states = input.filter(
    (node): node is StateDiagramNode => node.type === "state",
  );
  if (groups.length === 0) return layoutStateNodes(states, heights);
  const placed = new Map<string, DiagramNode>();
  let top: number = c.margin;
  let pending: StateDiagramNode[] = [];
  const heightOf = (id: string) => heights.get(id) || c.nodeMinHeight;
  const flush = () => {
    if (!pending.length) return;
    const nodes = layoutStateNodes(pending, heights);
    for (const node of nodes)
      placed.set(node.id, {
        ...node,
        position: { x: node.position.x, y: node.position.y + top - c.margin },
      });
    top =
      Math.max(
        ...nodes.map(
          (node) => node.position.y + top - c.margin + heightOf(node.id),
        ),
      ) +
      c.rowGap +
      c.loopExtent * 2;
    pending = [];
  };
  for (const state of states) {
    if (!state.parentId) {
      pending.push(state);
      continue;
    }
    if (placed.has(state.parentId)) continue;
    flush();
    const group = groups.find((node) => node.id === state.parentId);
    if (!group) throw new Error("所属状態の親グループがない");
    const members = states.filter((node) => node.parentId === group.id);
    const columns = Math.min(members.length, c.columns);
    const width =
      c.groupPadding * 2 + columns * c.nodeWidth + (columns - 1) * c.columnGap;
    let y =
      c.groupPadding +
      Math.max(c.groupLabelMinHeight, labels.get(group.id) ?? 0) +
      c.groupLabelGap;
    for (let row = 0; row < members.length; row += c.columns) {
      const items = members.slice(row, row + c.columns);
      y += c.loopExtent * 2;
      for (const [column, node] of items.entries())
        placed.set(node.id, {
          ...node,
          width: c.nodeWidth,
          measured: heights.get(node.id)
            ? { width: c.nodeWidth, height: heightOf(node.id) }
            : undefined,
          position: {
            x: c.groupPadding + column * (c.nodeWidth + c.columnGap),
            y,
          },
        });
      y += Math.max(...items.map((node) => heightOf(node.id)));
      if (row + c.columns < members.length) y += c.rowGap;
    }
    const height = y + c.groupPadding;
    placed.set(group.id, {
      ...group,
      width,
      height,
      measured: { width, height },
      position: { x: c.margin, y: top },
    });
    top += height + c.rowGap + c.loopExtent * 2;
  }
  flush();
  return input.map((node) => placed.get(node.id) ?? node);
}
