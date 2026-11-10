import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from './constants';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { optimizeResultSchema } from './resultSchemas';
import { draftFromInputs, inputsSchema, parseDraft, presetSchema, scenarioSchema } from './schemas';
import type { InputsDraft, Preset } from './types';

function err(draft: InputsDraft): Record<string, string> {
  const r = parseDraft(draft);
  expect(r.ok).toBe(false);
  return r.ok ? {} : r.errors;
}

describe('parseDraft', () => {
  const d = draftFromInputs(DEFAULT_INPUTS);
  const withProductLength = (length: string) => ({ ...d, product: { ...d.product, length } });

  it('round-trips the defaults', () => {
    expect(parseDraft(d)).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
  });
  it('trims whitespace', () => {
    expect(parseDraft({ ...d, leeway: ' 0.5 ' }).ok).toBe(true);
  });
  it('accepts leading-dot decimals and zero for leeway/wall/overhang', () => {
    expect(parseDraft({ ...d, leeway: '.5', wallThickness: '0', overhang: '0' }).ok).toBe(true);
  });
  it('rejects non-plain numbers', () => {
    for (const bad of ['12in', '1,5', '1e2', 'abc', '-3'])
      expect(err(withProductLength(bad))['product.length']).toBe('Enter a number');
  });
  it('requires values', () => {
    expect(err(withProductLength(''))['product.length']).toBe('Required');
    expect(err(withProductLength('   '))['product.length']).toBe('Required');
  });
  it('rejects zero dimensions', () => {
    expect(err(withProductLength('0'))['product.length']).toBe('Must be greater than 0');
  });
  it('requires pallet height above the built-in pallet', () => {
    expect(err({ ...d, pallet: { ...d.pallet, height: '5' } })['pallet.height']).toBe(
      'Pallet height must be greater than 5 inches',
    );
  });
  it('treats a minus sign as non-numeric text', () => {
    expect(err({ ...d, overhang: '-1' }).overhang).toBe('Enter a number');
  });
  it('validates the target quantity', () => {
    expect(err({ ...d, targetQuantity: '2.5' }).targetQuantity).toBe(
      'Enter a whole number of 1 or more',
    );
    expect(err({ ...d, targetQuantity: '0' }).targetQuantity).toBe(
      'Enter a whole number of 1 or more',
    );
    expect(err({ ...d, targetQuantity: 'abc' }).targetQuantity).toBe('Enter a number');
    expect(parseDraft({ ...d, targetQuantity: '' })).toMatchObject({
      ok: true,
      inputs: { targetQuantity: null },
    });
    expect(parseDraft({ ...d, targetQuantity: '120' })).toMatchObject({
      ok: true,
      inputs: { targetQuantity: 120 },
    });
  });
  it('requires an orientation in custom mode', () => {
    expect(err({ ...d, rotationMode: 'custom', customOrientations: [] }).customOrientations).toBe(
      'Select at least one orientation',
    );
    expect(parseDraft({ ...d, rotationMode: 'custom', customOrientations: ['LWH'] }).ok).toBe(true);
  });
  it('validates the desired boxes per carton', () => {
    expect(parseDraft({ ...d, boxesPerCarton: '' })).toMatchObject({
      ok: true,
      inputs: { boxesPerCarton: null },
    });
    expect(parseDraft({ ...d, boxesPerCarton: '   ' })).toMatchObject({
      ok: true,
      inputs: { boxesPerCarton: null },
    });
    expect(parseDraft({ ...d, boxesPerCarton: ' 6 ' })).toMatchObject({
      ok: true,
      inputs: { boxesPerCarton: 6 },
    });
    for (const bad of ['0', '2.5'])
      expect(err({ ...d, boxesPerCarton: bad }).boxesPerCarton).toBe(
        'Enter a whole number of 1 or more',
      );
    expect(err({ ...d, boxesPerCarton: 'abc' }).boxesPerCarton).toBe('Enter a number');
  });
  it('reports several errors at once', () => {
    const errors = err({ ...withProductLength('x'), leeway: '' });
    expect(Object.keys(errors).sort()).toEqual(['leeway', 'product.length']);
  });
});

