/** 図の画像の余白とPNGの解像度制限を定義する。 */
export const DIAGRAM_EXPORT_CONFIG = {
  margin: 16,
  scale: 2,
  maxSide: 16384,
  maxPixels: 64_000_000,
} as const;
