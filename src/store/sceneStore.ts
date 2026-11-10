import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type Selection =
  | { kind: 'product'; cartonIndex: number; productIndex: number }
  | { kind: 'carton'; cartonIndex: number }
  | { kind: 'pallet' }
  | null;

export type ToggleKey =
  | 'showProducts'
  | 'showCartons'
  | 'showLabels'
  | 'showEnvelope'
  | 'showGrid'
  | 'showWireframe'
  | 'showMeasurements'
  | 'forceProducts';

export interface SceneState {
  showProducts: boolean;
  showCartons: boolean;
  showLabels: boolean;
  showEnvelope: boolean;
  showGrid: boolean;
  showWireframe: boolean;
  showMeasurements: boolean;
  forceProducts: boolean;
  selection: Selection;
  cameraCommand: { type: 'reset' | 'focus'; nonce: number } | null;
  /** Set by the 3D canvas's capture bridge; null until the canvas is mounted. */
  captureViews: null | (() => { current: string; top: string; side: string });
  setCaptureViews(fn: SceneState['captureViews']): void;
  toggle(key: ToggleKey): void;
  setSelection(s: Selection): void;
  resetView(): void;
  focusSelection(): void;
}

export function createSceneStore(): StoreApi<SceneState> {
  return createStore<SceneState>()((set) => {
    let nonce = 0;
    return {
      showProducts: false,
      showCartons: true,
      showLabels: false,
      showEnvelope: true,
      showGrid: true,
      showWireframe: false,
      showMeasurements: false,
      forceProducts: false,
      selection: null,
      cameraCommand: null,
      captureViews: null,
      setCaptureViews: (fn) => set({ captureViews: fn }),
      toggle: (key) => set((s) => ({ [key]: !s[key] })),
      setSelection: (selection) => set({ selection }),
      resetView: () => set({ cameraCommand: { type: 'reset', nonce: ++nonce } }),
      focusSelection: () => set({ cameraCommand: { type: 'focus', nonce: ++nonce } }),
    };
  });
}

const sceneStore = createSceneStore();

export const useSceneStore = Object.assign(
  <T>(selector: (s: SceneState) => T): T => useStore(sceneStore, selector),
  sceneStore,
);
