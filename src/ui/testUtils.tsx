import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import App from '../App';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { FakeStorage } from '../persistence/testStorage';
import { createInputsStore } from '../store/inputsStore';
import { createManualStores } from '../store/manualStores';
import { samplePresets } from '../data/samplePresets';
import { manualLayoutSpecSchema } from '../domain/manualSchemas';
import { presetSchema, scenarioSchema } from '../domain/schemas';
import { STORAGE_KEYS } from '../persistence/keys';
import { createLocalStorageRepository } from '../persistence/localStorageRepository';
import { createPrefsStore, type ViewMode } from '../store/prefsStore';
import { createPresetsStore } from '../store/presetsStore';
import { createResultsStore } from '../store/resultsStore';
import { createScenariosStore } from '../store/scenariosStore';
import { createSceneStore } from '../store/sceneStore';
import type { RunOptimizer } from '../worker/optimizerClient';
import type { ResolvedStores } from './StoreContext';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

export interface StoreOptions {
  /** The view mode the prefs store starts in; tests default to Full. */
  viewMode?: ViewMode;
  /** The storage the manual layouts are kept in (to act as another tab on it). */
  manualStorage?: Storage;
  /** Told what the manual stores would tell the user in a notice. */
  onNotice?: (message: string) => void;
}

/** Real stores around a runner that resolves optimize(inputs) immediately. */
export function makeStores(
  run: RunOptimizer = (i: Inputs) => Promise.resolve(optimize(i)),
  { viewMode = 'full', manualStorage = new FakeStorage(), onNotice }: StoreOptions = {},
): ResolvedStores {
  const scene = createSceneStore();
  const inputs = createInputsStore(new FakeStorage());
  const results = createResultsStore(run, {
    onSelectionReset: () => scene.getState().resetForLayout(),
  });
  const presets = createPresetsStore(
    createLocalStorageRepository({
      key: STORAGE_KEYS.presets,
      schema: presetSchema,
      seed: samplePresets,
      storage: new FakeStorage(),
    }),
    () => {},
  );
  const scenarios = createScenariosStore(
    createLocalStorageRepository({
      key: STORAGE_KEYS.scenarios,
      schema: scenarioSchema,
      storage: new FakeStorage(),
    }),
    () => {},
  );
  const prefs = createPrefsStore(new FakeStorage(), { viewMode, theme: 'light' });
  const manual = createManualStores({
    inputs,
    results,
    onNotice,
    repo: createLocalStorageRepository({
      key: STORAGE_KEYS.manualLayouts,
      schema: manualLayoutSpecSchema,
      discardFailed: true,
      storage: manualStorage,
    }),
  });
  return { inputs, results, scene, presets, scenarios, prefs, ...manual };
}

/** Lets the debounce elapse and any optimizer run settle. */
export async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

/** Renders the whole app with fresh stores and fake timers, after the first calculation. */
export async function renderApp(run?: RunOptimizer, options?: StoreOptions) {
  // shouldAdvanceTime lets Testing Library's own setTimeout(0) after each user event fire;
  // it only advances fake timers under Jest, so without it every user event would hang.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const stores = makeStores(run, options);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<App stores={stores} />);
  await flush();
  return { user, stores };
}

/** The value shown in one production summary tile. */
export function summaryTile(label: string): string | null | undefined {
  const summary = screen.getByRole('region', { name: 'Production summary' });
  return within(summary).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}
