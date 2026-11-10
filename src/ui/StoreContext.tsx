import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { useInputsStore, type InputsState } from '../store/inputsStore';
import { usePresetsStore, type PresetsState } from '../store/presetsStore';
import { useResultsStore, type ResultsState } from '../store/resultsStore';
import { useScenariosStore, type ScenariosState } from '../store/scenariosStore';
import { useSceneStore, type SceneState } from '../store/sceneStore';

/** What a caller may supply; presets and scenarios default to the app's own stores. */
export interface AppStores {
  inputs: StoreApi<InputsState>;
  results: StoreApi<ResultsState>;
  scene: StoreApi<SceneState>;
  presets?: StoreApi<PresetsState>;
  scenarios?: StoreApi<ScenariosState>;
}

export type ResolvedStores = Required<AppStores>;

const defaultStores: ResolvedStores = {
  inputs: useInputsStore,
  results: useResultsStore,
  scene: useSceneStore,
  presets: usePresetsStore,
  scenarios: useScenariosStore,
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
