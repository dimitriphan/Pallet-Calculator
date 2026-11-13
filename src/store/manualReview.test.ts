/**
 * The fixes from the review of the stores and the editor session: a result that is behind the
 * inputs is never opened from (I1), positions are kept relative to the pallet (I2), a failed
 * write is never a save (I6), and the smaller rules that go with them.
 */
import { describe, expect, it } from 'vitest';
import { manualLayoutSpecSchema } from '../domain/manualSchemas';
import type { Inputs } from '../domain/types';
import {
  buildManualLayout,
  madeForOf,
  toPalletFrame,
  usableToPallet,
  type ManualLayoutSpec,
} from '../engine/manual/build';
import { manualSpec, OVERHANG_INPUTS, TEST_DESIGN } from '../engine/manual/testSupport';
import { cartonPlacements } from '../engine/packing/positions';
import { STORAGE_KEYS } from '../persistence/keys';
import { NOT_SAVED } from '../persistence/localStorageRepository';
import { FakeStorage } from '../persistence/testStorage';
import type { EditorSession } from './manualEditorStore';
import { createManualLayoutsStore } from './manualLayoutsStore';
import { SELECTED_DELETED_ELSEWHERE } from './manualStores';
import { manualRepo, manualStores } from './manualTestSupport';

async function setup(storage: FakeStorage = new FakeStorage()) {
  const t = manualStores(storage);
  await t.calculate();
  const e = () => t.manualEditor.getState();
  const s = (): EditorSession => {
    const session = e().session;
    if (!session) throw new Error('No session');
    return session;
  };
  return { ...t, e, s, m: () => t.manualLayouts.getState() };
}

/** Where every carton of the bottom layer stands, measured from the pallet's own corner. */
function onPallet(build: { layout: Parameters<typeof cartonPlacements>[0]; inputs: Inputs }) {
  const half = build.inputs.overhang / 2;
  return cartonPlacements(build.layout, build.inputs)
    .filter((c) => c.layerIndex === 0)
    .map((c) => ({ x: c.x - half, y: c.y - half, dx: c.dx, dy: c.dy }));
}

describe('a result that is behind the inputs (review I1)', () => {
  it('is never opened from: by hand, own carton or rebuild', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    const saved = t.e().save();
    if (!saved.ok) throw new Error('not saved');

    // The reviewer's case: the product height typed, the new calculation not yet back.
    t.change({ product: { length: 12, width: 8, height: 5 } });
    const behind = { ok: false, reason: 'resultBehind' };
    expect(t.e().openFromCalculated(0)).toEqual(behind);
    expect(t.e().openOwn()).toEqual(behind);
    expect(t.e().rebuild(saved.id)).toEqual(behind);
    expect(t.e().session).toBeNull();

    await t.calculate();
    expect(t.e().openFromCalculated(0)).toEqual({ ok: true });
    expect(t.s().build.flags.some((f) => f.kind === 'overlap')).toBe(false);
    t.e().cancel();
    expect(t.e().rebuild(saved.id)).toEqual({ ok: true });
    t.e().cancel();
    expect(t.e().openOwn()).toEqual({ ok: true });
  });

  it('a change that does not change the calculation is not behind', async () => {
    const t = await setup();
    // The same numbers again: a new inputs object, the same calculation.
    t.change({});
    expect(t.e().openFromCalculated(0)).toEqual({ ok: true });
  });
});

