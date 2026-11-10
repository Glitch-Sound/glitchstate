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
const event = z.strictObject({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  name: z.string().refine((value) => value.trim().length > 0),
  categoryPath: z
    .array(
      z
        .string()
        .refine((value) => value.trim().length > 0 && !/["\r\n]/.test(value)),
    )
    .min(1)
    .max(3)
    .optional(),
});
const plainTransition = z.strictObject({
  fromStateId: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  eventId: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  action: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  targetStateId: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .nullable(),
});
const conditionalTransition = z.strictObject({
  fromStateId: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  eventId: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  commonAction: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  branches: z
    .array(
      z.strictObject({
        condition: z
          .string()
          .refine((value) => value.trim().length > 0 && !/["\r\n]/.test(value)),
        action: z
          .string()
          .refine((value) => value.trim().length > 0)
          .nullable(),
        targetStateId: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .nullable(),
      }),
    )
    .min(1)
    .refine(
      (branches) =>
        new Set(branches.map((branch) => branch.condition)).size ===
        branches.length,
    ),
});
const transition = z.union([plainTransition, conditionalTransition]);
const stateGroup = z.strictObject({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  name: z
    .string()
    .refine((value) => value.trim().length > 0 && !/["\r\n]/.test(value)),
  stateIds: z
    .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/))
    .min(2)
    .refine((ids) => new Set(ids).size === ids.length),
});
const model = z
  .strictObject({
    states: z.array(state),
    events: z.array(event),
    transitions: z.array(transition),
    stateGroups: z.array(stateGroup).optional(),
    eventCategoryHeaders: z
      .array(
        z
          .string()
          .refine((value) => value.trim().length > 0 && !/["\r\n]/.test(value)),
      )
      .min(1)
      .max(3)
      .optional(),
  })
  .refine((value) => {
    const states = new Set(value.states.map((item) => item.id));
    const events = new Set(value.events.map((item) => item.id));
    const pairs = new Set(
      value.transitions.map((item) => `${item.fromStateId}:${item.eventId}`),
    );
    const groups = value.stateGroups ?? [];
    const members = groups.flatMap((group) => group.stateIds);
    return (
      states.size === value.states.length &&
      events.size === value.events.length &&
      pairs.size === value.transitions.length &&
      new Set(groups.map((group) => group.id)).size === groups.length &&
      new Set(members).size === members.length &&
      members.every((id) => states.has(id)) &&
      value.events.every(
        (item) =>
          (item.categoryPath?.length ?? 0) <=
          (value.eventCategoryHeaders?.length ?? 0),
      ) &&
      value.transitions.every(
        (item) =>
          states.has(item.fromStateId) &&
          events.has(item.eventId) &&
          ("branches" in item
            ? item.branches.every(
                (branch) =>
                  branch.targetStateId === null ||
                  states.has(branch.targetStateId),
              )
            : item.targetStateId === null || states.has(item.targetStateId)),
      )
    );
  });
const update = z.strictObject({
  type: z.literal("glitchstate.update"),
  ...identity,
  model: model.nullable(),
  hasErrors: z.boolean(),
});
const incoming = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("glitchstate.ready") }),
  z.strictObject({ type: z.literal("glitchstate.rendered"), ...identity }),
]);
export type WebviewMessage = z.infer<typeof incoming>;

/** 受信値が描画できる共通モデルの通知であるか確かめる。
 * @param value メッセージAPIから受け取った未検証の値。
 * @returns 通知の形式、定義の値と参照が有効ならtrue。
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
