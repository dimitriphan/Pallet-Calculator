import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { scenarioSchema } from '../domain/schemas';
import type { Inputs, OptimizeResult, Scenario } from '../domain/types';
import { computeAnalytics } from '../engine/analytics/analytics';
import { STORAGE_KEYS } from '../persistence/keys';
import { createDefaultRepository } from '../persistence/localStorageRepository';
import type { Repository } from '../persistence/repository';
import { useNoticesStore } from './noticesStore';

export interface ScenariosState {
  scenarios: Scenario[];
  save(name: string, inputs: Inputs, result: OptimizeResult, selectedIndex: number): Scenario;
  rename(id: string, name: string): void;
  duplicate(id: string): Scenario;
  remove(id: string): void;
}

export function createScenariosStore(
  repo: Repository<Scenario>,
  _notify: (message: string) => void,
  now: () => Date = () => new Date(),
): StoreApi<ScenariosState> {
  return createStore<ScenariosState>()((set, get) => {
    const add = (scenario: Scenario) => {
      repo.save(scenario);
      set((s) => ({ scenarios: [...s.scenarios, scenario] }));
    };
    return {
      scenarios: repo.list(),
      save(name, inputs, result, selectedIndex) {
        const ranked = result.layouts[selectedIndex];
        const scenario: Scenario = {
          id: crypto.randomUUID(),
          name,
          savedAt: now().toISOString(),
          inputs,
          result,
          selectedIndex,
          analytics: ranked ? computeAnalytics(ranked.layout, inputs) : null,
        };
        add(scenario);
        return scenario;
      },
      rename(id, name) {
        const existing = get().scenarios.find((s) => s.id === id);
        if (!existing) return;
        const next = { ...existing, name };
        repo.save(next);
        set((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? next : x)) }));
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
        set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) }));
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

export const useScenariosStore = Object.assign(
  <T>(selector: (s: ScenariosState) => T): T => useStore(scenariosStore, selector),
  scenariosStore,
);