describe('positions are kept relative to the pallet (review I2)', () => {
  it('a copy made at overhang 0 stays where it is on the pallet at overhang 4', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    const saved = t.e().save();
    if (!saved.ok) throw new Error('not saved');
    const entry = () => t.m().entries.find((x) => x.spec.id === saved.id)!;
    expect(entry().spec.frame).toBe('pallet');
    const before = onPallet(entry().build);
    const stored = structuredClone(entry().spec.cartons);

    t.change({ overhang: 4 });
    expect(entry().build.inputs.overhang).toBe(4);
    expect(onPallet(entry().build)).toEqual(before);
    expect(entry().spec.cartons).toEqual(stored);
    expect(entry().build.flags).toEqual([]);

    // A bigger pallet: still the same distances from the pallet's corner.
    t.change({ pallet: { length: 60, width: 48, height: 72 } });
    expect(onPallet(entry().build)).toEqual(before);
  });

  it('cartons that used the overhang are flagged when it is taken away, and do not move', async () => {
    const t = await setup();
    t.change({ overhang: 4 });
    const spec = t.m().save({
      design: TEST_DESIGN,
      // 2 in past the pallet's left edge, which 4 in of overhang allows.
      cartons: [{ x: -2, y: 0, rotated: false }],
      frame: 'pallet',
      upperLayers: 'same',
      madeFor: madeForOf(TEST_DESIGN, t.current()),
    })!;
    const entry = () => t.m().entries.find((x) => x.spec.id === spec.id)!;
    const overhang = () => entry().build.flags.filter((f) => f.kind === 'overhang');
    expect(overhang()).toEqual([]);
    const before = onPallet(entry().build);

    t.change({ overhang: 0 });
    expect(onPallet(entry().build)).toEqual(before);
    expect(overhang()).toEqual([{ kind: 'overhang', cartons: 1, by: 2 }]);
    t.change({ overhang: 1 });
    expect(overhang()).toEqual([{ kind: 'overhang', cartons: 1, by: 1.5 }]);
  });

  it('an open session keeps every carton on the pallet when the overhang changes mid-edit', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    const half = (s: EditorSession) => s.inputs.overhang / 2;
    const rel = (s: EditorSession) =>
      s.cartons.map((c) => ({ x: c.x - half(s), y: c.y - half(s) }));
    const before = rel(t.s());
    const products = t.s().build.layout.totalProducts;

    t.change({ overhang: 4 });
    expect(t.s().inputs.overhang).toBe(4);
    // In the footprint's frame they are 2 in further from its corner; on the pallet, unmoved.
    expect(t.s().cartons[0]!.x).toBe(before[0]!.x + 2);
    expect(rel(t.s())).toEqual(before);
    expect(t.s().pallet).toMatchObject({ x: 2, y: 2 });
    expect(t.s().build.flags).toEqual([]);
    expect(t.s().build.layout.totalProducts).toBe(products);
    // Nothing the user did: not dirty, nothing to undo.
    expect(t.s()).toMatchObject({ dirty: false, canUndo: false, layerChanged: false });

    // An edit under the new overhang, then back: the others never moved.
    expect(t.e().move(0, { x: 0, y: t.s().cartons[0]!.y }, { snap: false }).ok).toBe(true);
    t.change({ overhang: 0 });
    expect(rel(t.s()).slice(1)).toEqual(before.slice(1));
    expect(rel(t.s())[0]).toEqual({ x: -2, y: before[0]!.y });
    expect(t.s().build.flags).toContainEqual({ kind: 'overhang', cartons: 1, by: 2 });

    const saved = t.e().save();
    if (!saved.ok) throw new Error('not saved');
    const spec = t.m().specs.find((x) => x.id === saved.id)!;
    expect(spec.frame).toBe('pallet');
    expect(spec.cartons.slice(1).map(({ x, y }) => ({ x, y }))).toEqual(before.slice(1));
    expect(spec.cartons[0]).toMatchObject({ x: -2, y: before[0]!.y });
  });

  it('what a saved session holds reopens exactly, under any overhang', async () => {
    const t = await setup();
    t.change({ overhang: 3 });
    await t.calculate();
    t.e().openFromCalculated(0);
    t.e().save();
    const spec = t.m().specs[0]!;
    t.change({ overhang: 1 });
    expect(t.e().openSaved(spec.id)).toEqual({ ok: true });
    expect(t.s().dirty).toBe(false);
    expect(t.e().save().ok).toBe(true);
    expect(t.m().specs[0]!.cartons).toEqual(spec.cartons);
  });
});

