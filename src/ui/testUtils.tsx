import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import App from '../App';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { FakeStorage } from '../persistence/testStorage';
import { createInputsStore } from '../store/inputsStore';
import { samplePresets } from '../data/samplePresets';
import { presetSchema, scenarioSchema } from '../domain/schemas';
import { STORAGE_KEYS } from '../persistence/keys';
import { createLocalStorageRepository } from '../persistence/localStorageRepository';
import { createPrefsStore } from '../store/prefsStore';
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

/** Real stores around a runner that resolves optimize(inputs) immediately. */
export function makeStores(
  run: RunOptimizer = (i: Inputs) => Promise.resolve(optimize(i)),
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
  const prefs = createPrefsStore(new FakeStorage(), { viewMode: 'full', theme: 'light' });
  return { inputs, results, scene, presets, scenarios, prefs };
}

/** Lets the debounce elapse and any optimizer run settle. */
export async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

/** Renders the whole app with fresh stores and fake timers, after the first calculation. */
export async function renderApp(run?: RunOptimizer) {
  // shouldAdvanceTime lets Testing Library's own setTimeout(0) after each user event fire;
  // it only advances fake timers under Jest, so without it every user event would hang.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const stores = makeStores(run);
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
