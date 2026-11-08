/** ExtensionとWebviewの間で使う通知と受信値の検証を定義する。 */
import { z } from "zod";
import type { GlsModel } from "../core";

export interface PreviewUpdate {
  readonly type: "glitchstate.update";
  readonly uri: string;
  readonly version: number;
  readonly sequence: number;
  readonly model: GlsModel | null;
  readonly hasErrors: boolean;
}

const identity = {
  uri: z.string().min(1),
  version: z.number().int().nonnegative(),
  sequence: z.number().int().positive(),
};
const state = z.strictObject({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  name: z.string().refine((value) => value.trim().length > 0),
  meaning: z.string().refine((value) => value.trim().length > 0),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
});
const update = z.strictObject({
  type: z.literal("glitchstate.update"),
  ...identity,
  model: z.strictObject({ states: z.array(state) }).nullable(),
  hasErrors: z.boolean(),
});
const incoming = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("glitchstate.ready") }),
  z.strictObject({ type: z.literal("glitchstate.rendered"), ...identity }),
]);
export type WebviewMessage = z.infer<typeof incoming>;

/** 受信値が描画できる共通モデルの通知であるか確かめる。
 * @param value メッセージAPIから受け取った未検証の値。
 * @returns 通知の形式と各状態の値が有効ならtrue。
 */
export function isPreviewUpdate(value: unknown): value is PreviewUpdate {
  return update.safeParse(value).success;
}

/** Webviewからの通知を検証する。
 * @param value メッセージAPIから受け取った未検証の値。
 * @returns 準備完了または描画完了の通知。不正な値ならnull。
 */
export function readWebviewMessage(value: unknown): WebviewMessage | null {
  const result = incoming.safeParse(value);
  return result.success ? result.data : null;
}
