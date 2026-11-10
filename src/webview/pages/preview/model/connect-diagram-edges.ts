/** 親子の絶対矩形から矢印の接続面とループを決める。 */
import { type Edge, Position } from "@xyflow/react";
import type { DiagramNode } from "./build-state-diagram";
import { getAbsoluteNodeRects } from "./layout-state-groups";

/** 集約と個別の矢印へ方向付きのハンドルを指定する。
 * @param nodes 寸法と親子位置の確定したノード。
 * @param edges 状態またはグループを始点、状態を終点とする矢印。
 * @param markerId 終点に使うSVGマーカーの参照。
 * @returns 接続面と相互遷移、自己遷移の情報を持つ矢印。
 * @throws 矢印に対応するノードがない場合。
 */
export function connectDiagramEdges(
  nodes: readonly DiagramNode[],
  edges: readonly Edge[],
  markerId: string,
): Edge[] {
  const boxes = getAbsoluteNodeRects(nodes);
  const grouped = nodes.some((node) => node.type === "stateGroup");
  const pairs = new Set(edges.map((edge) => `${edge.source}:${edge.target}`));
  return edges.map((edge) => {
    const source = boxes.get(edge.source);
    const target = boxes.get(edge.target);
    if (!source || !target) throw new Error("図の遷移に対応する状態がない");
    const dx =
      target.x - source.x + (grouped ? (target.width - source.width) / 2 : 0);
    const dy =
      target.y - source.y + (grouped ? (target.height - source.height) / 2 : 0);
    const side =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? Position.Right
          : Position.Left
        : dy >= 0
          ? Position.Bottom
          : Position.Top;
    const opposite = {
      left: Position.Right,
      right: Position.Left,
      top: Position.Bottom,
      bottom: Position.Top,
    }[side];
    const loop = edge.source === edge.target;
    return {
      ...edge,
      sourceHandle: loop ? "loop-out" : `${side}-out`,
      targetHandle: loop ? "loop-in" : `${opposite}-in`,
      markerEnd: markerId,
      data: { reciprocal: !loop && pairs.has(`${edge.target}:${edge.source}`) },
    };
  });
}
