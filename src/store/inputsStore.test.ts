import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs } from '../domain/schemas';
import type { Inputs } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { createInputsStore, useInputsStore } from './inputsStore';

describe('inputsStore', () => {
  it('starts from the defaults and parses them', () => {
    const s = createInputsStore(new FakeStorage()).getState();
    expect(s.draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
    expect(s.parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });

  it('reports an error for a pallet height of 4 and keeps the typed text', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setField('pallet.height', '4');
    const s = store.getState();
    expect(s.draft.pallet.height).toBe('4');
    expect(s.parsed.ok).toBe(false);
    if (!s.parsed.ok) expect(s.parsed.errors['pallet.height']).toBeTruthy();
  });

  it('sets top-level and nested fields and ignores unknown paths', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setField('leeway', '1');
    store.getState().setField('targetQuantity', '10');
    store.getState().setField('maxCarton.width', '20');
    const before = store.getState().draft;
    store.getState().setField('bogus.path', '9');
    store.getState().setField('rotationMode', 'x');
    expect(store.getState().draft).toEqual(before);
    expect(before.leeway).toBe('1');
    expect(before.targetQuantity).toBe('10');
    expect(before.maxCarton.width).toBe('20');
  });

  it('sets rotation mode, toggles orientations and the upright flag', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setRotationMode('custom');
    store.getState().toggleOrientation('LWH');
    store.getState().toggleOrientation('HWL');
    store.getState().toggleOrientation('LWH');
    store.getState().setKeepCartonsUpright(true);
    const d = store.getState().draft;
    expect(d.rotationMode).toBe('custom');
    expect(d.customOrientations).toEqual(['HWL']);
    expect(d.keepCartonsUpright).toBe(true);
  });

  it('replaceInputs round-trips through draftFromInputs and reset restores defaults', () => {
    const store = createInputsStore(new FakeStorage());
    const next: Inputs = { ...DEFAULT_INPUTS, targetQuantity: 99, leeway: 2 };
    store.getState().replaceInputs(next);
    expect(store.getState().draft).toEqual(draftFromInputs(next));
    expect(store.getState().parsed).toEqual({ ok: true, inputs: next });
    store.getState().reset();
    expect(store.getState().draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
  });

  it('persists the draft and restores it in a new instance', () => {
    const storage = new FakeStorage();
    createInputsStore(storage).getState().setField('pallet.length', '60');
    expect(storage.getItem(STORAGE_KEYS.inputs)).toContain('60');
    expect(createInputsStore(storage).getState().draft.pallet.length).toBe('60');
  });

  it('sets the desired boxes per carton', () => {
    const store = createInputsStore(new FakeStorage());
    expect(store.getState().draft.boxesPerCarton).toBe('');
    store.getState().setField('boxesPerCarton', '6');
    expect(store.getState().draft.boxesPerCarton).toBe('6');
    expect(store.getState().parsed).toEqual({
      ok: true,
      inputs: { ...DEFAULT_INPUTS, boxesPerCarton: 6 },
    });
    store.getState().setField('boxesPerCarton.x', '7');
    expect(store.getState().draft.boxesPerCarton).toBe('6');
  });

  it('restores a remembered Round 1 draft without boxesPerCarton and reads it as blank', () => {
    const storage = new FakeStorage();
    const round1 = draftFromInputs({ ...DEFAULT_INPUTS, leeway: 2 }) as unknown as Record<
      string,
      unknown
    >;
    delete round1.boxesPerCarton;
    expect('boxesPerCarton' in round1).toBe(false);
    storage.setItem(STORAGE_KEYS.inputs, JSON.stringify(round1));
    const s = createInputsStore(storage).getState();
    expect(s.draft.leeway).toBe('2');
    expect(s.draft.boxesPerCarton).toBe('');
    expect(s.draft).toEqual(draftFromInputs({ ...DEFAULT_INPUTS, leeway: 2 }));
    expect(s.parsed).toEqual({ ok: true, inputs: { ...DEFAULT_INPUTS, leeway: 2 } });
  });

  it('falls back to defaults for malformed or wrongly shaped stored drafts', () => {
    for (const bad of [
      'not json',
      '{"pallet":1}',
      JSON.stringify({ ...draftFromInputs(DEFAULT_INPUTS), leeway: 5 }),
      JSON.stringify({ ...draftFromInputs(DEFAULT_INPUTS), boxesPerCarton: 5 }),
    ]) {
      const storage = new FakeStorage();
      storage.setItem(STORAGE_KEYS.inputs, bad);
      expect(createInputsStore(storage).getState().draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
    }
  });

  it('swallows storage failures', () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    storage.failWrites = true;
    const store = createInputsStore(storage);
    expect(() => store.getState().setField('leeway', '3')).not.toThrow();
    expect(store.getState().draft.leeway).toBe('3');
  });

  it('exports a default hook that exists', () => {
    expect(useInputsStore.getState().draft).toBeDefined();
  });

  it('applyPreset writes only the preset-covered fields and keeps the product text', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setField('product.length', 'abc');
    const fields: Omit<Inputs, 'product'> = {
      pallet: { length: 48, width: 40, height: 60 },
      maxCarton: DEFAULT_INPUTS.maxCarton,
      targetQuantity: 100,
      boxesPerCarton: 4,
      leeway: 1,
      wallThickness: DEFAULT_INPUTS.wallThickness,
      overhang: DEFAULT_INPUTS.overhang,
      rotationMode: DEFAULT_INPUTS.rotationMode,
      customOrientations: DEFAULT_INPUTS.customOrientations,
      keepCartonsUpright: DEFAULT_INPUTS.keepCartonsUpright,
    };
    store.getState().applyPreset(fields);
    const s = store.getState();
    expect(s.draft.product).toEqual({ length: 'abc', width: '8', height: '4' });
    expect(s.draft.pallet).toEqual({ length: '48', width: '40', height: '60' });
    expect(s.draft.leeway).toBe('1');
    expect(s.draft.targetQuantity).toBe('100');
    expect(s.draft.boxesPerCarton).toBe('4');
    expect(s.parsed.ok).toBe(false);
    store.getState().setField('product.length', '12');
    expect(store.getState().parsed).toEqual({
      ok: true,
      inputs: { ...DEFAULT_INPUTS, ...fields },
    });
  });
});

