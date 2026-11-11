import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs } from '../domain/schemas';
import type { Inputs, PresetFields } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { presetFieldsOf } from '../ui/presetFields';
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
    const fields: PresetFields = {
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
      weights: { maxPallet: null, emptyCarton: 0, pallet: 40 },
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
      inputs: { ...DEFAULT_INPUTS, ...fields, weights: { ...fields.weights, productBox: null } },
    });
  });

  it('applyPreset writes the preset weights and keeps the product box weight as typed', () => {
    const store = createInputsStore(new FakeStorage());
    store.getState().setField('weights.productBox', '2.50');
    store.getState().setUnit('cm');
    store.getState().setField('weights.emptyCarton', '1');
    store.getState().applyPreset({
      ...presetFieldsOf(DEFAULT_INPUTS),
      weights: { maxPallet: 2000, emptyCarton: 0.5, pallet: 45 },
    });
    const s = store.getState();
    // Box weight: typed in lb, shown in kg, still exactly 2.5 lb.
    expect(s.draft.weights.productBox).toBe('1.1');
    // Preset weights are written in pounds and shown in kg.
    expect(s.draft.weights).toMatchObject({
      maxPallet: '907.2',
      emptyCarton: '0.2',
      pallet: '20.4',
    });
    expect(s.parsed).toEqual({
      ok: true,
      inputs: {
        ...DEFAULT_INPUTS,
        weights: { productBox: 2.5, maxPallet: 2000, emptyCarton: 0.5, pallet: 45 },
      },
    });
    store.getState().setUnit('in');
    expect(store.getState().draft.weights).toEqual({
      productBox: '2.50',
      maxPallet: '2000',
      emptyCarton: '0.5',
      pallet: '45',
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
    const fields: PresetFields = {
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

  describe('values the store writes keep their exact inch text', () => {
    const FINE: Inputs = {
      ...DEFAULT_INPUTS,
      pallet: { length: 48.125, width: 40, height: 72 },
      wallThickness: 0.125,
      leeway: 0.0625,
    };
    const fineFields = (): Omit<Inputs, 'product'> =>
      Object.fromEntries(Object.entries(FINE).filter(([k]) => k !== 'product')) as Omit<
        Inputs,
        'product'
      >;

    it('replaceInputs in inches writes String(value), as main did', () => {
      const store = fresh();
      store.getState().replaceInputs(FINE);
      const d = store.getState().draft;
      expect(d.pallet.length).toBe('48.125');
      expect(d.wallThickness).toBe('0.125');
      expect(d.leeway).toBe('0.0625');
      expect(d).toEqual(draftFromInputs(FINE));
      expect(store.getState().parsed).toEqual({ ok: true, inputs: FINE });
    });

    it('applyPreset in inches writes the exact text', () => {
      const store = fresh();
      store.getState().applyPreset(fineFields());
      const d = store.getState().draft;
      expect([d.pallet.length, d.wallThickness, d.leeway]).toEqual(['48.125', '0.125', '0.0625']);
      expect(store.getState().parsed).toEqual({ ok: true, inputs: FINE });
    });

    it('keeps the exact text across a reload', () => {
      const storage = new FakeStorage();
      createInputsStore(storage).getState().replaceInputs(FINE);
      const s = createInputsStore(storage).getState();
      expect([s.draft.pallet.length, s.draft.wallThickness, s.draft.leeway]).toEqual([
        '48.125',
        '0.125',
        '0.0625',
      ]);
      expect(s.parsed).toEqual({ ok: true, inputs: FINE });
    });

    it('rounds in cm and restores the exact inch text on the way back', () => {
      const store = fresh();
      store.getState().replaceInputs(FINE);
      store.getState().setUnit('cm');
      const d = store.getState().draft;
      expect([d.pallet.length, d.wallThickness, d.leeway]).toEqual(['122.2', '0.3', '0.2']);
      expect(store.getState().parsed).toEqual({ ok: true, inputs: FINE });
      store.getState().setUnit('in');
      expect(store.getState().draft).toEqual(draftFromInputs(FINE));
      expect(store.getState().parsed).toEqual({ ok: true, inputs: FINE });
    });

    it('a value written while in cm shows its exact inch text after switching to inches', () => {
      const store = fresh();
      store.getState().setUnit('mm');
      store.getState().replaceInputs(FINE);
      expect(store.getState().draft.wallThickness).toBe('3');
      store.getState().setUnit('in');
      expect(store.getState().draft.wallThickness).toBe('0.125');
    });

    it('a preset saved in cm and kg shows at most 4 decimals in inches and keeps every value', () => {
      // Typed in cm and kg: 120 cm is 47.244094488188976 in, 800 kg is 1763.69809744 lb.
      const typed = fresh();
      typed.getState().setUnit('cm');
      for (const [path, text] of Object.entries({
        'pallet.length': '120',
        'pallet.width': '100',
        'pallet.height': '180',
        'maxCarton.length': '60',
        leeway: '0.7',
        wallThickness: '0.3',
        overhang: '1.5',
        'weights.productBox': '2.3',
        'weights.maxPallet': '800',
        'weights.emptyCarton': '0.4',
        'weights.pallet': '21.7',
      }))
        typed.getState().setField(path, text);
      const parsed = typed.getState().parsed;
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const saved = parsed.inputs;
      expect(saved.pallet.length).toBe(120 / 2.54);
      expect(String(saved.weights.maxPallet)).toBe('1763.69809744');

      // Loaded in inches as a whole (a scenario).
      const store = fresh();
      store.getState().replaceInputs(saved);
      const d = store.getState().draft;
      const texts = [
        d.pallet.length,
        d.pallet.width,
        d.pallet.height,
        d.maxCarton.length,
        d.leeway,
        d.wallThickness,
        d.overhang,
        d.weights.productBox,
        d.weights.maxPallet,
        d.weights.emptyCarton,
        d.weights.pallet,
      ];
      for (const t of texts) expect(t).toMatch(/^\d+(\.\d{1,4})?$/);
      expect(d.pallet.length).toBe('47.2441');
      expect(d.weights.maxPallet).toBe('1763.6981');
      expect(store.getState().parsed).toEqual({ ok: true, inputs: saved });
      // Applied as a preset too (no product weight in a preset).
      const viaPreset = fresh();
      viaPreset.getState().applyPreset(presetFieldsOf(saved));
      expect(viaPreset.getState().draft.pallet.length).toBe('47.2441');
      expect(viaPreset.getState().draft.weights.maxPallet).toBe('1763.6981');
      // A maximum needs a box weight to parse; the preset keeps the product's (blank).
      viaPreset.getState().setField('weights.productBox', '1');
      const p = viaPreset.getState().parsed;
      expect(p.ok && p.inputs.pallet).toEqual(saved.pallet);
      expect(p.ok && p.inputs.weights.maxPallet).toBe(saved.weights.maxPallet);
      // Switching to cm shows the typed values again, and back to inches the short text.
      store.getState().setUnit('cm');
      expect(store.getState().draft.pallet.length).toBe('120');
      expect(store.getState().draft.weights.maxPallet).toBe('800');
      expect(store.getState().parsed).toEqual({ ok: true, inputs: saved });
      store.getState().setUnit('in');
      expect(store.getState().draft.pallet.length).toBe('47.2441');
      expect(store.getState().parsed).toEqual({ ok: true, inputs: saved });
    });

    it('a value typed in cm comes back as typed after inches', () => {
      const store = fresh();
      store.getState().setUnit('cm');
      store.getState().setField('pallet.length', '120.35');
      store.getState().setUnit('in');
      expect(store.getState().draft.pallet.length).toBe('47.38');
      store.getState().setUnit('cm');
      expect(store.getState().draft.pallet.length).toBe('120.35');
    });

    it('retyping the shown inch text keeps the value', () => {
      const store = fresh();
      store.getState().replaceInputs(FINE);
      store.getState().setField('wallThickness', store.getState().draft.wallThickness);
      expect(store.getState().parsed).toEqual({ ok: true, inputs: FINE });
    });
  });
});

describe('inputsStore weights', () => {
  const fresh = (unit?: 'in' | 'cm' | 'mm') => createInputsStore(new FakeStorage(), { unit });
  const withoutWeights = (draft: Record<string, unknown>) => {
    const copy = { ...draft };
    delete copy.weights;
    return copy;
  };

  it('starts with a blank box weight and maximum, a 0 lb carton and a 40 lb pallet', () => {
    expect(fresh().getState().draft.weights).toEqual({
      productBox: '',
      maxPallet: '',
      emptyCarton: '0',
      pallet: '40',
    });
    // In cm or mm the weights are in kg: 40 lb shows as 18.1.
    expect(fresh('cm').getState().draft.weights).toEqual({
      productBox: '',
      maxPallet: '',
      emptyCarton: '0',
      pallet: '18.1',
    });
    expect(fresh('mm').getState().parsed).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });

  it('reads typed kg as pounds and never changes the parse on a unit switch', () => {
    const store = fresh('cm');
    store.getState().setField('weights.productBox', '2');
    store.getState().setField('weights.maxPallet', '1000');
    const parsed = store.getState().parsed;
    expect(parsed.ok && parsed.inputs.weights.productBox).toBeCloseTo(4.409245, 5);
    expect(parsed.ok && parsed.inputs.weights.maxPallet).toBeCloseTo(2204.6226, 4);
    store.getState().setUnit('in');
    expect(store.getState().draft.weights).toEqual({
      productBox: '4.4',
      maxPallet: '2204.6',
      emptyCarton: '0',
      pallet: '40',
    });
    expect(store.getState().parsed).toBe(parsed);
    store.getState().setUnit('mm');
    expect(store.getState().draft.weights.productBox).toBe('2');
    expect(store.getState().parsed).toBe(parsed);
  });

  it('keeps a blank box weight blank across unit switches', () => {
    const store = fresh();
    store.getState().setUnit('cm');
    store.getState().setUnit('in');
    expect(store.getState().draft.weights.productBox).toBe('');
    expect(store.getState().draft.weights.maxPallet).toBe('');
  });

  it('loads a draft remembered before weights with the default weights', () => {
    const storage = new FakeStorage();
    const old = withoutWeights({ ...draftFromInputs(DEFAULT_INPUTS), leeway: '2' });
    storage.setItem(STORAGE_KEYS.inputs, JSON.stringify(old));
    const s = createInputsStore(storage).getState();
    expect(s.draft.weights).toEqual(draftFromInputs(DEFAULT_INPUTS).weights);
    expect(s.parsed).toEqual({ ok: true, inputs: { ...DEFAULT_INPUTS, leeway: 2 } });
  });

  it('loads a cm draft remembered before weights with the default weights in kg', () => {
    const storage = new FakeStorage();
    const store = createInputsStore(storage, { unit: 'cm' });
    store.getState().setField('leeway', '2.54');
    const saved = JSON.parse(storage.getItem(STORAGE_KEYS.inputs)!) as Record<string, unknown>;
    const origins = saved.origins as Record<string, unknown>;
    for (const k of Object.keys(origins)) if (k.startsWith('weights.')) delete origins[k];
    storage.setItem(STORAGE_KEYS.inputs, JSON.stringify(withoutWeights(saved)));
    const s = createInputsStore(storage).getState();
    expect(s.unit).toBe('cm');
    expect(s.draft.weights.pallet).toBe('18.1');
    // Exactly 40 lb, not 18.1 kg read back.
    expect(s.parsed).toEqual({ ok: true, inputs: { ...DEFAULT_INPUTS, leeway: 1 } });
  });

  it('shows the weight field messages', () => {
    const store = fresh();
    store.getState().setField('weights.maxPallet', '1500');
    expect(store.getState().parsed).toEqual({
      ok: false,
      errors: {
        'weights.productBox': 'Enter the weight of one product box to use a maximum pallet weight.',
      },
    });
  });
});