describe('layouts stored before the pallet frame are migrated on load', () => {
  const legacy = (): ManualLayoutSpec => manualSpec({ id: 'old', name: 'Old' });

  it('the schema reads both forms and nothing else', () => {
    expect(manualLayoutSpecSchema.safeParse(legacy()).success).toBe(true);
    expect(manualLayoutSpecSchema.safeParse({ ...legacy(), frame: 'pallet' }).success).toBe(true);
    expect(manualLayoutSpecSchema.safeParse({ ...legacy(), frame: 'usable' }).success).toBe(false);
  });

  it('moves a stored usable-frame layout to the pallet frame under the inputs at load', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEYS.manualLayouts, JSON.stringify({ version: 1, items: [legacy()] }));
    const store = createManualLayoutsStore(manualRepo(storage));
    // Not before there are valid inputs to say where the pallet was.
    expect(store.getState().specs).toEqual([legacy()]);
    const asMade = buildManualLayout(legacy(), OVERHANG_INPUTS);

    store.getState().setInputs(OVERHANG_INPUTS);
    const spec = store.getState().specs[0]!;
    expect(spec).toEqual({
      ...legacy(),
      frame: 'pallet',
      cartons: usableToPallet(legacy().cartons, OVERHANG_INPUTS.overhang),
    });
    expect(spec.cartons[0]).toEqual({ x: -4, y: -3, rotated: false });
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.manualLayouts)!).items).toEqual([spec]);
    // It stands exactly where it stood, with the same flags.
    const entry = store.getState().entries[0]!;
    expect(onPallet(entry.build)).toEqual(onPallet(asMade));
    expect(entry.build.flags).toEqual(asMade.flags);

    // And from now on it stays there.
    store.getState().setInputs({ ...OVERHANG_INPUTS, overhang: 6 });
    expect(onPallet(store.getState().entries[0]!.build)).toEqual(onPallet(asMade));
    expect(store.getState().specs[0]).toEqual(spec);
  });

  it('toPalletFrame leaves a pallet-frame spec alone', () => {
    const spec = toPalletFrame(legacy(), 2);
    expect(toPalletFrame(spec, 10)).toBe(spec);
  });

  it('a migration that cannot be written is said once and kept in memory (final review F17)', () => {
    const storage = new FakeStorage();
    const raw = JSON.stringify({ version: 1, items: [legacy()] });
    storage.setItem(STORAGE_KEYS.manualLayouts, raw);
    const notices: string[] = [];
    const store = createManualLayoutsStore(manualRepo(storage, notices));
    const asMade = buildManualLayout(legacy(), OVERHANG_INPUTS);
    storage.failWrites = true;
    store.getState().setInputs(OVERHANG_INPUTS);
    const migrated = {
      ...legacy(),
      frame: 'pallet',
      cartons: usableToPallet(legacy().cartons, OVERHANG_INPUTS.overhang),
    };
    expect(store.getState().specs).toEqual([migrated]);
    expect(store.getState().entries).toHaveLength(1);
    expect(notices).toEqual([NOT_SAVED]);
    expect(storage.getItem(STORAGE_KEYS.manualLayouts)).toBe(raw);

    // Every later change of the inputs: no new attempt, no new notice, and the layout stays
    // where it was put on the pallet instead of being built in the wrong frame.
    for (const overhang of [6, 0, 3]) {
      store.getState().setInputs({ ...OVERHANG_INPUTS, overhang });
      expect(store.getState().specs).toEqual([migrated]);
      expect(onPallet(store.getState().entries[0]!.build)).toEqual(onPallet(asMade));
    }
    store.getState().refresh();
    expect(store.getState().specs).toEqual([migrated]);
    expect(notices).toEqual([NOT_SAVED]);

    // A change the user makes later writes the migrated layout.
    storage.failWrites = false;
    expect(store.getState().rename('old', 'Old one')).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.manualLayouts)!).items).toEqual([
      { ...migrated, name: 'Old one' },
    ]);
  });
});

