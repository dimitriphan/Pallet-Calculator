import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { scenarioSchema } from '../domain/schemas';
import type { Inputs, OptimizeResult, Scenario } from '../domain/types';
import type { ManualLayoutSpec } from '../engine/manual/build';
import { computeAnalytics } from '../engine/analytics/analytics';
import { STORAGE_KEYS } from '../persistence/keys';
import { createDefaultRepository, onStorageChange } from '../persistence/localStorageRepository';
import type { Repository } from '../persistence/repository';
import { useNoticesStore } from './noticesStore';

export interface ScenariosState {
  scenarios: Scenario[];
  /**
   * Saves the result with the manual layouts present (all of them, out-of-date ones too).
   * Leave `manualLayouts` out only where there is no manual layouts store to read.
   */
  save(
    name: string,
    inputs: Inputs,
    result: OptimizeResult,
    selectedIndex: number,
    manualLayouts?: ManualLayoutSpec[],
  ): Scenario;
  rename(id: string, name: string): void;
  duplicate(id: string): Scenario;
  remove(id: string): void;
  /** Re-reads the stored scenarios, e.g. after another tab changed them. */
  refresh(): void;
}

export function createScenariosStore(
  repo: Repository<Scenario>,
  _notify: (message: string) => void,
  now: () => Date = () => new Date(),
): StoreApi<ScenariosState> {
  return createStore<ScenariosState>()((set, get) => {
    // The repository merges each change with what other tabs stored, so read the list back.
    const sync = () => set({ scenarios: repo.list() });
    const add = (scenario: Scenario) => {
      repo.save(scenario);
      sync();
    };
    return {
      scenarios: repo.list(),
      save(name, inputs, result, selectedIndex, manualLayouts) {
        const ranked = result.layouts[selectedIndex];
        const scenario: Scenario = {
          id: crypto.randomUUID(),
          name,
          savedAt: now().toISOString(),
          inputs,
          result,
          selectedIndex,
          analytics: ranked ? computeAnalytics(ranked.layout, inputs) : null,
          ...(manualLayouts ? { manualLayouts: structuredClone(manualLayouts) } : {}),
        };
        add(scenario);
        return scenario;
      },
      rename(id, name) {
        const existing = get().scenarios.find((s) => s.id === id);
        if (!existing) return;
        const next = { ...existing, name };
        repo.save(next);
        sync();
      },
      duplicate(id) {
        const source = get().scenarios.find((s) => s.id === id);
        if (!source) throw new Error(`Unknown scenario ${id}`);
        const copy: Scenario = {
          ...structuredClone(source),
          id: crypto.randomUUID(),
          name: `${source.name} (copy)`,
          savedAt: now().toISOString(),
        };
        add(copy);
        return copy;
      },
      remove(id) {
        repo.remove(id);
        sync();
      },
      refresh() {
        repo.refresh?.();
        sync();
      },
    };
  });
}

const notify = (message: string) => useNoticesStore.getState().push(message);
const scenariosStore = createScenariosStore(
  createDefaultRepository({
    key: STORAGE_KEYS.scenarios,
    schema: scenarioSchema,
    onNotice: notify,
  }),
  notify,
);

onStorageChange(STORAGE_KEYS.scenarios, () => scenariosStore.getState().refresh());

export const useScenariosStore = Object.assign(
  <T>(selector: (s: ScenariosState) => T): T => useStore(scenariosStore, selector),
  scenariosStore,
);
