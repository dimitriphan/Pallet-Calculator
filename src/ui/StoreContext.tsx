import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { useInputsStore, type InputsState } from '../store/inputsStore';
import { useResultsStore, type ResultsState } from '../store/resultsStore';
import { useSceneStore, type SceneState } from '../store/sceneStore';

export interface AppStores {
  inputs: StoreApi<InputsState>;
  results: StoreApi<ResultsState>;
  scene: StoreApi<SceneState>;
}

const defaultStores: AppStores = {
  inputs: useInputsStore,
  results: useResultsStore,
  scene: useSceneStore,
};

const StoreContext = createContext<AppStores>(defaultStores);

/** Supplies the stores the workspace reads; tests pass their own, the app uses the defaults. */
export function StoreProvider({ stores, children }: { stores?: AppStores; children: ReactNode }) {
  return <StoreContext.Provider value={stores ?? defaultStores}>{children}</StoreContext.Provider>;
}

export function useStores(): AppStores {
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
