/** 計測した図の要素を単独のベクター画像へ変換する。 */
import { DIAGRAM_EXPORT_CONFIG as c } from "./diagram-export-config";

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ImageLine {
  text: string;
  x: number;
  y: number;
  fill: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
}
export interface ImageNode {
  id: string;
  group: boolean;
  rect: ImageRect;
  fill: string;
  stroke: string;
  strokeWidth: number;
  lines: ImageLine[];
}
export interface ImageMarker {
  d: string;
  fill: string;
  orient: string;
  viewBox: string;
  refX: string;
  refY: string;
  markerWidth: string;
  markerHeight: string;
}
export interface ImageEdge {
  id: string;
  d: string;
  transform: string;
  stroke: string;
  strokeWidth: number;
  bounds: ImageRect;
  marker: ImageMarker;
}
export interface DiagramImage {
  background: string;
  nodes: ImageNode[];
  edges: ImageEdge[];
}
const escapeXml = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const attributes = (values: Record<string, string | number>) =>
  Object.entries(values)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");

/** 全ノードと経路を含む不透明背景のSVGを生成する。
 * @param image 図座標の矩形、文字、矢印と解決済みの配色。
 * @returns 外部資源と選択情報を含まない単独のSVG文書。
 * @throws 図の要素または寸法が不正な場合。
 */
export function serializeStateDiagram(image: DiagramImage): string {
  const boxes = [
    ...image.nodes.map((node) => node.rect),
    ...image.edges.map((edge) => edge.bounds),
  ];
  if (
    !image.nodes.length ||
    boxes.some(
      (b) =>
        ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
        b.width < 0 ||
        b.height < 0,
    )
  )
    throw new Error("図の寸法が不正です");
  const x = Math.min(...boxes.map((b) => b.x)) - c.margin;
  const y = Math.min(...boxes.map((b) => b.y)) - c.margin;
  const width = Math.max(...boxes.map((b) => b.x + b.width)) + c.margin - x;
  const height = Math.max(...boxes.map((b) => b.y + b.height)) + c.margin - y;
  if (width <= 0 || height <= 0) throw new Error("図の寸法が不正です");
  const defs = image.edges
    .map((edge, i) => {
      const { d, fill, ...markerAttributes } = edge.marker;
      return `<marker id="export-marker-${i}"${attributes(markerAttributes)}><path${attributes({ d, fill })}/></marker>`;
    })
    .join("");
  const edges = image.edges
    .map(
      (edge, i) =>
        `<path${attributes({ "data-edge-id": edge.id, d: edge.d, transform: edge.transform, stroke: edge.stroke, "stroke-width": edge.strokeWidth, fill: "none", "marker-end": `url(#export-marker-${i})` })}/>`,
    )
    .join("");
  const nodes = image.nodes
    .map((node) => {
      const rect = `<rect${attributes({ ...node.rect, fill: node.fill, stroke: node.stroke, "stroke-width": node.strokeWidth })}/>`;
      const style = node.lines[0];
      const text = style
        ? `<text${attributes({ fill: style.fill, "font-family": style.fontFamily, "font-size": style.fontSize, "font-weight": style.fontWeight, "font-style": style.fontStyle, "xml:space": "preserve" })}>${node.lines.map((line) => `<tspan${attributes({ x: line.x, y: line.y })}>${escapeXml(line.text)}</tspan>`).join("")}</text>`
        : "";
      return `<g${attributes({ [node.group ? "data-group-id" : "data-state-id"]: node.id })}>${rect}${text}</g>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"${attributes({ width, height, viewBox: `${x} ${y} ${width} ${height}` })}><rect${attributes({ x, y, width, height, fill: image.background })}/><defs>${defs}</defs>${edges}${nodes}</svg>`;
}
