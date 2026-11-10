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

export function createResultsStore(
  run: RunOptimizer,
  opts: { onSelectionReset?: () => void } = {},
): StoreApi<ResultsState> {
  const resetSelection = () => opts.onSelectionReset?.();
  return createStore<ResultsState>()((set, get) => {
    let latest = 0;
    let lastRequested: Inputs | null = null;
    return {
      status: 'idle',
      inputs: null,
      result: null,
      stale: false,
      selectedIndex: 0,
      error: null,
      async request(inputs) {
        const token = ++latest;
        lastRequested = inputs;
        set({ status: 'running', error: null });
        try {
          const result = await run(inputs);
          if (token !== latest) return;
          set({ status: 'ready', inputs, result, stale: false, selectedIndex: 0, error: null });
          resetSelection();
        } catch (err) {
          if (token !== latest) return;
          set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      },
      markStale: () => set({ stale: true }),
      select(index) {
        const count = get().result?.layouts.length ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= count) return;
        set({ selectedIndex: index });
        resetSelection();
      },
      restore(inputs, result, selectedIndex) {
        latest += 1; // supersede any run still in flight
        lastRequested = inputs;
        set({ status: 'ready', inputs, result, stale: false, selectedIndex, error: null });
        resetSelection();
      },
      retry() {
        if (lastRequested) void get().request(lastRequested);
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
