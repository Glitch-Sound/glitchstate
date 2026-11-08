import { expect, test } from "vitest";
import { isPreviewUpdate } from "../../src/preview-protocol";

const state = { id: "IDLE", name: "待機", meaning: "待つ", color: "#4F46E5" };
const event = { id: "START", name: "開始" };
const transition = {
  fromStateId: "IDLE",
  eventId: "START",
  action: "記録する",
  targetStateId: "IDLE",
};
const model = { states: [state], events: [event], transitions: [transition] };
const notification = (model: unknown) => ({
  type: "glitchstate.update",
  uri: "file:///a.gls",
  version: 1,
  sequence: 1,
  model,
  hasErrors: model === null,
});

test("REQ-007-S03 状態だけの新形式と正常な拡張モデルを受け付ける", () => {
  expect(
    isPreviewUpdate(
      notification({ states: [state], events: [], transitions: [] }),
    ),
  ).toBe(true);
  expect(isPreviewUpdate(notification(model))).toBe(true);
  expect(isPreviewUpdate(notification(null))).toBe(true);
});

test.each([
  { ...transition, action: null },
  { ...transition, targetStateId: null },
  { ...transition, action: null, targetStateId: null },
])("REQ-008-S03 なしを含む定義済み遷移を受け付ける: %j", (value) => {
  expect(
    isPreviewUpdate(notification({ ...model, transitions: [value] })),
  ).toBe(true);
});

test.each([
  { states: [state] },
  { states: [state], events: [event] },
  { ...model, events: [{ ...event, id: "1START" }] },
  { ...model, events: [{ ...event, name: " " }] },
  { ...model, states: [state, state] },
  { ...model, events: [event, event] },
  { ...model, transitions: [{ ...transition, action: undefined }] },
  { ...model, transitions: [{ ...transition, action: " " }] },
  { ...model, transitions: [{ ...transition, targetStateId: 1 }] },
  { ...model, transitions: [{ ...transition, fromStateId: "MISSING" }] },
  { ...model, transitions: [{ ...transition, eventId: "MISSING" }] },
  { ...model, transitions: [{ ...transition, targetStateId: "MISSING" }] },
  {
    ...model,
    transitions: [transition, { ...transition, targetStateId: null }],
  },
])("REQ-013-S04 不正なモデル通知を採用しない: %j", (value) => {
  expect(isPreviewUpdate(notification(value))).toBe(false);
});
