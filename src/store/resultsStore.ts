import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Inputs, OptimizeResult, RankedLayout } from '../domain/types';
import { createWorkerRunner, type RunOptimizer } from '../worker/optimizerClient';
import { useSceneStore } from './sceneStore';

export interface ResultsState {
  status: 'idle' | 'running' | 'ready' | 'error';
  inputs: Inputs | null;
  result: OptimizeResult | null;
  stale: boolean;
  selectedIndex: number;
  error: string | null;
  request(inputs: Inputs): Promise<void>;
  markStale(): void;
  select(index: number): void;
  restore(inputs: Inputs, result: OptimizeResult, selectedIndex: number): void;
  retry(): void;
}

export function selectSelected(s: ResultsState): RankedLayout | null {
  return s.result?.layouts[s.selectedIndex] ?? null;
}

function sameDims(a: Inputs['pallet'], b: Inputs['pallet']): boolean {
  return a.length === b.length && a.width === b.width && a.height === b.height;
}

function sameInputs(a: Inputs, b: Inputs): boolean {
  return (
    sameDims(a.pallet, b.pallet) &&
    sameDims(a.product, b.product) &&
    sameDims(a.maxCarton, b.maxCarton) &&
    a.targetQuantity === b.targetQuantity &&
    a.leeway === b.leeway &&
    a.wallThickness === b.wallThickness &&
    a.overhang === b.overhang &&
    a.rotationMode === b.rotationMode &&
    a.keepCartonsUpright === b.keepCartonsUpright &&
    a.customOrientations.length === b.customOrientations.length &&
    a.customOrientations.every((c, i) => c === b.customOrientations[i])
  );
}

export function createResultsStore(
  run: RunOptimizer,
  opts: { onSelectionReset?: () => void } = {},
): StoreApi<ResultsState> {
  const resetSelection = () => opts.onSelectionReset?.();
  return createStore<ResultsState>()((set, get) => {
    let latest = 0;
    let lastRequested: Inputs | null = null;
    // True when markStale() ran after the latest run started: its result is still stored, but stale.
    let staleMark = false;
    let inFlight: { inputs: Inputs; promise: Promise<void> } | null = null;

    const start = (inputs: Inputs): Promise<void> => {
      const token = ++latest;
      lastRequested = inputs;
      staleMark = false;
      set({ status: 'running', error: null });
      const promise = (async () => {
        try {
          const result = await run(inputs);
          if (token !== latest) return;
          inFlight = null;
          set({ status: 'ready', inputs, result, stale: staleMark, selectedIndex: 0, error: null });
          resetSelection();
        } catch (err) {
          if (token !== latest) return;
          inFlight = null;
          set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      })();
      inFlight = { inputs, promise };
      return promise;
    };

    return {
      status: 'idle',
      inputs: null,
      result: null,
      stale: false,
      selectedIndex: 0,
      error: null,
      request(inputs) {
        const s = get();
        if (s.status === 'ready' && s.result && s.inputs && sameInputs(inputs, s.inputs)) {
          staleMark = false;
          set({ stale: false });
          return Promise.resolve();
        }
        if (s.status === 'running' && inFlight && sameInputs(inputs, inFlight.inputs)) {
          staleMark = false;
          return inFlight.promise;
        }
        return start(inputs);
      },
      markStale() {
        if (!get().result) return;
        staleMark = true;
        set({ stale: true });
      },
      select(index) {
        const count = get().result?.layouts.length ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= count) return;
        set({ selectedIndex: index });
        resetSelection();
      },
      restore(inputs, result, selectedIndex) {
        latest += 1; // supersede any run still in flight
        inFlight = null;
        staleMark = false;
        lastRequested = inputs;
        set({ status: 'ready', inputs, result, stale: false, selectedIndex, error: null });
        resetSelection();
      },
      retry() {
        if (lastRequested) void start(lastRequested);
      },
    };
  });
}

const resultsStore = createResultsStore(createWorkerRunner(), {
  onSelectionReset: () => useSceneStore.getState().setSelection(null),
});

export const useResultsStore = Object.assign(
  <T>(selector: (s: ResultsState) => T): T => useStore(resultsStore, selector),
  resultsStore,
);
