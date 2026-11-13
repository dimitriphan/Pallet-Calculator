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

/** Said when another tab deletes the manual layout this tab has selected. */
export const SELECTED_DELETED_ELSEWHERE =
  'The layout you had selected was deleted in another tab. Showing calculated layout 1.';

/** Said when a layout was saved under another name because the one asked for was taken. */
export function nameAdjustedNotice(wanted: string, given: string): string {
  return `Another layout is already named “${wanted}”. This one was named “${given}”.`;
}

export function createManualStores(deps: {
  inputs: StoreApi<InputsState>;
  results: StoreApi<ResultsState>;
  repo: Repository<ManualLayoutSpec>;
  /** Told what the user should know that no screen says, e.g. a deletion in another tab. */
  onNotice?: (message: string) => void;
}): ManualStores {
  const { inputs, results } = deps;
  const manualLayouts = createManualLayoutsStore(deps.repo, {
    onNameAdjusted: (wanted, given) => deps.onNotice?.(nameAdjustedNotice(wanted, given)),
    onListChange(ids, source) {
      const selected = results.getState().selectedManualId;
      if (selected === null || ids.includes(selected)) return;
      // The selected manual layout is gone (deleted here or in another tab): the first
      // calculated layout shows. A deletion made elsewhere is said, since nothing here did it.
      results.getState().selectManual(null);
      results.getState().select(0);
      if (source === 'external') deps.onNotice?.(SELECTED_DELETED_ELSEWHERE);
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
  onNotice: (message) => useNoticesStore.getState().push(message),
  repo: createDefaultRepository({
    key: STORAGE_KEYS.manualLayouts,
    schema: manualLayoutSpecSchema,
    discardFailed: true,
    onNotice: (message) => useNoticesStore.getState().push(message),
  }),
});

onStorageChange(STORAGE_KEYS.manualLayouts, () => stores.manualLayouts.getState().refresh());

export const useManualLayoutsStore = asHook(stores.manualLayouts);
export const useManualEditorStore = asHook(stores.manualEditor);
