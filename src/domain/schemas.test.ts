import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from './constants';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { optimizeResultSchema } from './resultSchemas';
import { PINWHEEL_INPUTS } from '../engine/packing/testSupport';
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
    weights: { maxPallet: null, emptyCarton: 0, pallet: 40 },
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

describe('weights', () => {
  const d = draftFromInputs(DEFAULT_INPUTS);
  const w = (weights: Partial<InputsDraft['weights']>): InputsDraft => ({
    ...d,
    weights: { ...d.weights, ...weights },
  });
  const BOX_MSG = 'Enter the weight of one product box to use a maximum pallet weight.';
  const MAX_MSG = "The maximum must be more than the pallet's own weight.";

  it('drafts blank box and maximum weights, a 0 lb carton and a 40 lb pallet', () => {
    expect(d.weights).toEqual({ productBox: '', maxPallet: '', emptyCarton: '0', pallet: '40' });
  });

  it('parses the weights, blank as null', () => {
    expect(
      parseDraft(w({ productBox: '2.5', maxPallet: '2000', emptyCarton: '1', pallet: '45' })),
    ).toEqual({
      ok: true,
      inputs: {
        ...DEFAULT_INPUTS,
        weights: { productBox: 2.5, maxPallet: 2000, emptyCarton: 1, pallet: 45 },
      },
    });
    expect(parseDraft(w({ productBox: ' ', maxPallet: '' }))).toEqual({
      ok: true,
      inputs: DEFAULT_INPUTS,
    });
  });

  it('needs a positive box weight and maximum', () => {
    expect(err(w({ productBox: '0' }))['weights.productBox']).toBe('Must be greater than 0');
    expect(err(w({ productBox: '2', maxPallet: '0' }))['weights.maxPallet']).toBe(
      'Must be greater than 0',
    );
    expect(err(w({ productBox: 'abc' }))['weights.productBox']).toBe('Enter a number');
    expect(err(w({ maxPallet: '-5' }))['weights.maxPallet']).toBe('Enter a number');
  });

  it('allows a zero carton and pallet weight but not a negative or blank one', () => {
    expect(parseDraft(w({ emptyCarton: '0', pallet: '0' })).ok).toBe(true);
    expect(err(w({ emptyCarton: '-1' }))['weights.emptyCarton']).toBe('Enter a number');
    expect(err(w({ pallet: '' }))['weights.pallet']).toBe('Required');
    expect(err(w({ emptyCarton: '' }))['weights.emptyCarton']).toBe('Required');
  });

  it('asks for the box weight when a maximum is set without one', () => {
    const e = err(w({ maxPallet: '1500' }));
    expect(e['weights.productBox']).toBe(BOX_MSG);
    expect(Object.keys(e)).toEqual(['weights.productBox']);
  });

  it('keeps the box weight text error ahead of the missing-weight message', () => {
    expect(err(w({ productBox: 'x', maxPallet: '1500' }))['weights.productBox']).toBe(
      'Enter a number',
    );
  });

  it('needs the maximum to be more than the pallet weight', () => {
    expect(err(w({ productBox: '2', maxPallet: '40' }))['weights.maxPallet']).toBe(MAX_MSG);
    expect(err(w({ productBox: '2', maxPallet: '30' }))['weights.maxPallet']).toBe(MAX_MSG);
    expect(parseDraft(w({ productBox: '2', maxPallet: '40.5' })).ok).toBe(true);
    // Both rules at once: each field gets its own message.
    expect(err(w({ maxPallet: '30' }))).toEqual({
      'weights.productBox': BOX_MSG,
      'weights.maxPallet': MAX_MSG,
    });
  });

  it('reads stored inputs without weights with the defaults', () => {
    const old: Record<string, unknown> = { ...structuredClone(DEFAULT_INPUTS) };
    delete old.weights;
    expect(inputsSchema.parse(old)).toEqual(DEFAULT_INPUTS);
  });

  it('reads a stored preset without weights with the defaults', () => {
    const old = {
      id: 'p1',
      name: 'Old',
      pallet: DEFAULT_INPUTS.pallet,
      maxCarton: DEFAULT_INPUTS.maxCarton,
      leeway: 0.5,
      wallThickness: 0.25,
      overhang: 0,
      targetQuantity: null,
      boxesPerCarton: null,
      rotationMode: 'full',
      customOrientations: [],
      keepCartonsUpright: false,
      advanced: {},
    };
    expect(presetSchema.parse(old).weights).toEqual({
      maxPallet: null,
      emptyCarton: 0,
      pallet: 40,
    });
  });

  it('rejects a stored preset whose maximum is not above its pallet weight', () => {
    const p = {
      ...presetSchema.parse({
        id: 'p',
        name: 'n',
        pallet: DEFAULT_INPUTS.pallet,
        maxCarton: DEFAULT_INPUTS.maxCarton,
        leeway: 0,
        wallThickness: 0,
        overhang: 0,
        targetQuantity: null,
        rotationMode: 'full',
        customOrientations: [],
        keepCartonsUpright: false,
        advanced: {},
      }),
    };
    expect(
      presetSchema.safeParse({ ...p, weights: { maxPallet: 2000, emptyCarton: 1, pallet: 40 } })
        .success,
    ).toBe(true);
    expect(
      presetSchema.safeParse({ ...p, weights: { maxPallet: 40, emptyCarton: 1, pallet: 40 } })
        .success,
    ).toBe(false);
  });
});