describe('inputsStore units', () => {
  const fresh = () => createInputsStore(new FakeStorage());

  it('starts in inches', () => {
    expect(fresh().getState().unit).toBe('in');
  });

  it('shows a typed length in another unit without changing what it parses to', () => {
    const store = fresh();
    store.getState().setField('product.length', '12');
    const before = store.getState().parsed;
    store.getState().setUnit('cm');
    const s = store.getState();
    expect(s.unit).toBe('cm');
    expect(s.draft.product.length).toBe('30.5');
    expect(s.parsed.ok && s.parsed.inputs.product.length).toBe(12);
    expect(s.parsed).toEqual(before);
    store.getState().setUnit('in');
    expect(store.getState().draft.product.length).toBe('12');
    expect(store.getState().parsed).toEqual(before);
  });

  it('restores the exact typed text when switching back', () => {
    const store = fresh();
    store.getState().setField('leeway', '0.50');
    store.getState().setUnit('mm');
    expect(store.getState().draft.leeway).toBe('13');
    store.getState().setUnit('cm');
    expect(store.getState().draft.leeway).toBe('1.3');
    store.getState().setUnit('in');
    expect(store.getState().draft.leeway).toBe('0.50');
  });

  it('parses text typed in centimetres to inches and keeps it across switches', () => {
    const store = fresh();
    store.getState().setUnit('cm');
    store.getState().setField('product.length', '30.5');
    const parsed = store.getState().parsed;
    expect(parsed.ok && parsed.inputs.product.length).toBeCloseTo(12.00787, 5);
    store.getState().setUnit('in');
    expect(store.getState().draft.product.length).toBe('12.01');
    expect(store.getState().parsed).toEqual(parsed);
    store.getState().setUnit('cm');
    expect(store.getState().draft.product.length).toBe('30.5');
    expect(store.getState().parsed).toEqual(parsed);
  });

  it('keeps the parsed result object when only the unit changes', () => {
    const store = fresh();
    const before = store.getState().parsed;
    store.getState().setUnit('mm');
    expect(store.getState().parsed).toBe(before);
  });

  it('leaves text that does not parse as typed', () => {
    const store = fresh();
    store.getState().setField('pallet.width', 'abc');
    store.getState().setUnit('cm');
    expect(store.getState().draft.pallet.width).toBe('abc');
    store.getState().setUnit('mm');
    expect(store.getState().draft.pallet.width).toBe('abc');
    const p = store.getState().parsed;
    expect(!p.ok && p.errors['pallet.width']).toBe('Enter a number');
  });

  it('never converts counts', () => {
    const store = fresh();
    store.getState().setField('targetQuantity', '120');
    store.getState().setField('boxesPerCarton', '6');
    store.getState().setUnit('mm');
    expect(store.getState().draft.targetQuantity).toBe('120');
    expect(store.getState().draft.boxesPerCarton).toBe('6');
  });

  it('writes replaced inputs in the current unit and parses them back exactly', () => {
    const store = fresh();
    store.getState().setUnit('mm');
    const odd: Inputs = { ...DEFAULT_INPUTS, product: { length: 12.345, width: 8, height: 4 } };
    store.getState().replaceInputs(odd);
    expect(store.getState().draft.pallet).toEqual({
      length: '1270',
      width: '1067',
      height: '1829',
    });
    expect(store.getState().draft.leeway).toBe('13');
    expect(store.getState().parsed).toEqual({ ok: true, inputs: odd });
    store.getState().replaceInputs(DEFAULT_INPUTS);
    expect(store.getState().parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
    store.getState().setUnit('in');
    expect(store.getState().draft).toEqual(draftFromInputs(DEFAULT_INPUTS));
  });

  it('reset and applyPreset write in the current unit and keep exact values', () => {
    const store = fresh();
    store.getState().setUnit('cm');
    store.getState().setField('product.length', '30');
    const fields: Omit<Inputs, 'product'> = {
      ...DEFAULT_INPUTS,
      pallet: { length: 48, width: 40, height: 60.125 },
    };
    store.getState().applyPreset(fields);
    const s = store.getState();
    expect(s.draft.pallet).toEqual({ length: '121.9', width: '101.6', height: '152.7' });
    expect(s.draft.product.length).toBe('30');
    expect(s.parsed.ok && s.parsed.inputs.pallet).toEqual(fields.pallet);
    store.getState().reset();
    expect(store.getState().draft.pallet.length).toBe('127');
    expect(store.getState().parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });

  it('a field edited after a switch is read in the unit it was typed in', () => {
    const store = fresh();
    store.getState().setUnit('cm');
    store.getState().setField('pallet.length', '100');
    const p = store.getState().parsed;
    expect(p.ok && p.inputs.pallet.length).toBeCloseTo(100 / 2.54, 12);
  });

  it('remembers the unit and origins across reloads', () => {
    const storage = new FakeStorage();
    const a = createInputsStore(storage);
    a.getState().setField('product.length', '12.3456');
    a.getState().setUnit('cm');
    const parsed = a.getState().parsed;
    const b = createInputsStore(storage);
    expect(b.getState().unit).toBe('cm');
    expect(b.getState().draft.product.length).toBe('31.4');
    expect(b.getState().parsed).toEqual(parsed);
    b.getState().setUnit('in');
    expect(b.getState().draft.product.length).toBe('12.3456');
  });

  it('reads a draft remembered before units existed as inches, as before', () => {
    const storage = new FakeStorage();
    const old = {
      ...draftFromInputs(DEFAULT_INPUTS),
      leeway: '0.75',
      pallet: { length: '48.5', width: '40', height: '60' },
    };
    storage.setItem(STORAGE_KEYS.inputs, JSON.stringify(old));
    const s = createInputsStore(storage).getState();
    expect(s.unit).toBe('in');
    expect(s.draft).toEqual(old);
    expect(s.parsed).toEqual({
      ok: true,
      inputs: { ...DEFAULT_INPUTS, leeway: 0.75, pallet: { length: 48.5, width: 40, height: 60 } },
    });
  });

  it('starts an empty store in the unit it is given', () => {
    const s = createInputsStore(new FakeStorage(), { unit: 'mm' }).getState();
    expect(s.unit).toBe('mm');
    expect(s.draft.pallet.length).toBe('1270');
    expect(s.parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });

  it('a remembered unit wins over the unit it is given', () => {
    const storage = new FakeStorage();
    createInputsStore(storage).getState().setUnit('cm');
    expect(createInputsStore(storage, { unit: 'mm' }).getState().unit).toBe('cm');
  });

  it('ignores remembered origins that do not match the text', () => {
    const storage = new FakeStorage();
    const draft = draftFromInputs(DEFAULT_INPUTS);
    storage.setItem(
      STORAGE_KEYS.inputs,
      JSON.stringify({
        ...draft,
        unit: 'in',
        origins: { 'product.length': { text: '99', unit: 'in', canonical: 99 }, leeway: 'junk' },
      }),
    );
    const s = createInputsStore(storage).getState();
    expect(s.parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });
});
