import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from './constants';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { draftFromInputs, inputsSchema, parseDraft, scenarioSchema } from './schemas';
import type { InputsDraft } from './types';

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
});
