import { describe, expect, it } from 'vitest';
import { manualLayoutSpecSchema } from '../domain/manualSchemas';
import type { ManualLayoutSpec } from '../engine/manual/build';
import { MANUAL_ID_PREFIX, madeForOf, usableToPallet } from '../engine/manual/build';
import {
  manualSpec,
  OVERHANG_INPUTS as I,
  OVERHANGING_CARTONS,
  TEST_DESIGN,
} from '../engine/manual/testSupport';
import { STORAGE_KEYS } from '../persistence/keys';
import { NOT_SAVED } from '../persistence/localStorageRepository';
import { createMemoryRepository } from '../persistence/repository';
import { FakeStorage } from '../persistence/testStorage';
import {
  createManualLayoutsStore,
  nextManualName,
  type ManualLayoutDraft,
} from './manualLayoutsStore';
import { manualRepo, manualStores } from './manualTestSupport';

/** Everything the app saves is in the pallet frame: the overhanging layer, placed as ever. */
const DRAFT: ManualLayoutDraft = {
  design: TEST_DESIGN,
  cartons: usableToPallet(OVERHANGING_CARTONS, I.overhang),
  frame: 'pallet',
  upperLayers: 'alternate',
  madeFor: madeForOf(TEST_DESIGN, I),
};
/** Two cartons side by side, wholly inside the footprint. */
const INSIDE: ManualLayoutDraft = {
  ...DRAFT,
  cartons: usableToPallet(
    [
      { x: 0, y: 0, rotated: false },
      { x: 25, y: 0, rotated: false },
    ],
    I.overhang,
  ),
  upperLayers: 'same',
};

function setup(storage = new FakeStorage(), prefix = 'id') {
  const notices: string[] = [];
  const changes: string[][] = [];
  let n = 0;
  const store = createManualLayoutsStore(manualRepo(storage, notices), {
    onListChange: (ids) => changes.push(ids),
    newId: () => `${prefix}${++n}`,
  });
  return { storage, notices, changes, store, s: () => store.getState() };
}

const stored = (storage: Storage) =>
  JSON.parse(storage.getItem(STORAGE_KEYS.manualLayouts) ?? 'null') as {
    version: number;
    items: ManualLayoutSpec[];
  } | null;

