/** 状態名と指定カラーを持つ閲覧用ノードを描画する。 */
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { CSSProperties, ReactElement } from "react";
import type { StateDiagramNode } from "../model/build-state-diagram";
import { DIAGRAM_CONFIG } from "../model/diagram-config";

/** 状態名をテキストとして表示し矢印の接続点を提供する。
 * @param props 共通モデルから変換した状態ノード。
 * @returns 指定カラーの名前と接続点を持つノード。
 */
export function StateNode(props: NodeProps<StateDiagramNode>): ReactElement {
  const { data } = props;
  return (
    <div
      className="state-node"
      style={
        {
          "--state-color": data.color,
          minHeight: DIAGRAM_CONFIG.nodeMinHeight,
        } as CSSProperties
      }
    >
      <span className="state-node-label" style={{ color: data.color }}>
        {data.name}
      </span>
      {Object.values(Position).flatMap((position) => [
        <Handle
          key={`${position}-out`}
          id={`${position}-out`}
          type="source"
          position={position}
          isConnectable={false}
        />,
        <Handle
          key={`${position}-in`}
          id={`${position}-in`}
          type="target"
          position={position}
          isConnectable={false}
        />,
      ])}
      <Handle
        id="loop-out"
        type="source"
        position={Position.Top}
        isConnectable={false}
        style={{ left: "25%" }}
      />
      <Handle
        id="loop-in"
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ left: "75%" }}
      />
    </div>
  );
}