describe('two tabs: the saved layout being edited changed in storage (final review F9)', () => {
  /** A second tab on the same storage, with its own stores. */
  const otherTab = (storage: FakeStorage) => {
    const other = manualStores(storage);
    return other.manualLayouts.getState;
  };
  const start = async () => {
    const storage = new FakeStorage();
    const t = await setup(storage);
    t.e().openFromCalculated(0);
    const id = (t.e().save({ name: 'Dock' }) as { id: string }).id;
    expect(t.e().openSaved(id)).toEqual({ ok: true });
    t.e().remove(0);
    return { t, id, there: otherTab(storage) };
  };

  it('Save does not silently overwrite a layout another tab changed', async () => {
    const { t, id, there } = await start();
    there().rename(id, 'Renamed elsewhere');
    const before = there().specs[0]!;
    expect(t.e().save()).toEqual({ ok: false, reason: 'changedElsewhere', change: 'changed' });
    expect(t.e().session).not.toBeNull();
    expect(there().specs).toEqual([before]);
    there().refresh();
    expect(there().specs).toEqual([before]);

    // Overwrite, once asked for, saves over it under the session's name.
    const cartons = t.s().layer.length;
    expect(t.e().save({ overwrite: true })).toEqual({ ok: true, id });
    expect(t.m().specs).toHaveLength(1);
    expect(t.m().specs[0]).toMatchObject({ id, name: 'Dock' });
    expect(t.m().specs[0]!.cartons).toHaveLength(cartons);
  });

  it('Save as new leaves the changed layout alone', async () => {
    const { t, id, there } = await start();
    there().rename(id, 'Renamed elsewhere');
    expect(t.e().save().ok).toBe(false);
    const saved = t.e().saveAsNew();
    expect(saved.ok).toBe(true);
    expect(t.m().specs.map((x) => x.name)).toEqual(['Renamed elsewhere', 'Manual 1']);
    expect(t.m().specs[0]!.cartons).toHaveLength(t.m().specs[1]!.cartons.length + 1);
  });

  it('Save does not silently re-create a layout another tab deleted', async () => {
    const { t, id, there } = await start();
    there().remove(id);
    expect(t.e().save()).toEqual({ ok: false, reason: 'changedElsewhere', change: 'deleted' });
    expect(t.e().session).not.toBeNull();
    expect(t.m().specs).toEqual([]);
    const again = t.e().save({ overwrite: true });
    expect(again.ok).toBe(true);
    expect(t.m().specs.map((x) => x.name)).toEqual(['Dock']);
  });

  it('a layout nobody else touched saves as ever, and so does a rebuild', async () => {
    const { t, id } = await start();
    expect(t.e().save()).toEqual({ ok: true, id });
    // Rebuild of an out-of-date layout that another tab then renames.
    const storage = new FakeStorage();
    const u = await setup(storage);
    u.e().openFromCalculated(0);
    const old = (u.e().save({ name: 'Old' }) as { id: string }).id;
    expect(u.e().rebuild(old)).toEqual({ ok: true });
    otherTab(storage)().rename(old, 'Theirs');
    expect(u.e().save()).toMatchObject({ ok: false, reason: 'changedElsewhere' });
  });
});

describe('a failed write is never a save (review I6)', () => {
  it('the editor stays open, says why and saves once storage works', async () => {
    const storage = new FakeStorage();
    const t = await setup(storage);
    t.e().openFromCalculated(0);
    t.e().remove(0);
    storage.failWrites = true;

    expect(t.e().save()).toEqual({ ok: false, reason: 'notStored' });
    expect(t.e().saveAsNew()).toEqual({ ok: false, reason: 'notStored' });
    expect(t.e().session).not.toBeNull();
    expect(t.s()).toMatchObject({ dirty: true, canUndo: true });
    expect(t.m().specs).toEqual([]);
    expect(t.results.getState().selectedManualId).toBeNull();
    expect(t.notices).toEqual([NOT_SAVED, NOT_SAVED]);

    storage.failWrites = false;
    const saved = t.e().save();
    expect(saved.ok).toBe(true);
    expect(t.m().specs).toHaveLength(1);
    expect(t.e().session).toBeNull();
  });

  it('saving over a saved layout that cannot be written leaves it as stored', async () => {
    const storage = new FakeStorage();
    const t = await setup(storage);
    t.e().openFromCalculated(0);
    const first = t.e().save();
    if (!first.ok) throw new Error('not saved');
    const before = t.m().specs[0]!;
    t.e().openSaved(first.id);
    t.e().remove(0);
    storage.failWrites = true;
    expect(t.e().save({ name: 'New name' })).toEqual({ ok: false, reason: 'notStored' });
    expect(t.m().specs).toEqual([before]);
    expect(t.e().session).not.toBeNull();
  });
});

