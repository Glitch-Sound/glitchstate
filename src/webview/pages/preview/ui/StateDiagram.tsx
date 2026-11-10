/** 共通モデルの状態と状態間の関係をReact Flowで表示する。 */
import {
  getNodesBounds,
  getViewportForBounds,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import type { GlsModel } from "../../../../core";
import { buildStateDiagram } from "../model/build-state-diagram";
import { connectDiagramEdges } from "../model/connect-diagram-edges";
import { DIAGRAM_CONFIG as c } from "../model/diagram-config";
import {
  diagramViewportStore,
  zoomAroundCenter,
} from "../model/diagram-viewport";
import {
  getAbsoluteNodeRects,
  layoutStateGroups,
} from "../model/layout-state-groups";
import { DiagramControls } from "./DiagramControls";
import { StateEdge } from "./StateEdge";
import { StateGroup } from "./StateGroup";
import { StateNode } from "./StateNode";
import "@xyflow/react/dist/style.css";
import "./diagram.css";

const nodeTypes = { state: StateNode, stateGroup: StateGroup };
const edgeTypes = { state: StateEdge };

function DiagramCanvas({
  graph,
  documentUri,
  generation,
  selectedStateId,
  onRenderReady,
}: {
  graph: ReturnType<typeof buildStateDiagram>;
  documentUri: string;
  generation: number;
  selectedStateId?: string | null;
  onRenderReady?: () => void;
}) {
  const markerId = useId();
  const flow = useReactFlow();
  const initialized = useNodesInitialized();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const zoom = useStore((state) => state.transform[2]);
  const [initialViewport] = useState(
    () => diagramViewportStore.getState().viewport ?? undefined,
  );
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
  const [labels, setLabels] = useState<ReadonlyMap<string, number>>(new Map());
  const onLabelMeasured = useCallback((id: string, value: number) => {
    setLabels((previous) =>
      previous.get(id) === value ? previous : new Map(previous).set(id, value),
    );
  }, []);
  const nodes = useMemo(
    () =>
      layoutStateGroups(graph.nodes, heights, labels).map((node) =>
        node.type === "stateGroup"
          ? { ...node, zIndex: 0, data: { ...node.data, onLabelMeasured } }
          : node.parentId
            ? { ...node, zIndex: 1 }
            : node,
      ),
    [graph.nodes, heights, labels, onLabelMeasured],
  );
  const labelsReady = graph.nodes
    .filter((node) => node.type === "stateGroup")
    .every((node) => (labels.get(node.id) ?? 0) > 0);
  const layoutKey = JSON.stringify(
    nodes.map((node) => [
      node.id,
      node.position,
      node.width,
      node.height,
      node.type === "state" ? heights.get(node.id) : labels.get(node.id),
    ]),
  );
  const viewKey = `${generation}:${layoutKey}:${width}:${height}`;
  const [readyKey, setReadyKey] = useState<string>();
  useEffect(() => {
    if (
      !initialized ||
      !labelsReady ||
      !width ||
      !height ||
      !flow.viewportInitialized
    )
      return;
    let cancelled = false;
    let committedFrame: number | undefined;
    const frame = requestAnimationFrame(() => {
      const current = diagramViewportStore.getState();
      if (current.uri !== documentUri || current.generation !== generation)
        return;
      const grouped = nodes.some((node) => node.type === "stateGroup");
      const boxes = grouped ? [...getAbsoluteNodeRects(nodes).values()] : [];
      const bounds = grouped
        ? {
            x: Math.min(...boxes.map((box) => box.x)),
            y: Math.min(...boxes.map((box) => box.y)),
            width:
              Math.max(...boxes.map((box) => box.x + box.width)) -
              Math.min(...boxes.map((box) => box.x)),
            height:
              Math.max(...boxes.map((box) => box.y + box.height)) -
              Math.min(...boxes.map((box) => box.y)),
          }
        : getNodesBounds(flow.getNodes());
      const padding = c.margin + c.loopExtent * 2;
      const expanded = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      };
      const fitted = getViewportForBounds(
        expanded,
        width,
        height,
        c.minZoom,
        c.initialMaxZoom,
        0,
      );
      const retained = current.viewport ?? fitted;
      const resized =
        current.size !== null &&
        (current.size.width !== width || current.size.height !== height);
      void flow.setViewport(resized ? fitted : retained).then(() => {
        if (cancelled) return;
        committedFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          const active = diagramViewportStore.getState();
          if (active.uri !== documentUri || active.generation !== generation)
            return;
          active.record(documentUri, generation, flow.getViewport(), {
            width,
            height,
          });
          setReadyKey(viewKey);
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (committedFrame !== undefined) cancelAnimationFrame(committedFrame);
    };
  }, [
    initialized,
    labelsReady,
    width,
    height,
    viewKey,
    flow,
    nodes,
    documentUri,
    generation,
  ]);
  useEffect(() => {
    if (!initialized || !labelsReady || readyKey !== viewKey) return;
    const frame = requestAnimationFrame(() => onRenderReady?.());
    return () => cancelAnimationFrame(frame);
  }, [initialized, labelsReady, readyKey, viewKey, onRenderReady]);
  const edges = useMemo(
    () => connectDiagramEdges(nodes, graph.edges, markerId),
    [nodes, graph.edges, markerId],
  );
  const displayNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.type === "state"
          ? {
              ...node,
              data: {
                ...node.data,
                isStateSelected: node.id === selectedStateId,
              },
            }
          : node,
      ),
    [nodes, selectedStateId],
  );
  const ready = initialized && labelsReady && readyKey === viewKey;
  const changeZoom = (requested: number) => {
    if (!ready) return;
    const current = diagramViewportStore.getState();
    if (current.uri !== documentUri || current.generation !== generation)
      return;
    const next = zoomAroundCenter(flow.getViewport(), width, height, requested);
    void flow.setViewport(next).then(() => {
      diagramViewportStore
        .getState()
        .record(documentUri, generation, flow.getViewport());
    });
  };
  return (
    <>
      <DiagramControls
        zoom={zoom}
        ready={ready}
        onZoomOut={() => changeZoom(flow.getZoom() - c.zoomStep)}
        onReset={() => changeZoom(1)}
        onZoomIn={() => changeZoom(flow.getZoom() + c.zoomStep)}
      />
      <div className="state-diagram-canvas">
        <ReactFlow
          defaultViewport={initialViewport}
          onMove={(_, viewport) => {
            if (ready)
              diagramViewportStore
                .getState()
                .record(documentUri, generation, viewport);
          }}
          nodes={displayNodes}
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
    </>
  );
}

/** 2表の間に状態遷移図または状態がないことの案内を表示する。
 * @param props 状態と有向の遷移の共通モデル、対象URIと描画世代、選択中の状態IDと図の準備完了の通知先。
 * @returns ノードと矢印を持つ図領域。
 */
export function StateDiagram(props: {
  model: GlsModel;
  documentUri: string;
  generation: number;
  selectedStateId?: string | null;
  onRenderReady?: () => void;
}): ReactElement {
  const { model, documentUri, generation, selectedStateId, onRenderReady } =
    props;
  useEffect(() => {
    if (model.states.length === 0) onRenderReady?.();
  }, [model, onRenderReady]);
  const graph = useMemo(() => buildStateDiagram(model), [model]);
  const identity = JSON.stringify([
    graph.nodes.map((n) => [n.id, n.parentId, n.data]),
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
        <ReactFlowProvider key={`${documentUri}:${identity}`}>
          <DiagramCanvas
            graph={graph}
            documentUri={documentUri}
            generation={generation}
            selectedStateId={selectedStateId}
            onRenderReady={onRenderReady}
          />
        </ReactFlowProvider>
      )}
    </section>
  );
}