describe('storage', () => {
  it('uses the key pc.manualLayouts.v1', () => {
    expect(STORAGE_KEYS.manualLayouts).toBe('pc.manualLayouts.v1');
  });

  it('stores what the user chose and nothing worked out, and reads it back', () => {
    const { storage, s } = setup();
    const saved = s().save(DRAFT, 'Mine');
    expect(stored(storage)).toEqual({ version: 1, items: [{ id: 'id1', name: 'Mine', ...DRAFT }] });
    expect(Object.keys(saved!).sort()).toEqual(
      ['cartons', 'design', 'frame', 'id', 'madeFor', 'name', 'upperLayers'].sort(),
    );
    expect(setup(storage).s().specs).toEqual([saved]);
  });

  it('drops an entry that cannot be read on its own, tells the user and keeps the rest', () => {
    const storage = new FakeStorage();
    const good = manualSpec({ id: 'good', name: 'Good' });
    const items: unknown[] = [
      { ...good, id: 'a', cartons: 'none' },
      good,
      { ...good, id: 'b', design: { ...good.design, counts: { length: 0, width: 1, height: 1 } } },
      { ...good, id: 'c', design: { ...good.design, facing: 'XYZ' } },
      { ...good, id: 'd', cartons: [{ x: 'left', y: 0, rotated: false }] },
      { ...good, id: 'e', madeFor: { ...good.madeFor, outer: { L: 0, W: 1, H: 1 } } },
      { ...good, id: 'f', upperLayers: 'spiral' },
      null,
      7,
    ];
    storage.setItem(STORAGE_KEYS.manualLayouts, JSON.stringify({ version: 1, items }));
    const { s, notices, store } = setup(storage);
    expect(s().specs).toEqual([good]);
    expect(notices).toEqual([expect.stringContaining('8 saved item(s) could not be read')]);
    store.getState().setInputs(I);
    expect(s().entries.map((e) => e.spec.id)).toEqual(['good']);
    // The damaged text is kept aside before the first write over it.
    s().save(INSIDE);
    expect(storage.getItem(`${STORAGE_KEYS.manualLayouts}.backup`)).toContain('"spiral"');
    expect(stored(storage)!.items.map((x) => x.id)).toEqual(['good', 'id1']);
  });

  it.each(['not json', '{"version":2,"items":[]}', '[]', 'null'])(
    'starts empty on unreadable data %s without throwing',
    (raw) => {
      const storage = new FakeStorage();
      storage.setItem(STORAGE_KEYS.manualLayouts, raw);
      const { s, notices } = setup(storage);
      expect(s().specs).toEqual([]);
      expect(notices).toHaveLength(1);
      expect(s().save(INSIDE)!.name).toBe('Manual 1');
      expect(storage.getItem(`${STORAGE_KEYS.manualLayouts}.backup`)).toBe(raw);
    },
  );

  it('says so, and keeps nothing, when a layout cannot be written (review I6)', () => {
    const storage = new FakeStorage();
    const { s, store, notices } = setup(storage);
    store.getState().setInputs(I);
    const kept = s().save(INSIDE, 'Kept')!;
    storage.failWrites = true;

    // Nothing is reported saved, renamed, copied or deleted, and the list stays what is stored.
    expect(s().save(INSIDE)).toBeNull();
    expect(s().saveAsNew(INSIDE)).toBeNull();
    expect(s().update(kept.id, DRAFT)).toBeNull();
    expect(s().rename(kept.id, 'Other')).toBe(false);
    expect(s().duplicate(kept.id)).toBeNull();
    expect(s().remove(kept.id)).toBe(false);
    expect(s().specs).toEqual([kept]);
    expect(s().entries).toHaveLength(1);
    expect(notices).toEqual(Array(6).fill(NOT_SAVED));

    // Once storage works again nothing that failed comes back on its own.
    storage.failWrites = false;
    expect(s().rename(kept.id, 'Renamed')).toBe(true);
    expect(stored(storage)!.items).toEqual([{ ...kept, name: 'Renamed' }]);
  });

  it('with no browser storage at all, layouts are kept for the session', () => {
    const store = createManualLayoutsStore(createMemoryRepository<ManualLayoutSpec>());
    store.getState().setInputs(I);
    expect(store.getState().save(INSIDE)).not.toBeNull();
    expect(store.getState().entries).toHaveLength(1);
  });

  it('a spec that gets past the schema but is not valid is flagged, never built, never fatal', () => {
    // A repository with no schema, as when browser storage is unavailable.
    const store = createManualLayoutsStore(createMemoryRepository<ManualLayoutSpec>());
    store.getState().setInputs(I);
    const bad = [
      { ...INSIDE, cartons: null as unknown as ManualLayoutDraft['cartons'] },
      { ...INSIDE, cartons: [{ x: NaN, y: 0, rotated: false }] },
      { ...INSIDE, design: { ...TEST_DESIGN, counts: { length: 1.5, width: 0, height: -1 } } },
    ];
    expect(() => {
      for (const draft of bad) store.getState().save(draft);
      store.getState().save(INSIDE);
    }).not.toThrow();
    const entries = store.getState().entries;
    expect(entries.map((e) => e.build.flags.map((f) => f.kind))).toEqual([
      ['invalid'],
      ['invalid'],
      ['invalid'],
      [],
    ]);
    for (const e of entries.slice(0, 3)) {
      expect(e.build.layout).toMatchObject({ layers: [], totalCartons: 0, totalProducts: 0 });
    }
  });

  it('picks up a change made in another tab on refresh', () => {
    const storage = new FakeStorage();
    const here = setup(storage);
    const there = setup(storage, 'other');
    here.store.getState().setInputs(I);
    const a = here.s().save(INSIDE, 'A');
    expect(there.s().specs).toEqual([]);
    there.s().refresh();
    expect(there.s().specs).toEqual([a]);
    there.s().rename(a!.id, 'B');
    there.s().save(DRAFT);
    here.s().refresh();
    expect(here.s().specs.map((x) => x.name)).toEqual(['B', 'Manual 1']);
    expect(here.s().entries.map((e) => e.ranked.manual.name)).toEqual(['B', 'Manual 1']);
    there.s().remove(a!.id);
    here.s().refresh();
    expect(here.s().specs.map((x) => x.name)).toEqual(['Manual 1']);
    expect(here.changes.at(-1)).toEqual(here.s().specs.map((x) => x.id));
  });

  it('the app wiring refreshes on a storage event for the key only', async () => {
    const { onStorageChange } = await import('../persistence/localStorageRepository');
    let calls = 0;
    const off = onStorageChange(STORAGE_KEYS.manualLayouts, () => calls++);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.presets }));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.manualLayouts }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    off();
    expect(calls).toBe(2);
  });
});

