/** グループ名を実測し実線の所属枠と接続点を描画する。 */
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { type ReactElement, useLayoutEffect, useRef } from "react";
import type { StateGroupNode } from "../model/build-state-diagram";
import { DIAGRAM_CONFIG as c } from "../model/diagram-config";

/** 折り返した名前と透明な実線枠を表示する。
 * @param props グループの名前と名前の実測高の通知先。
 * @returns 所属状態を囲む実線枠と不可視の出力接続点。
 */
export function StateGroup(props: NodeProps<StateGroupNode>): ReactElement {
  const label = useRef<HTMLDivElement>(null);
  const { id, data } = props;
  useLayoutEffect(() => {
    const element = label.current;
    if (!element) return;
    const measure = () => data.onLabelMeasured?.(id, element.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [id, data.onLabelMeasured]);
  return (
    <div className="state-group" style={{ padding: c.groupPadding }}>
      <div ref={label} className="state-group-label">
        {data.name}
      </div>
      {Object.values(Position).map((position) => (
        <Handle
          key={position}
          id={`${position}-out`}
          type="source"
          position={position}
          isConnectable={false}
        />
      ))}
    </div>
  );
}
