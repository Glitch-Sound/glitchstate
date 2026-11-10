/** 単独SVGを同じ内容のPNGへ変換する。 */
import { DIAGRAM_EXPORT_CONFIG as c } from "../model/diagram-export-config";

/** 設定した倍率、最大辺と面積を満たすPNGの寸法を求める。
 * @param width SVGの正の有限な幅。図座標単位。
 * @param height SVGの正の有限な高さ。図座標単位。
 * @returns 比率を維持して切り下げた正の画素寸法。
 * @throws 寸法が正の有限値でない場合。
 */
export function getPngSize(
  width: number,
  height: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("図の寸法が不正なためPNGを作成できない");
  const scale = Math.min(
    c.scale,
    c.maxSide / Math.max(width, height),
    Math.sqrt(c.maxPixels / width / height),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** 保存用SVGをローカルで読み込みPNGへ変換する。
 * @param svgText 外部資源に依存しない、正の幅と高さを持つSVG文書。
 * @returns PNGのバイト列を表すBase64文字列。データURLの接頭辞を含まない。
 * @throws SVGの形式、画像の読み込み、Canvasまたは符号化が不正な場合。
 */
export async function rasterizeStateDiagram(svgText: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.localName !== "svg"
  )
    throw new Error("SVG画像の生成に失敗した");
  const size = getPngSize(
    Number(parsed.documentElement.getAttribute("width")),
    Number(parsed.documentElement.getAttribute("height")),
  );
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG変換用のCanvasを作成できない");
  const url = URL.createObjectURL(
    new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0, size.width, size.height);
    const encoded = canvas.toDataURL("image/png");
    if (!encoded.startsWith("data:image/png;base64,"))
      throw new Error("PNG画像を符号化できない");
    return encoded.slice("data:image/png;base64,".length);
  } finally {
    URL.revokeObjectURL(url);
  }
}
