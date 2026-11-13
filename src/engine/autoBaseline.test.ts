import { describe, expect, it } from 'vitest';
import type { Inputs } from '../domain/types';
import {
  digest,
  NAMED_CASES,
  randomCases,
  type BaselineCase,
  type BaselineRecord,
} from './autoBaseline.testSupport';
import recorded from './fixtures/autoBaseline.json';
import { optimize } from './optimize';

/**
 * The digests were recorded from the optimizer as it was before Round 5 (da0f83c): digest()
 * of optimize() for each case below, keeping the cases that finished in under 0.4 s and were
 * not cut short (all of them). Do not re-record to make a failure pass: under the default
 * settings the optimizer must return exactly what it returned then.
 */
const RANDOM_CASES = 150;
const baseline = recorded as Record<string, BaselineRecord>;
const cases: BaselineCase[] = [...NAMED_CASES, ...randomCases(RANDOM_CASES)];

describe('default settings give the results recorded before Round 5', () => {
  it('has a recorded result for most cases, random ones included', () => {
    const names = cases.map((c) => c.name).filter((n) => n in baseline);
    expect(NAMED_CASES.every((c) => c.name in baseline)).toBe(true);
    expect(names.length).toBeGreaterThanOrEqual(100);
    expect(Object.keys(baseline).every((n) => cases.some((c) => c.name === n))).toBe(true);
    // The run is worth something only if it covers layouts of every rating and empty results.
    const all = Object.values(baseline);
    for (const rating of ['good', 'fair', 'poor']) {
      expect(all.some((r) => r.layouts.some((l) => l.endsWith(` ${rating}`)))).toBe(true);
    }
    expect(all.some((r) => r.emptyReason !== null)).toBe(true);
  });

  it.each(cases.filter((c) => c.name in baseline))(
    '$name: minimum stability and layer pattern Auto, and inputs without the settings',
    ({ name, inputs }) => {
      const auto = optimize({ ...inputs, minStability: 'auto', layerPattern: 'auto' });
      expect(auto.truncated).toBe(false);
      expect(digest(auto)).toEqual(baseline[name]);
      expect(auto).not.toHaveProperty('belowMinimum');
      expect(auto).not.toHaveProperty('autoBestProducts');
      expect(auto).not.toHaveProperty('patternFallback');
      // Inputs from before the settings existed (a worker message, a stored result's inputs),
      // and inputs with one setting but not the other.
      expect('minStability' in inputs || 'layerPattern' in inputs).toBe(false);
      expect(digest(optimize(inputs as Inputs))).toEqual(baseline[name]);
      expect(digest(optimize({ ...inputs, minStability: 'auto' } as Inputs))).toEqual(
        baseline[name],
      );
      expect(digest(optimize({ ...inputs, layerPattern: 'auto' } as Inputs))).toEqual(
        baseline[name],
      );
    },
  );
});
