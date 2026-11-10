import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';
import { createLocalStorageRepository } from '../persistence/localStorageRepository';
import { FakeStorage } from '../persistence/testStorage';
import { presetSchema } from '../domain/schemas';
import { samplePresets } from '../data/samplePresets';
import {
  createPresetsStore,
  inputsMatchPreset,
  presetToInputs,
  usePresetsStore,
} from './presetsStore';

function setup(storage = new FakeStorage()) {
  const notices: string[] = [];
  const notify = (m: string) => notices.push(m);
  const repo = createLocalStorageRepository({
    key: STORAGE_KEYS.presets,
    schema: presetSchema,
    storage,
    onNotice: notify,
    seed: samplePresets,
  });
  return { storage, notices, store: createPresetsStore(repo, notify) };
}

const other: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 3, width: 2, height: 1 },
  pallet: { length: 48, width: 40, height: 60 },
  maxCarton: { length: 20, width: 10, height: 10 },
  targetQuantity: 100,
  leeway: 1,
  wallThickness: 0.5,
  overhang: 2,
  rotationMode: 'custom',
  customOrientations: ['LWH', 'WLH'],
  keepCartonsUpright: true,
};

describe('presets store', () => {
  it('seeds the sample presets on first run only', () => {
    const { store, storage } = setup();
    const names = store.getState().presets.map((p) => p.name);
    expect(names).toEqual(['Spec example 50 × 42 × 72', 'Standard GMA 48 × 40 × 72']);
    expect(store.getState().presets[1]!.pallet).toEqual({ length: 48, width: 40, height: 72 });
    const written = new FakeStorage();
    written.setItem(STORAGE_KEYS.presets, JSON.stringify({ version: 1, items: [] }));
    expect(setup(written).store.getState().presets).toEqual([]);
    expect(storage.getItem(STORAGE_KEYS.presets)).toBeNull();
  });

  it('presetToInputs keeps the product and copies every other field', () => {
    const { store } = setup();
    const p = store.getState().create('Mine', other);
    const result = presetToInputs(p, DEFAULT_INPUTS);
    expect(result).toEqual({ ...other, product: DEFAULT_INPUTS.product });
  });

  it('is unaffected by later input edits, and inputsMatchPreset flips to false', () => {
    const p = usePresetsStore.getState().create('Edit test', DEFAULT_INPUTS);
    const before = JSON.stringify(usePresetsStore.getState().presets);
    const loaded = presetToInputs(p, DEFAULT_INPUTS);
    expect(inputsMatchPreset(loaded, p)).toBe(true);
    const edited = { ...loaded, pallet: { ...loaded.pallet, length: 51 } };
    expect(inputsMatchPreset(edited, p)).toBe(false);
    expect(JSON.stringify(usePresetsStore.getState().presets)).toBe(before);
    expect(inputsMatchPreset({ ...loaded, product: { length: 1, width: 1, height: 1 } }, p)).toBe(
      true,
    );
    usePresetsStore.getState().remove(p.id);
  });

  it('creates, updates, activates and removes with persistence', () => {
    const storage = new FakeStorage();
    const { store } = setup(storage);
    const p = store.getState().create('A', other);
    store.getState().update(p.id, { name: 'B', leeway: 2 });
    store.getState().setActive(p.id);
    expect(store.getState().presets.find((x) => x.id === p.id)).toMatchObject({
      name: 'B',
      leeway: 2,
    });
    expect(
      setup(storage)
        .store.getState()
        .presets.find((x) => x.id === p.id)?.name,
    ).toBe('B');
    store.getState().remove(p.id);
    expect(store.getState().activePresetId).toBeNull();
    expect(store.getState().presets.some((x) => x.id === p.id)).toBe(false);
  });

  it('clones with a new id and a (copy) name', () => {
    const { store } = setup();
    const src = store.getState().presets[0]!;
    const copy = store.getState().clone(src.id);
    expect(copy.name).toBe(`${src.name} (copy)`);
    expect(copy.id).not.toBe(src.id);
    expect({ ...copy, id: '', name: '' }).toEqual({ ...src, id: '', name: '' });
  });

  it('imports exported text with new ids', () => {
    const { store } = setup();
    const text = store.getState().exportJson();
    expect(JSON.parse(text).version).toBe(1);
    const oldIds = store.getState().presets.map((p) => p.id);
    expect(store.getState().importJson(text)).toEqual({ imported: 2, skipped: 0 });
    const all = store.getState().presets;
    expect(all).toHaveLength(4);
    expect(new Set(all.map((p) => p.id)).size).toBe(4);
    expect(all.slice(2).every((p) => !oldIds.includes(p.id))).toBe(true);
    expect(JSON.parse(store.getState().exportJson([oldIds[0]!])).presets).toHaveLength(1);
  });

  it('rejects files that are not preset exports', () => {
    const { store, notices } = setup();
    expect(store.getState().importJson('[]')).toEqual({ imported: 0, skipped: 0 });
    expect(store.getState().importJson('nonsense')).toEqual({ imported: 0, skipped: 0 });
    expect(notices).toEqual([
      'That file is not a valid preset export.',
      'That file is not a valid preset export.',
    ]);
  });

  it('imports valid presets and skips invalid ones', () => {
    const { store } = setup();
    const good = store.getState().presets[0]!;
    const text = JSON.stringify({ version: 1, presets: [good, { id: 'x', name: 'bad' }] });
    expect(store.getState().importJson(text)).toEqual({ imported: 1, skipped: 1 });
  });

  it('skips an imported preset with custom rotation and no orientations', () => {
    const { store } = setup();
    const bad = { ...store.getState().presets[0]!, rotationMode: 'custom', customOrientations: [] };
    const text = JSON.stringify({ version: 1, presets: [bad] });
    expect(store.getState().importJson(text)).toEqual({ imported: 0, skipped: 1 });
  });

  it('shows presets saved in another tab after its own save and on refresh', () => {
    const storage = new FakeStorage();
    const tabA = setup(storage).store;
    const tabB = setup(storage).store;
    tabA.getState().create('From A', DEFAULT_INPUTS);
    const b = tabB.getState().create('From B', other);
    expect(tabB.getState().presets.map((p) => p.name)).toEqual([
      ...samplePresets.map((p) => p.name),
      'From A',
      'From B',
    ]);
    tabA.getState().setActive(b.id);
    tabA.getState().refresh();
    expect(tabA.getState().presets.map((p) => p.name)).toContain('From B');
    tabB.getState().remove(b.id);
    tabA.getState().refresh();
    expect(tabA.getState().presets.map((p) => p.name)).not.toContain('From B');
    expect(tabA.getState().activePresetId).toBeNull();
  });
});
