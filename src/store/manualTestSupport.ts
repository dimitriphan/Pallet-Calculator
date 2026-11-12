/** Test support: the app's stores around a fake storage, as `makeStores` builds them. */
import { manualLayoutSpecSchema } from '../domain/manualSchemas';
import type { Inputs, OptimizeResult } from '../domain/types';
import { optimize } from '../engine/optimize';
import { STORAGE_KEYS } from '../persistence/keys';
import { createLocalStorageRepository } from '../persistence/localStorageRepository';
import { FakeStorage } from '../persistence/testStorage';
import { createInputsStore } from './inputsStore';
import { createManualStores } from './manualStores';
import { createResultsStore } from './resultsStore';

export function manualRepo(storage: Storage, notices: string[] = []) {
  return createLocalStorageRepository({
    key: STORAGE_KEYS.manualLayouts,
    schema: manualLayoutSpecSchema,
    storage,
    onNotice: (m) => notices.push(m),
  });
}

const calculated = new Map<string, OptimizeResult>();
/** `optimize`, once per inputs: the search is the slow part of these tests. */
export function optimizeOnce(inputs: Inputs): OptimizeResult {
  const key = JSON.stringify(inputs);
  let result = calculated.get(key);
  if (!result) {
    result = optimize(inputs);
    calculated.set(key, result);
  }
  return result;
}

/**
 * Inputs, results and the two manual stores joined as in the app. `calculate()` runs the
 * search for the current inputs and waits for it.
 */
export function manualStores(storage: Storage = new FakeStorage()) {
  const inputs = createInputsStore(new FakeStorage());
  const sceneResets = { count: 0 };
  const results = createResultsStore((i) => Promise.resolve(optimizeOnce(i)), {
    onSelectionReset: () => sceneResets.count++,
  });
  const notices: string[] = [];
  const manual = createManualStores({ inputs, results, repo: manualRepo(storage, notices) });
  const current = (): Inputs => {
    const parsed = inputs.getState().parsed;
    if (!parsed.ok) throw new Error('The inputs are invalid');
    return parsed.inputs;
  };
  return {
    storage,
    notices,
    inputs,
    results,
    sceneResets,
    ...manual,
    current,
    calculate: () => results.getState().request(current()),
    /** Replaces the inputs with `current()` changed by `over`. */
    change: (over: Partial<Inputs>) => inputs.getState().replaceInputs({ ...current(), ...over }),
  };
}
