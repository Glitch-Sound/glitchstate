/** 共通モデルを状態遷移図のノードと有向ペアへ変換する。 */
import type { Edge, Node } from "@xyflow/react";
import type { GlsModel } from "../../../../core";

export type StateNodeData = { name: string; color: string };
export type StateDiagramNode = Node<StateNodeData, "state">;
export type StateGroupData = {
  name: string;
  stateIds: readonly string[];
  onLabelMeasured?: (id: string, height: number) => void;
};
export type StateGroupNode = Node<StateGroupData, "stateGroup">;
export type DiagramNode = StateDiagramNode | StateGroupNode;

/** 状態を定義順に、遷移を同じ向きの状態ペアごとに返す。
 * @param model 参照が検証済みの共通モデル。入力は変更しない。
 * @returns 状態名とカラーを持つノードと、遷移先を持つ組み合わせの矢印。
 */
export function buildStateDiagram(model: GlsModel): {
  nodes: DiagramNode[];
  edges: Edge[];
} {
  const groups = model.stateGroups ?? [];
  const owners = new Map(
    groups.flatMap((group) => group.stateIds.map((id) => [id, group] as const)),
  );
  const nodes: DiagramNode[] = model.states.map((state) => ({
    id: state.id,
    type: "state" as const,
    position: { x: 0, y: 0 },
    data: { name: state.name, color: state.color },
    ...(owners.has(state.id)
      ? {
          parentId: `state-group:${owners.get(state.id)?.id}`,
          extent: "parent" as const,
        }
      : {}),
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
  if (groups.length === 0) return { nodes, edges: [...pairs.values()] };
  const sources = new Map<string, Set<string>>();
  for (const edge of pairs.values()) {
    const owner = owners.get(edge.source);
    if (!owner || owner.stateIds.includes(edge.target)) continue;
    const key = `state-group:${owner.id}:${edge.target}`;
    const members = sources.get(key) ?? new Set<string>();
    members.add(edge.source);
    sources.set(key, members);
  }
  const edges = new Map<string, Edge>();
  for (const edge of pairs.values()) {
    const owner = owners.get(edge.source);
    const source = owner ? `state-group:${owner.id}` : edge.source;
    const id = `${source}:${edge.target}`;
    if ((sources.get(id)?.size ?? 0) >= 2)
      edges.set(id, { id, type: "state", source, target: edge.target });
    else edges.set(edge.id, edge);
  }
  return {
    nodes: [
      ...groups.map((group) => ({
        id: `state-group:${group.id}`,
        type: "stateGroup" as const,
        position: { x: 0, y: 0 },
        data: { name: group.name, stateIds: group.stateIds },
      })),
      ...nodes,
    ],
    edges: [...edges.values()],
  };
}