describe('the session, smaller rules', () => {
  it('a change of name alone is a change (Cancel asks)', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    expect(t.s().dirty).toBe(false);
    t.e().setName('Dock 4');
    expect(t.s().dirty).toBe(true);
    expect(t.s().canUndo).toBe(false);
    t.e().setName('Manual 1');
    expect(t.s().dirty).toBe(false);
  });

  it('a turn never makes an overhang: refused with its own reason', async () => {
    const t = await setup();
    // A turned 25 x 17 carton in the front-right corner of the 50 x 42 pallet, another beside it.
    const spec = t.m().save({
      design: TEST_DESIGN,
      cartons: [
        { x: 33, y: 17, rotated: true },
        { x: 8, y: 17, rotated: false },
      ],
      frame: 'pallet',
      upperLayers: 'same',
      madeFor: madeForOf(TEST_DESIGN, t.current()),
    })!;
    t.e().openSaved(spec.id);
    // Turned back it is 25 wide: from x = 33 that passes the right edge, and to its left
    // the other carton is in the way.
    expect(t.e().turn(0)).toEqual({ ok: false, reason: 'turnNoRoom' });
    expect(t.s().canUndo).toBe(false);
    // Already overhanging, it may turn as before.
    t.e().move(0, { x: 40, y: 0 }, { snap: false });
    expect(t.s().build.flags.some((f) => f.kind === 'overhang')).toBe(true);
    expect(t.e().turn(0)).toEqual({ ok: true });
  });

  it('undo after a redo steps back again, and a new change ends redo', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    const start = t.s().cartons;
    t.e().remove(0);
    const removed = t.s().cartons;
    t.e().undo();
    expect(t.s().cartons).toEqual(start);
    t.e().redo();
    expect(t.s().cartons).toEqual(removed);
    expect(t.s()).toMatchObject({ canUndo: true, canRedo: false });
    // The redo is itself undone, back to the start, and can be redone again.
    expect(t.e().undo()).toEqual({ ok: true });
    expect(t.s().cartons).toEqual(start);
    expect(t.s()).toMatchObject({ canUndo: false, canRedo: true });
    expect(t.e().redo()).toEqual({ ok: true });
    expect(t.s().cartons).toEqual(removed);
    t.e().undo();
    t.e().remove(1);
    expect(t.s().canRedo).toBe(false);
    expect(t.e().redo()).toEqual({ ok: false, reason: 'nothingToRedo' });
  });

  it('goes back to the carton step, saying why, when the inputs block the carton mid-edit', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    expect(t.s()).toMatchObject({ step: 'layer', stepNotice: null });
    // A stacking height below the carton's own height: it can no longer go on the pallet.
    t.change({ pallet: { length: 50, width: 42, height: 7 } });
    expect(t.s()).toMatchObject({ step: 'carton', stepNotice: 'cartonBlocked' });
    expect(t.s().cartonFlags.blocked).toBe('height');
    // The next thing the user does clears it.
    t.e().goToStep('carton');
    expect(t.s().stepNotice).toBeNull();
  });

  it('says so when the inputs change the carton the layer was laid out for', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    t.change({ wallThickness: 0.5 });
    expect(t.s()).toMatchObject({
      step: 'carton',
      stepNotice: 'cartonChanged',
      layerPending: true,
    });
    t.e().setCount('length', t.s().design.counts.length);
    t.e().setUpperLayers(t.s().upperLayers === 'same' ? 'alternate' : 'same');
    expect(t.s().stepNotice).toBeNull();
  });

  it('says when the inputs on screen are invalid and it is on the last valid ones', async () => {
    const t = await setup();
    t.e().openFromCalculated(0);
    expect(t.s().usingLastValid).toBe(false);
    t.inputs.getState().setField('pallet.length', '');
    expect(t.s().usingLastValid).toBe(true);
    t.inputs.getState().setField('pallet.length', '50');
    expect(t.s().usingLastValid).toBe(false);
  });
});

describe('the selected manual layout deleted in another tab', () => {
  it('falls back to the calculated layout and says so; a deletion here says nothing', async () => {
    const storage = new FakeStorage();
    const t = await setup(storage);
    t.e().openFromCalculated(0);
    const saved = t.e().save();
    if (!saved.ok) throw new Error('not saved');
    expect(t.results.getState().selectedManualId).toBe(saved.id);

    // Another tab over the same storage deletes it.
    manualRepo(storage).remove(saved.id);
    t.m().refresh();
    expect(t.results.getState().selectedManualId).toBeNull();
    expect(t.notices).toEqual([SELECTED_DELETED_ELSEWHERE]);

    t.e().openFromCalculated(0);
    const again = t.e().save();
    if (!again.ok) throw new Error('not saved');
    t.m().remove(again.id);
    expect(t.results.getState().selectedManualId).toBeNull();
    expect(t.notices).toEqual([SELECTED_DELETED_ELSEWHERE]);
  });
});