describe('default names', () => {
  it('takes the lowest unused number', () => {
    expect(nextManualName([])).toBe('Manual 1');
    expect(nextManualName(['Manual 1', 'Manual 2'])).toBe('Manual 3');
    expect(nextManualName(['Manual 2', 'Manual 4'])).toBe('Manual 1');
    expect(nextManualName(['Manual 1', 'Manual 3', 'Mine', 'Manual 02', 'Manual 1 (copy)'])).toBe(
      'Manual 2',
    );
  });

  it('names new layouts Manual 1, Manual 2, ... and reuses a freed number', () => {
    const { s } = setup();
    const a = s().save(INSIDE);
    const b = s().save(INSIDE, '   ');
    const c = s().saveAsNew(INSIDE);
    expect([a!.name, b!.name, c!.name]).toEqual(['Manual 1', 'Manual 2', 'Manual 3']);
    s().remove(b!.id);
    expect(s().nextName()).toBe('Manual 2');
    expect(s().save(INSIDE)!.name).toBe('Manual 2');
    expect(s().save(INSIDE, '  Top shelf ')!.name).toBe('Top shelf');
  });
});

describe('save, update, rename, duplicate, delete', () => {
  it('gives every layout its own id, never a calculated layout id', () => {
    const real = createManualLayoutsStore(manualRepo(new FakeStorage()));
    real.getState().setInputs(I);
    const a = real.getState().save(INSIDE);
    const b = real.getState().duplicate(a!.id)!;
    expect(a!.id).not.toBe(b.id);
    for (const e of real.getState().entries) {
      expect(e.build.layout.id).toBe(MANUAL_ID_PREFIX + e.spec.id);
      expect(e.ranked.layout.id.startsWith('manual:')).toBe(true);
    }
  });

  it('update saves over, keeping the id and (unless one is given) the name', () => {
    const { s } = setup();
    const a = s().save(INSIDE, 'Mine');
    const next = s().update(a!.id, DRAFT);
    expect(next).toEqual({ id: a!.id, name: 'Mine', ...DRAFT });
    expect(s().specs).toEqual([next]);
    expect(s().update(a!.id, DRAFT, 'Other')!.name).toBe('Other');
    expect(s().update('nope', DRAFT)).toBeNull();
    expect(s().specs).toHaveLength(1);
  });

  it('renames (ignoring a blank name), duplicates and deletes', () => {
    const { s, changes } = setup();
    const a = s().save(INSIDE);
    s().rename(a!.id, '  Dock 4 ');
    s().rename(a!.id, '   ');
    expect(s().specs[0]!.name).toBe('Dock 4');
    const copy = s().duplicate(a!.id)!;
    expect(copy).toEqual({ ...s().specs[0]!, id: copy.id, name: 'Dock 4 (copy)' });
    expect(copy.id).not.toBe(a!.id);
    expect(s().duplicate('nope')).toBeNull();
    s().remove(a!.id);
    expect(s().specs).toEqual([copy]);
    expect(changes.at(-1)).toEqual([copy.id]);
  });

  it('keeps no reference to what it was given', () => {
    const { s } = setup();
    const cartons = [{ x: 0, y: 0, rotated: false }];
    const a = s().save({ ...INSIDE, cartons });
    cartons[0]!.x = 99;
    expect(s().specs[0]!.cartons[0]!.x).toBe(0);
    expect(a!.cartons).not.toBe(cartons);
  });

  it("adding a scenario's layouts never removes or changes one that is present (review I5)", () => {
    const { s, storage } = setup();
    const a = s().save(INSIDE, 'A')!;
    const b = s().save(INSIDE, 'B')!;
    const changed = { ...b, name: 'B', upperLayers: 'alternate' as const };
    const fresh = { ...manualSpec({ id: 'new', name: 'New' }), frame: 'pallet' as const };

    expect(s().addFromScenario([a, changed, fresh], 0)).toEqual({
      added: 2,
      skipped: 1,
      notStored: 0,
    });
    // A is as it was (same id, same content: skipped); B is kept and the scenario's different
    // B arrives as a copy; the new one is added.
    expect(s().specs.map((x) => x.name)).toEqual(['A', 'B', 'B (from scenario)', 'New']);
    expect(s().specs.slice(0, 2)).toEqual([a, b]);
    const copy = s().specs[2]!;
    expect(copy.id).not.toBe(b.id);
    expect(copy).toEqual({ ...changed, id: copy.id, name: 'B (from scenario)' });
    expect(stored(storage)!.items).toHaveLength(4);

    // Loading the same scenario again adds nothing more.
    expect(s().addFromScenario([a, changed, fresh], 0)).toEqual({
      added: 0,
      skipped: 3,
      notStored: 0,
    });
    expect(s().specs).toHaveLength(4);
    // A scenario with no layouts takes nothing away.
    expect(s().addFromScenario([], 0).added).toBe(0);
    expect(s().specs).toHaveLength(4);
  });

  it('a scenario layout stored before the pallet frame is moved to it by the scenario overhang', () => {
    const { s } = setup();
    const legacy = manualSpec({
      id: 'old',
      name: 'Old',
      cartons: [{ x: 3, y: 5, rotated: false }],
    });
    expect(legacy).not.toHaveProperty('frame');
    s().addFromScenario([legacy], 4);
    expect(s().specs).toEqual([
      { ...legacy, frame: 'pallet', cartons: [{ x: 1, y: 3, rotated: false }] },
    ]);
  });

  it('reports scenario layouts that could not be written', () => {
    const storage = new FakeStorage();
    const { s } = setup(storage);
    storage.failWrites = true;
    expect(s().addFromScenario([manualSpec({ id: 'x' })], 0)).toEqual({
      added: 0,
      skipped: 0,
      notStored: 1,
    });
    expect(s().specs).toEqual([]);
  });

  it('everything stored passes the schema', () => {
    const { s, storage } = setup();
    s().save(DRAFT);
    s().duplicate(s().specs[0]!.id);
    for (const item of stored(storage)!.items) {
      expect(manualLayoutSpecSchema.parse(item)).toEqual(item);
    }
  });
});

