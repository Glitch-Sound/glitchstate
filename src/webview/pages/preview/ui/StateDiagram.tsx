/** 共通モデルの状態と状態間の関係をReact Flowで表示する。 */
import {
  type Edge,
  getNodesBounds,
  getViewportForBounds,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { type ReactElement, useEffect, useId, useMemo, useState } from "react";
import type { GlsModel } from "../../../../core";
import {
  buildStateDiagram,
  type StateDiagramNode,
} from "../model/build-state-diagram";
import { DIAGRAM_CONFIG as c } from "../model/diagram-config";
import { layoutStateNodes } from "../model/layout-state-nodes";
import { StateEdge } from "./StateEdge";
import { StateNode } from "./StateNode";
import "@xyflow/react/dist/style.css";
import "./diagram.css";

const nodeTypes = { state: StateNode };
const edgeTypes = { state: StateEdge };

function connectEdges(
  nodes: StateDiagramNode[],
  edges: Edge[],
  markerId: string,
): Edge[] {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  const pairs = new Set(edges.map((edge) => edge.id));
  return edges.map((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) throw new Error("図の遷移に対応する状態がない");
    const dx = target.x - source.x;
    const dy = target.y - source.y;
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

function DiagramCanvas({
  graph,
  onRenderReady,
}: {
  graph: ReturnType<typeof buildStateDiagram>;
  onRenderReady?: () => void;
}) {
  const markerId = useId();
  const flow = useReactFlow();
  const initialized = useNodesInitialized();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const heightKey = useStore((state) =>
    graph.nodes
      .map((node) => state.nodeLookup.get(node.id)?.measured.height ?? 0)
      .join(","),
  );
  const heights = useMemo(
    () =>
      new Map(
        graph.nodes.map((node, i) => [
          node.id,
          Number(heightKey.split(",")[i]),
        ]),
      ),
    [graph.nodes, heightKey],
  );
  const nodes = useMemo(
    () => layoutStateNodes(graph.nodes, heights),
    [graph.nodes, heights],
  );
  const layoutKey = JSON.stringify(
    nodes.map((node) => [node.id, node.position, heights.get(node.id)]),
  );
  const viewKey = `${layoutKey}:${width}:${height}`;
  const [readyKey, setReadyKey] = useState<string>();
  useEffect(() => {
    if (!initialized || !width || !height || !flow.viewportInitialized) return;
    let cancelled = false;
    let committedFrame: number | undefined;
    const frame = requestAnimationFrame(() => {
      const bounds = getNodesBounds(flow.getNodes());
      const padding = c.margin + c.loopExtent * 2;
      const expanded = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      };
      void flow
        .setViewport(
          getViewportForBounds(
            expanded,
            width,
            height,
            c.minZoom,
            c.maxZoom,
            0,
          ),
        )
        .then(() => {
          if (cancelled) return;
          committedFrame = requestAnimationFrame(() => {
            if (!cancelled) setReadyKey(viewKey);
          });
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (committedFrame !== undefined) cancelAnimationFrame(committedFrame);
    };
  }, [initialized, width, height, viewKey, flow]);
  useEffect(() => {
    if (!initialized || readyKey !== viewKey) return;
    const frame = requestAnimationFrame(() => onRenderReady?.());
    return () => cancelAnimationFrame(frame);
  }, [initialized, readyKey, viewKey, onRenderReady]);
  const edges = useMemo(
    () => connectEdges(nodes, graph.edges, markerId),
    [nodes, graph.edges, markerId],
  );
  return (
    <div className="state-diagram-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={c.minZoom}
        maxZoom={c.maxZoom}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
      >
        <svg className="diagram-defs" aria-hidden="true">
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
    </div>
  );
}

/** 2表の間に状態遷移図または状態がないことの案内を表示する。
 * @param props 状態と有向の遷移を持つ共通モデルと図の準備完了の通知先。
 * @returns ノードと矢印を持つ図領域。
 */
export function StateDiagram(props: {
  model: GlsModel;
  onRenderReady?: () => void;
}): ReactElement {
  const { model, onRenderReady } = props;
  useEffect(() => {
    if (model.states.length === 0) onRenderReady?.();
  }, [model, onRenderReady]);
  const graph = useMemo(() => buildStateDiagram(model), [model]);
  const identity = JSON.stringify([
    graph.nodes.map((n) => [n.id, n.data]),
    graph.edges.map((e) => e.id),
  ]);
  return (
    <section
      className="state-diagram-section"
      aria-labelledby="diagram-heading"
    >
      <h2 id="diagram-heading">状態遷移図</h2>
      {model.states.length === 0 ? (
        <p role="status">状態が定義されていない。</p>
      ) : (
        <ReactFlowProvider key={identity}>
          <DiagramCanvas graph={graph} onRenderReady={onRenderReady} />
        </ReactFlowProvider>
      )}
    </section>
  );
}
