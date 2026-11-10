/** 表示中の文書と状態IDに対応する単一選択を管理する。 */
import { createStore } from "zustand/vanilla";
import type { GlsModel } from "../../../../core";

interface StateSelection {
  uri: string | null;
  stateId: string | null;
  reconcile: (uri: string, model: GlsModel | null) => void;
  toggle: (uri: string, stateId: string) => void;
  clear: () => void;
}

/** 文書別の履歴を持たない独立した選択ストアを作る。
 * @returns URIと状態ID、受理した表示モデルとの整合と選択操作を持つストア。
 */
export function createStateSelectionStore() {
  return createStore<StateSelection>((set) => ({
    uri: null,
    stateId: null,
    reconcile: (uri, model) =>
      set((previous) => {
        const stateId =
          previous.uri === uri &&
          model?.states.some((state) => state.id === previous.stateId)
            ? previous.stateId
            : null;
        return previous.uri === uri && previous.stateId === stateId
          ? previous
          : { uri, stateId };
      }),
    toggle: (uri, stateId) =>
      set((previous) =>
        previous.uri !== uri
          ? previous
          : { stateId: previous.stateId === stateId ? null : stateId },
      ),
    clear: () =>
      set((previous) =>
        previous.stateId === null ? previous : { stateId: null },
      ),
  }));
}

/** このWebviewが共有する選択。再起動時は未選択から始まる。 */
export const stateSelectionStore = createStateSelectionStore();
