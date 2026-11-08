/** 状態間の矢印と自己ループのSVG経路を描画する。 */
import { BaseEdge, type EdgeProps, Position } from "@xyflow/react";
import type { ReactElement } from "react";
import { DIAGRAM_CONFIG as c } from "../model/diagram-config";

const direction = {
  [Position.Left]: [-1, 0],
  [Position.Right]: [1, 0],
  [Position.Top]: [0, -1],
  [Position.Bottom]: [0, 1],
};

/** 接続点から向きが分かる曲線と矢尻を描画する。
 * @param props 計測済みの接続点と自己遷移、相互遷移の情報。
 * @returns 終点に矢尻を持つ矢印。自己遷移はノードの外側へ張り出す。
 */
export function StateEdge(props: EdgeProps): ReactElement {
  const {
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    markerEnd,
    sourcePosition,
    targetPosition,
  } = props;
  let path: string;
  if (props.source === props.target) {
    path = `M ${sx} ${sy} C ${sx - c.loopExtent} ${sy - c.loopExtent * 2}, ${tx + c.loopExtent} ${ty - c.loopExtent * 2}, ${tx} ${ty}`;
  } else {
    const distance = Math.hypot(tx - sx, ty - sy);
    const bend = Math.max(c.reciprocalOffset, distance / 2);
    const offset = props.data?.reciprocal ? c.reciprocalOffset : 0;
    const nx = (-(ty - sy) / distance) * offset;
    const ny = ((tx - sx) / distance) * offset;
    const start = direction[sourcePosition];
    const end = direction[targetPosition];
    path = `M ${sx} ${sy} C ${sx + start[0] * bend + nx} ${sy + start[1] * bend + ny}, ${tx + end[0] * bend + nx} ${ty + end[1] * bend + ny}, ${tx} ${ty}`;
  }
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={markerEnd}
      className="state-edge-path"
      interactionWidth={0}
    />
  );
}
