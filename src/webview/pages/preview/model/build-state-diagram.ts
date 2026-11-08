/** 共通モデルを状態遷移図のノードと有向ペアへ変換する。 */
import type { Edge, Node } from "@xyflow/react";
import type { GlsModel } from "../../../../core";

export type StateNodeData = { name: string; color: string };
export type StateDiagramNode = Node<StateNodeData, "state">;

/** 状態を定義順に、遷移を同じ向きの状態ペアごとに返す。
 * @param model 参照が検証済みの共通モデル。入力は変更しない。
 * @returns 状態名とカラーを持つノードと、遷移先を持つ組み合わせの矢印。
 */
export function buildStateDiagram(model: GlsModel): {
  nodes: StateDiagramNode[];
  edges: Edge[];
} {
  const nodes = model.states.map((state) => ({
    id: state.id,
    type: "state" as const,
    position: { x: 0, y: 0 },
    data: { name: state.name, color: state.color },
  }));
  const pairs = new Map<string, Edge>();
  for (const transition of model.transitions) {
    const targets =
      "branches" in transition
        ? transition.branches.map((branch) => branch.targetStateId)
        : [transition.targetStateId];
    for (const target of targets) {
      if (target === null) continue;
      const id = `${transition.fromStateId}:${target}`;
      pairs.set(id, {
        id,
        type: "state",
        source: transition.fromStateId,
        target,
      });
    }
  }
  return { nodes, edges: [...pairs.values()] };
}