describe('inputsSchema', () => {
  it('rejects negative numbers passed directly', () => {
    const r = inputsSchema.safeParse({ ...DEFAULT_INPUTS, leeway: -1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Cannot be negative');
  });

  it('accepts Round 1 inputs without boxesPerCarton and reads them as null', () => {
    const round1Inputs: Record<string, unknown> = { ...DEFAULT_INPUTS };
    delete round1Inputs.boxesPerCarton;
    expect(inputsSchema.parse(round1Inputs).boxesPerCarton).toBeNull();
    expect(inputsSchema.parse({ ...DEFAULT_INPUTS, boxesPerCarton: 6 }).boxesPerCarton).toBe(6);
  });

  it('rejects a boxesPerCarton that is not a whole number of 1 or more', () => {
    for (const bad of [0, 2.5, -1, '6'])
      expect(inputsSchema.safeParse({ ...DEFAULT_INPUTS, boxesPerCarton: bad }).success).toBe(
        false,
      );
  });
});

describe('presetSchema', () => {
  const preset: Preset = {
    id: 'p1',
    name: 'Mine',
    pallet: DEFAULT_INPUTS.pallet,
    maxCarton: DEFAULT_INPUTS.maxCarton,
    leeway: DEFAULT_INPUTS.leeway,
    wallThickness: DEFAULT_INPUTS.wallThickness,
    overhang: DEFAULT_INPUTS.overhang,
    targetQuantity: DEFAULT_INPUTS.targetQuantity,
    boxesPerCarton: 4,
    rotationMode: DEFAULT_INPUTS.rotationMode,
    customOrientations: [],
    keepCartonsUpright: false,
    advanced: {},
  };

  it('keeps a stored boxesPerCarton', () => {
    expect(presetSchema.parse(structuredClone(preset))).toEqual(preset);
  });

  it('accepts a Round 1 preset without boxesPerCarton and reads it as null', () => {
    const round1Preset: Record<string, unknown> = { ...preset };
    delete round1Preset.boxesPerCarton;
    expect(presetSchema.parse(round1Preset)).toEqual({ ...preset, boxesPerCarton: null });
  });
});

describe('optimizeResultSchema', () => {
  it('accepts the new empty reason with the nearest achievable counts', () => {
    const r = {
      layouts: [],
      candidatesEvaluated: 0,
      emptyReason: 'NO_CARTON_WITH_COUNT',
      truncated: false,
      nearestCounts: { below: 6, above: null },
    };
    expect(optimizeResultSchema.parse(r)).toEqual(r);
  });

  it('accepts a Round 1 result without nearestCounts', () => {
    const r = optimize(DEFAULT_INPUTS);
    expect('nearestCounts' in r).toBe(false);
    expect(optimizeResultSchema.parse(structuredClone(r))).toEqual(r);
  });
});

describe('scenarioSchema', () => {
  const result = optimize(DEFAULT_INPUTS);
  const analytics = computeAnalytics(result.layouts[1]!.layout, DEFAULT_INPUTS);
  const scenario = {
    id: 's1',
    name: 'Saved',
    savedAt: '2026-11-10T12:00:00.000Z',
    inputs: DEFAULT_INPUTS,
    result,
    selectedIndex: 1,
    analytics,
  };

  it('keeps current analytics as saved', () => {
    expect(scenarioSchema.parse(structuredClone(scenario)).analytics).toEqual(analytics);
  });

  it('loads an older scenario without the carton arrangement and recomputes it', () => {
    const old = structuredClone(scenario) as unknown as {
      analytics: { carton: Record<string, unknown> };
    };
    delete old.analytics.carton.counts;
    delete old.analytics.carton.layerOrientations;
    const parsed = scenarioSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.analytics).toEqual(analytics);
  });

  it('loads a Round 1 scenario without boxesPerCarton, reading it as null', () => {
    const old = structuredClone(scenario) as unknown as { inputs: Record<string, unknown> };
    delete old.inputs.boxesPerCarton;
    expect('boxesPerCarton' in old.inputs).toBe(false);
    const parsed = scenarioSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.inputs).toEqual(DEFAULT_INPUTS);
    expect(parsed.data?.inputs.boxesPerCarton).toBeNull();
    expect(parsed.data?.analytics).toEqual(analytics);
  });
});
