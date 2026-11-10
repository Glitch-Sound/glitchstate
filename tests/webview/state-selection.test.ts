import { expect, test } from "vitest";
import type { GlsModel } from "../../src/core";
import { createStateSelectionStore } from "../../src/webview/pages/preview/model/state-selection";

const uri = "file:///a.gls";
const model: GlsModel = {
  states: ["A", "B"].map((id) => ({
    id,
    name: "同名",
    meaning: `意味${id}`,
    color: "#4F46E5",
  })),
  events: [],
  transitions: [],
};
function start() {
  const store = createStateSelectionStore();
  store.getState().reconcile(uri, model);
  return store;
}

test("REQ-034-S01 REQ-034-S02 REQ-034-S03 単一のIDを選択し切替と解除を行う", () => {
  const store = start();
  expect(store.getState().stateId).toBeNull();
  store.getState().toggle(uri, "A");
  expect(store.getState().stateId).toBe("A");
  store.getState().toggle(uri, "B");
  expect(store.getState().stateId).toBe("B");
  store.getState().toggle(uri, "B");
  expect(store.getState().stateId).toBeNull();
  store.getState().toggle(uri, "A");
  store.getState().clear();
  expect(store.getState().stateId).toBeNull();
});

test("REQ-035-S01 REQ-035-S02 REQ-035-S06 同一URIとIDの表示モデルで保持する", () => {
  const store = start();
  store.getState().toggle(uri, "A");
  const changed = {
    ...model,
    states: [...model.states].reverse().map((s) => ({
      ...s,
      name: `変更${s.id}`,
      meaning: "変更した意味",
      color: "#FF8800",
    })),
  };
  store.getState().reconcile(uri, changed);
  expect(store.getState().stateId).toBe("A");
  store.getState().reconcile(uri, changed);
  expect(store.getState().stateId).toBe("A");
  expect(model.states.map((s) => s.id)).toEqual(["A", "B"]);
});

for (const [label, states] of [
  ["削除", [model.states[1]]],
  ["ID変更", [{ ...model.states[0], id: "C" }, model.states[1]]],
  ["全状態除去", []],
] as const) {
  test(`REQ-035-S03 ${label}で解除し再追加で復元しない`, () => {
    const store = start();
    store.getState().toggle(uri, "A");
    store.getState().reconcile(uri, { ...model, states });
    expect(store.getState().stateId).toBeNull();
    store.getState().reconcile(uri, model);
    expect(store.getState().stateId).toBeNull();
  });
}

test("REQ-035-S04 別URIと元のURIへの復帰で同じIDを復元しない", () => {
  const store = start();
  store.getState().toggle(uri, "A");
  store.getState().reconcile("file:///b.gls", model);
  expect(store.getState().stateId).toBeNull();
  store.getState().toggle(uri, "A");
  expect(store.getState().stateId).toBeNull();
  store.getState().reconcile(uri, model);
  expect(store.getState().stateId).toBeNull();
});

test("REQ-035-S04 正常モデルがない場合に解除する", () => {
  const store = start();
  store.getState().toggle(uri, "A");
  store.getState().reconcile("file:///b.gls", null);
  expect(store.getState().stateId).toBeNull();
});

test("REQ-035-S07 ストアの再生成で選択を復元しない", () => {
  const store = start();
  store.getState().toggle(uri, "A");
  expect(start().getState().stateId).toBeNull();
});
