/** 図の保存要求と画像応答の通信契約を定義する。 */
import { z } from "zod";
import { MAX_EXPORT_BYTES, MAX_EXPORT_ERROR_LENGTH } from "./export-config";

function isPng(data: string): boolean {
  if (data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return false;
  try {
    const bytes = atob(data);
    if (
      bytes.length < 45 ||
      !bytes.startsWith("\x89PNG\r\n\x1a\n") ||
      bytes.slice(8, 16) !== "\x00\x00\x00\x0dIHDR" ||
      bytes.slice(-12, -4) !== "\x00\x00\x00\x00IEND"
    )
      return false;
    const header = new DataView(
      Uint8Array.from(bytes.slice(16, 24), (char) => char.charCodeAt(0)).buffer,
    );
    return header.getUint32(0) > 0 && header.getUint32(4) > 0;
  } catch {
    return false;
  }
}

const identity = {
  requestId: z.string().min(1),
  uri: z.string().min(1),
  version: z.number().int().nonnegative(),
  sequence: z.number().int().positive(),
};
const format = z.enum(["png", "svg"]);
export const exportStart = z.strictObject({
  type: z.literal("glitchstate.export-start"),
  ...identity,
});
const request = z.strictObject({
  type: z.literal("glitchstate.export"),
  ...identity,
  format,
});
const finished = z.strictObject({
  type: z.literal("glitchstate.export-finished"),
  ...identity,
});
const success = z
  .strictObject({
    type: z.literal("glitchstate.export-result"),
    ...identity,
    format,
    success: z.literal(true),
    data: z.string().min(1).max(MAX_EXPORT_BYTES),
  })
  .refine((message) =>
    message.format === "svg"
      ? /^\s*(?:<\?xml[^?]*\?>\s*)?<svg\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["'][^>]*>[\s\S]*<\/svg>\s*$/.test(
          message.data,
        )
      : isPng(message.data),
  );
const failure = z.strictObject({
  type: z.literal("glitchstate.export-result"),
  ...identity,
  format,
  success: z.literal(false),
  error: z.string().min(1).max(MAX_EXPORT_ERROR_LENGTH),
});
export const exportResult = z.union([success, failure]);
const message = z.union([exportStart, request, exportResult, finished]);
export type ExportMessage = z.infer<typeof message>;
export type ExportStart = z.infer<typeof exportStart>;
export type ExportRequest = z.infer<typeof request>;
export type ExportResult = z.infer<typeof exportResult>;
export type ExportFormat = z.infer<typeof format>;

/** 保存用メッセージの型と画像形式を確かめる。
 * @param value メッセージAPIから受け取った未検証の値。
 * @returns 保存の起動、要求、結果または終了。不正な値ならnull。
 */
export function readExportMessage(value: unknown): ExportMessage | null {
  const result = message.safeParse(value);
  return result.success ? result.data : null;
}
