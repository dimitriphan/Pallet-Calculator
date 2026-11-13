import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { useInputsStore, type InputsState } from '../store/inputsStore';
import type { ManualEditorState } from '../store/manualEditorStore';
import type { ManualLayoutsState } from '../store/manualLayoutsStore';
import { useManualEditorStore, useManualLayoutsStore } from '../store/manualStores';
import { usePresetsStore, type PresetsState } from '../store/presetsStore';
import { usePrefsStore, type PrefsState } from '../store/prefsStore';
import { useResultsStore, type ResultsState } from '../store/resultsStore';
import { useScenariosStore, type ScenariosState } from '../store/scenariosStore';
import { useSceneStore, type SceneState } from '../store/sceneStore';

/**
 * What a caller may supply; presets, scenarios and prefs default to the app's own stores. The
 * two manual stores are joined to the inputs and results stores they were created with
 * (`createManualStores`), so a caller that supplies its own inputs and results supplies these
 * too.
 */
export interface AppStores {
  inputs: StoreApi<InputsState>;
  results: StoreApi<ResultsState>;
  scene: StoreApi<SceneState>;
  presets?: StoreApi<PresetsState>;
  scenarios?: StoreApi<ScenariosState>;
  prefs?: StoreApi<PrefsState>;
  manualLayouts?: StoreApi<ManualLayoutsState>;
  manualEditor?: StoreApi<ManualEditorState>;
}

export type ResolvedStores = Required<AppStores>;

const defaultStores: ResolvedStores = {
  inputs: useInputsStore,
  results: useResultsStore,
  scene: useSceneStore,
  presets: usePresetsStore,
  scenarios: useScenariosStore,
  prefs: usePrefsStore,
  manualLayouts: useManualLayoutsStore,
  manualEditor: useManualEditorStore,
};

const StoreContext = createContext<ResolvedStores>(defaultStores);

/** Supplies the stores the workspace reads; tests pass their own, the app uses the defaults. */
export function StoreProvider({ stores, children }: { stores?: AppStores; children: ReactNode }) {
  return (
    <StoreContext.Provider value={stores ? { ...defaultStores, ...stores } : defaultStores}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStores(): ResolvedStores {
  return useContext(StoreContext);
}

export function useInputs<T>(selector: (s: InputsState) => T): T {
  return useStore(useStores().inputs, selector);
}

export function useResults<T>(selector: (s: ResultsState) => T): T {
  return useStore(useStores().results, selector);
}

export function useScene<T>(selector: (s: SceneState) => T): T {
  return useStore(useStores().scene, selector);
}

export function usePresets<T>(selector: (s: PresetsState) => T): T {
  return useStore(useStores().presets, selector);
}

export function useScenarios<T>(selector: (s: ScenariosState) => T): T {
  return useStore(useStores().scenarios, selector);
}

export function usePrefs<T>(selector: (s: PrefsState) => T): T {
  return useStore(useStores().prefs, selector);
}

export function useManualLayouts<T>(selector: (s: ManualLayoutsState) => T): T {
  return useStore(useStores().manualLayouts, selector);
}

export function useManualEditor<T>(selector: (s: ManualEditorState) => T): T {
  return useStore(useStores().manualEditor, selector);
}
