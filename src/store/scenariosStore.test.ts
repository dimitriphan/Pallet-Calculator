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

  it('loads a scenario stored by Round 1, reading boxesPerCarton as null', () => {
    const storage = new FakeStorage();
    const s = setup(storage).store.getState().save('Old', DEFAULT_INPUTS, result, 1);
    const round1 = structuredClone(s) as unknown as { inputs: Record<string, unknown> };
    delete round1.inputs.boxesPerCarton;
    storage.setItem(STORAGE_KEYS.scenarios, JSON.stringify({ version: 1, items: [round1] }));
    const reloaded = setup(storage);
    expect(reloaded.notices).toEqual([]);
    expect(reloaded.store.getState().scenarios).toEqual([s]);
    expect(reloaded.store.getState().scenarios[0]!.inputs.boxesPerCarton).toBeNull();
  });

  it('loads a scenario stored before the minimum stability as Auto', () => {
    const storage = new FakeStorage();
    const s = setup(storage).store.getState().save('Old', DEFAULT_INPUTS, result, 1);
    const old = structuredClone(s) as unknown as { inputs: Record<string, unknown> };
    delete old.inputs.minStability;
    storage.setItem(STORAGE_KEYS.scenarios, JSON.stringify({ version: 1, items: [old] }));
    const reloaded = setup(storage);
    expect(reloaded.notices).toEqual([]);
    expect(reloaded.store.getState().scenarios).toEqual([s]);
    expect(reloaded.store.getState().scenarios[0]!.inputs.minStability).toBe('auto');
  });

  it('saves and reloads a scenario worked out with a minimum stability', () => {
    const storage = new FakeStorage();
    const inputs = { ...DEFAULT_INPUTS, minStability: 'good' as const };
    const s = setup(storage).store.getState().save('Good only', inputs, optimize(inputs), 0);
    expect(s.result.autoBestProducts).toBe(260);
    const reloaded = setup(storage);
    expect(reloaded.notices).toEqual([]);
    expect(reloaded.store.getState().scenarios).toEqual([s]);
  });

  it('loads a scenario stored before the layer pattern setting as Auto, and keeps a stored one', () => {
    const storage = new FakeStorage();
    const s = setup(storage).store.getState().save('Old', DEFAULT_INPUTS, result, 1);
    const old = structuredClone(s) as unknown as { inputs: Record<string, unknown> };
    delete old.inputs.layerPattern;
    storage.setItem(STORAGE_KEYS.scenarios, JSON.stringify({ version: 1, items: [old] }));
    const reloaded = setup(storage);
    expect(reloaded.notices).toEqual([]);
    expect(reloaded.store.getState().scenarios).toEqual([s]);
    expect(reloaded.store.getState().scenarios[0]!.inputs.layerPattern).toBe('auto');

    const inputs = { ...DEFAULT_INPUTS, layerPattern: 'pinwheelOnly' as const };
    const kept = setup(storage).store.getState().save('Pinwheels', inputs, optimize(inputs), 0);
    expect(kept.result.autoBestProducts).toBe(260);
    expect(setup(storage).store.getState().scenarios).toContainEqual(kept);
  });

  it('keeps state and reports when storage is full', () => {
    const storage = new FakeStorage();
    storage.failWrites = true;
    const { store, notices } = setup(storage);
    store.getState().save('X', DEFAULT_INPUTS, result, 0);
    expect(store.getState().scenarios).toHaveLength(1);
    expect(notices).toEqual(['Could not save: browser storage is full or unavailable.']);
  });

  it('keeps scenarios saved in two tabs and refreshes from storage', () => {
    const storage = new FakeStorage();
    const tabA = setup(storage).store;
    const tabB = setup(storage).store;
    tabA.getState().save('A', DEFAULT_INPUTS, result, 0);
    tabB.getState().save('B', DEFAULT_INPUTS, result, 0);
    expect(tabB.getState().scenarios.map((x) => x.name)).toEqual(['A', 'B']);
    tabA.getState().refresh();
    expect(tabA.getState().scenarios.map((x) => x.name)).toEqual(['A', 'B']);
  });
});
