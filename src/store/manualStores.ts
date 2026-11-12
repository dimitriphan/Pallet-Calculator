/**
 * The manual layouts store and the editor session store, joined to the inputs and the results:
 * layouts are re-checked whenever the valid inputs change, a saved layout becomes the selected
 * one, and removing the selected one falls back to the first calculated layout.
 */
import type { StoreApi } from 'zustand/vanilla';
import { manualLayoutSpecSchema } from '../domain/manualSchemas';
import type { ManualLayoutSpec } from '../engine/manual/build';
import { STORAGE_KEYS } from '../persistence/keys';
import { createDefaultRepository, onStorageChange } from '../persistence/localStorageRepository';
import type { Repository } from '../persistence/repository';
import { useInputsStore, type InputsState } from './inputsStore';
import { createManualEditorStore, type ManualEditorState } from './manualEditorStore';
import { asHook, createManualLayoutsStore, type ManualLayoutsState } from './manualLayoutsStore';
import { useNoticesStore } from './noticesStore';
import { useResultsStore, type ResultsState } from './resultsStore';

export interface ManualStores {
  manualLayouts: StoreApi<ManualLayoutsState>;
  manualEditor: StoreApi<ManualEditorState>;
}

export function createManualStores(deps: {
  inputs: StoreApi<InputsState>;
  results: StoreApi<ResultsState>;
  repo: Repository<ManualLayoutSpec>;
}): ManualStores {
  const { inputs, results } = deps;
  const manualLayouts = createManualLayoutsStore(deps.repo, {
    onListChange(ids) {
      const selected = results.getState().selectedManualId;
      if (selected === null || ids.includes(selected)) return;
      // The selected manual layout is gone (deleted here, in another tab, or replaced by a
      // scenario): the first calculated layout shows.
      results.getState().selectManual(null);
      results.getState().select(0);
    },
  });
  const feed = (parsed: InputsState['parsed']) =>
    manualLayouts.getState().setInputs(parsed.ok ? parsed.inputs : null);
  feed(inputs.getState().parsed);
  inputs.subscribe((s, previous) => {
    if (s.parsed !== previous.parsed) feed(s.parsed);
  });
  const manualEditor = createManualEditorStore({
    manualLayouts,
    results,
    onSaved: (id) => results.getState().selectManual(id),
  });
  return { manualLayouts, manualEditor };
}

const stores = createManualStores({
  inputs: useInputsStore,
  results: useResultsStore,
  repo: createDefaultRepository({
    key: STORAGE_KEYS.manualLayouts,
    schema: manualLayoutSpecSchema,
    onNotice: (message) => useNoticesStore.getState().push(message),
  }),
});

onStorageChange(STORAGE_KEYS.manualLayouts, () => stores.manualLayouts.getState().refresh());

export const useManualLayoutsStore = asHook(stores.manualLayouts);
export const useManualEditorStore = asHook(stores.manualEditor);