describe('builds under the current inputs', () => {
  it('has no entries until valid inputs are given, then one per layout in order', () => {
    const { s } = setup();
    s().save(DRAFT);
    s().save(INSIDE);
    expect(s().entries).toEqual([]);
    expect(s().inputs).toBeNull();
    s().setInputs(I);
    expect(s().entries.map((e) => e.spec.name)).toEqual(['Manual 1', 'Manual 2']);
    const [over, inside] = s().entries;
    expect(over!.build.status).toBe('current');
    expect(over!.build.flags).toContainEqual({ kind: 'overhang', cartons: 2, by: 5 });
    expect(over!.ranked.manual).toEqual({
      id: 'id1',
      name: 'Manual 1',
      flags: over!.build.flags,
      status: 'current',
      upperLayers: 'alternate',
      madeFor: DRAFT.madeFor,
    });
    expect(over!.ranked.layout).toBe(over!.build.layout);
    expect(over!.ranked).toMatchObject({ rank: 0, explanation: '', score: { total: 0 } });
    expect(inside!.build.flags).toEqual([]);
    expect(inside!.build.layout.stability).toBeDefined();
  });

  it('re-checks every layout when the pallet, height or weight inputs change', () => {
    const { s } = setup();
    s().setInputs(I);
    s().save(INSIDE);
    const before = s().entries[0]!;
    const layers = before.build.layout.layers.length;
    expect(layers).toBe(Math.floor((I.pallet.height - 5) / 5));

    s().setInputs({ ...I, pallet: { ...I.pallet, height: 25 } });
    const lower = s().entries[0]!;
    expect(lower.build.layout.layers).toHaveLength(4);
    expect(lower.build.status).toBe('current');
    expect(lower.build.inputs.pallet.height).toBe(25);

    // 2 cartons of 9 lb on a 40 lb pallet: 58 lb for one layer.
    s().setInputs({ ...I, weights: { ...I.weights, maxPallet: 50 } });
    expect(s().entries[0]!.build.flags).toContainEqual({ kind: 'overWeight', by: 8 });
    expect(s().entries[0]!.build.layout.layers).toHaveLength(1);

    s().setInputs({ ...I, maxCarton: { length: 20, width: 18, height: 16 } });
    expect(s().entries[0]!.build.flags.map((f) => f.kind)).toEqual(['overMaximum']);

    s().setInputs({ ...I, pallet: { ...I.pallet, length: 30 } });
    expect(s().entries[0]!.build.flags).toContainEqual(
      expect.objectContaining({ kind: 'overhang', cartons: 1 }),
    );
  });

  it('marks a layout out of date when the product, wall or leeway change its carton', () => {
    const { s } = setup();
    s().setInputs(I);
    s().save(INSIDE);
    for (const changed of [
      { ...I, product: { ...I.product, length: 13 } },
      { ...I, wallThickness: 0.5 },
      { ...I, leeway: 1 },
    ]) {
      s().setInputs(changed);
      const e = s().entries[0]!;
      expect(e.build.status).toBe('outOfDate');
      expect(e.ranked.manual.status).toBe('outOfDate');
      // Shown as it was made: the carton it was made for, with the current pallet and limits.
      expect(e.build.layout.carton.outer).toEqual(INSIDE.madeFor.outer);
      expect(e.build.inputs.product).toEqual(I.product);
    }
    s().setInputs({ ...I });
    expect(s().entries[0]!.build.status).toBe('current');
    expect(s().specs).toHaveLength(1);
  });

  it('keeps the last builds and says they are stale while the inputs are invalid', () => {
    const { s } = setup();
    s().setInputs(I);
    s().save(INSIDE);
    const before = s().entries;
    s().setInputs(null);
    expect(s().stale).toBe(true);
    expect(s().entries).toBe(before);
    expect(s().inputs).toBe(I);
    // A layout saved meanwhile is built with the last valid inputs.
    s().save(DRAFT);
    expect(s().entries).toHaveLength(2);
    expect(s().stale).toBe(true);
    s().setInputs(I);
    expect(s().stale).toBe(false);
    s().setInputs(null);
    s().setInputs({ ...I, overhang: 0 });
    expect(s().stale).toBe(false);
    expect(s().entries[0]!.build.inputs.overhang).toBe(0);
  });

  it('keeps the same entry objects for layouts and inputs that did not change', () => {
    const { s } = setup();
    s().setInputs(I);
    const a = s().save(INSIDE);
    const first = s().entries[0]!;
    s().save(DRAFT);
    expect(s().entries[0]).toBe(first);
    s().setInputs(I);
    expect(s().entries[0]).toBe(first);
    s().rename(a!.id, 'Renamed');
    expect(s().entries[0]).not.toBe(first);
    expect(s().entries[0]!.ranked.manual.name).toBe('Renamed');
  });
});

