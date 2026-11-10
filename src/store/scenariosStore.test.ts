import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { scenarioSchema } from '../domain/schemas';
import { optimize } from '../engine/optimize';
import { STORAGE_KEYS } from '../persistence/keys';
import { createLocalStorageRepository } from '../persistence/localStorageRepository';
import { FakeStorage } from '../persistence/testStorage';
import { createScenariosStore } from './scenariosStore';

function setup(storage = new FakeStorage(), now = () => new Date('2026-11-10T12:00:00.000Z')) {
  const notices: string[] = [];
  const notify = (m: string) => notices.push(m);
  const repo = createLocalStorageRepository({
    key: STORAGE_KEYS.scenarios,
    schema: scenarioSchema,
    storage,
    onNotice: notify,
  });
  return { storage, notices, store: createScenariosStore(repo, notify, now) };
}

const result = optimize(DEFAULT_INPUTS);

describe('scenarios store', () => {
  it('saves with analytics and a timestamp, then renames, duplicates and removes', () => {
    const { store } = setup();
    expect(result.layouts.length).toBeGreaterThan(1);
    const s = store.getState().save('First', DEFAULT_INPUTS, result, 1);
    expect(s.savedAt).toBe('2026-11-10T12:00:00.000Z');
    expect(s.analytics).not.toBeNull();
    expect(s.analytics?.totals.products).toBe(result.layouts[1]!.layout.totalProducts);
    store.getState().rename(s.id, 'Renamed');
    expect(store.getState().scenarios[0]!.name).toBe('Renamed');
    const d = store.getState().duplicate(s.id);
    expect(d.name).toBe('Renamed (copy)');
    expect(d.id).not.toBe(s.id);
    expect(store.getState().scenarios).toHaveLength(2);
    store.getState().remove(s.id);
    expect(store.getState().scenarios.map((x) => x.id)).toEqual([d.id]);
  });

  it('gives a duplicate a fresh savedAt', () => {
    let t = Date.parse('2026-11-10T12:00:00.000Z');
    const { store } = setup(new FakeStorage(), () => new Date(t));
    const s = store.getState().save('A', DEFAULT_INPUTS, result, 0);
    t += 60_000;
    expect(store.getState().duplicate(s.id).savedAt).toBe('2026-11-10T12:01:00.000Z');
  });

  it('stores null analytics when there are no layouts', () => {
    const { store } = setup();
    const empty = { ...result, layouts: [] };
    expect(store.getState().save('E', DEFAULT_INPUTS, empty, 0).analytics).toBeNull();
  });

  it('reloads deeply equal from a fresh store over the same storage', () => {
    const storage = new FakeStorage();
    const { store } = setup(storage);
    const s = store.getState().save('Persist', DEFAULT_INPUTS, result, 2);
    const reloaded = setup(storage);
    expect(reloaded.notices).toEqual([]);
    const got = reloaded.store.getState().scenarios[0]!;
    expect(got.result).toEqual(result);
    expect(got.selectedIndex).toBe(2);
    expect(got).toEqual(s);
  });

  it('keeps state and reports when storage is full', () => {
    const storage = new FakeStorage();
    storage.failWrites = true;
    const { store, notices } = setup(storage);
    store.getState().save('X', DEFAULT_INPUTS, result, 0);
    expect(store.getState().scenarios).toHaveLength(1);
    expect(notices).toEqual(['Could not save: browser storage is full or unavailable.']);
  });
});