describe('optimizeResultSchema', () => {
  it('accepts the over-weight empty reason', () => {
    const r = { layouts: [], candidatesEvaluated: 3, emptyReason: 'OVER_WEIGHT', truncated: false };
    expect(optimizeResultSchema.parse(r)).toEqual(r);
  });

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

  it('keeps the pinwheel kind of a layer and loads layers stored without a kind', () => {
    const r = optimize(PINWHEEL_INPUTS);
    expect(r.layouts[0]!.layout.layers[0]!.kind).toBe('pinwheel');
    expect(optimizeResultSchema.parse(structuredClone(r))).toEqual(r);
    const plain = optimize(DEFAULT_INPUTS);
    expect(plain.layouts.every((x) => x.layout.layers.every((l) => !('kind' in l)))).toBe(true);
    expect(optimizeResultSchema.parse(structuredClone(plain))).toEqual(plain);
    const bad = structuredClone(r) as unknown as {
      layouts: { layout: { layers: { kind: string }[] } }[];
    };
    bad.layouts[0]!.layout.layers[0]!.kind = 'spiral';
    expect(optimizeResultSchema.safeParse(bad).success).toBe(false);
  });

  it('keeps the stability rating and turned layers, and loads results stored without them', () => {
    const r = optimize(DEFAULT_INPUTS);
    const winner = r.layouts[0]!.layout;
    expect(winner.stability?.rating).toBe('fair');
    expect(winner.layers.some((l) => l.turned)).toBe(true);
    expect(optimizeResultSchema.parse(structuredClone(r))).toEqual(r);
    const old = structuredClone(r);
    for (const { layout } of old.layouts) {
      delete layout.stability;
      for (const layer of layout.layers) delete layer.turned;
    }
    const parsed = optimizeResultSchema.parse(structuredClone(old));
    expect(parsed).toEqual(old);
    expect(parsed.layouts.every((x) => x.layout.stability === undefined)).toBe(true);
    const bad = structuredClone(r) as unknown as { layouts: { layout: { stability: unknown } }[] };
    bad.layouts[0]!.layout.stability = { rating: 'excellent', warnings: [] };
    expect(optimizeResultSchema.safeParse(bad).success).toBe(false);
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

  it('loads a scenario saved before the unused-space split and recomputes it', () => {
    const old = structuredClone(scenario) as unknown as {
      analytics: { totals: Record<string, unknown> };
    };
    delete old.analytics.totals.headroomVolume;
    delete old.analytics.totals.layerGapVolume;
    const parsed = scenarioSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.analytics).toEqual(analytics);
    expect(analytics.totals.headroomVolume).toBe(4200);
  });

  it('loads a scenario saved before weights with the default weights and no weight analytics', () => {
    const old = structuredClone(scenario) as unknown as {
      inputs: Record<string, unknown>;
      analytics: Record<string, unknown>;
    };
    delete old.inputs.weights;
    delete old.analytics.weight;
    const parsed = scenarioSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.inputs).toEqual(DEFAULT_INPUTS);
    expect(parsed.data?.analytics).toEqual(analytics);
    expect(parsed.data?.analytics?.weight).toBeNull();
  });

  it('loads a scenario saved before stability ratings, showing no rating', () => {
    const old = structuredClone(scenario) as unknown as {
      result: {
        layouts: { layout: Record<string, unknown> & { layers: Record<string, unknown>[] } }[];
      };
      analytics: Record<string, unknown>;
    };
    for (const { layout } of old.result.layouts) {
      delete layout.stability;
      for (const layer of layout.layers) delete layer.turned;
    }
    delete old.analytics.stability;
    const parsed = scenarioSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.analytics?.stability).toBeNull();
    expect(parsed.data?.result.layouts[1]!.layout.stability).toBeUndefined();
    expect(analytics.stability?.rating).toBe('fair');
  });

  it('keeps a weight-limited scenario as saved', () => {
    // 300 lb: the winner itself is trimmed (at 450 lb trimmed layouts tie with better-rated
    // untrimmed ones and no longer make the top five).
    const inputs = {
      ...DEFAULT_INPUTS,
      weights: { productBox: 2, emptyCarton: 1, pallet: 40, maxPallet: 300 },
    };
    const r = optimize(inputs);
    const a = computeAnalytics(r.layouts[0]!.layout, inputs);
    const saved = { ...scenario, inputs, result: r, selectedIndex: 0, analytics: a };
    expect(r.layouts.some((l) => l.layout.weightTrim)).toBe(true);
    expect(scenarioSchema.parse(structuredClone(saved))).toEqual(saved);
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