describe('joined to the inputs store', () => {
  it('rebuilds as soon as the valid inputs change and goes stale while they are invalid', () => {
    const t = manualStores();
    const m = () => t.manualLayouts.getState();
    expect(m().inputs).toEqual(t.current());
    m().save({ ...INSIDE, madeFor: madeForOf(TEST_DESIGN, t.current()) });
    const layers = m().entries[0]!.build.layout.layers.length;

    t.inputs.getState().setField('pallet.height', '30');
    expect(m().entries[0]!.build.layout.layers.length).toBeLessThan(layers);
    expect(m().stale).toBe(false);

    const kept = m().entries;
    t.inputs.getState().setField('pallet.height', '');
    expect(m().stale).toBe(true);
    expect(m().entries).toBe(kept);

    t.inputs.getState().setField('pallet.height', '72');
    expect(m().stale).toBe(false);
    expect(m().entries[0]!.build.layout.layers).toHaveLength(layers);

    t.inputs.getState().setField('product.length', '11');
    expect(m().entries[0]!.build.status).toBe('outOfDate');
    // A unit switch changes nothing but the display.
    t.inputs.getState().setField('product.length', '12');
    const inches = m().entries;
    t.inputs.getState().setUnit('cm');
    expect(m().entries).toBe(inches);
  });
});
