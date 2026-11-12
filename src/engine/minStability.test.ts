import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, MinStability, OptimizeResult } from '../domain/types';
import { NAMED_CASES, randomCases } from './autoBaseline.testSupport';
import { optimize } from './optimize';
import { PINWHEEL_INPUTS } from './packing/testSupport';
import { meetsMinimum } from './ranking/rank';

const withMinimum = (i: object, minStability: MinStability): Inputs =>
  ({ ...i, minStability }) as Inputs;
const products = (r: OptimizeResult) => r.layouts.map((x) => x.layout.totalProducts);
const ratings = (r: OptimizeResult) => r.layouts.map((x) => x.layout.stability?.rating);

const RANDOM = randomCases(150);
const random = (k: number) => RANDOM[k]!.inputs;

describe('minimum stability (Round 5 spec 4)', () => {
  const auto = optimize(DEFAULT_INPUTS);

  it('Auto still offers the fair layout that carries the most', () => {
    expect(products(auto)).toEqual([260, 250, 250, 240, 240]);
    expect(ratings(auto)).toEqual(['fair', 'fair', 'fair', 'fair', 'fair']);
    expect(auto.belowMinimum).toBeUndefined();
    expect(auto.autoBestProducts).toBeUndefined();
  });

  it('Fair or better changes nothing when every layout Auto lists is fair or good', () => {
    expect(optimize(withMinimum(DEFAULT_INPUTS, 'fair'))).toEqual(auto);
  });

  it('Good only lists good layouts and says what Auto would give', () => {
    const r = optimize(withMinimum(DEFAULT_INPUTS, 'good'));
    expect(products(r)).toEqual([245, 210, 192, 180, 162]);
    expect(ratings(r)).toEqual(['good', 'good', 'good', 'good', 'good']);
    expect(r.autoBestProducts).toBe(260);
    expect(r.belowMinimum).toBeUndefined();
    expect(r.truncated).toBe(false);
    expect(r.emptyReason).toBeNull();
    expect(r.layouts.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    // Scored against the best layout offered, and explained against the next one listed.
    expect(r.layouts[0]!.score.quantity).toBeCloseTo(100, 9);
    expect(r.layouts[0]!.explanation).toContain('Layout #1 ranked above Layout #2');
    expect(r.candidatesEvaluated).toBe(auto.candidatesEvaluated);
  });

  it('Fair or better leaves out a poor layout that carries the most', () => {
    // Auto: 192 poor, then 170 good, then 168 fair.
    const i = random(116);
    expect(products(optimize(withMinimum(i, 'auto'))).slice(0, 3)).toEqual([192, 170, 168]);
    expect(ratings(optimize(withMinimum(i, 'auto'))).slice(0, 3)).toEqual(['poor', 'good', 'fair']);
    const fair = optimize(withMinimum(i, 'fair'));
    expect(products(fair)).toEqual([170, 168, 168, 168, 168]);
    expect(ratings(fair)).toEqual(['good', 'fair', 'fair', 'fair', 'fair']);
    expect(fair.autoBestProducts).toBe(192);
    const good = optimize(withMinimum(i, 'good'));
    expect(products(good)).toEqual([170, 160, 160, 144, 144]);
    expect(new Set(ratings(good))).toEqual(new Set(['good']));
    expect(good.autoBestProducts).toBe(192);
  });

  it('nothing reaches Good: the most stable layouts found, flagged, and never empty', () => {
    // Every layout of the pinned pinwheel case is fair.
    const r = optimize(withMinimum(PINWHEEL_INPUTS, 'good'));
    expect(r.belowMinimum).toBe(true);
    expect(r.emptyReason).toBeNull();
    expect(r.layouts).toEqual(optimize(PINWHEEL_INPUTS).layouts);
    expect(r.autoBestProducts).toBeUndefined();
    expect(r.truncated).toBe(false);
  });

  it('nothing reaches Good and the layout with the most is poor: fair ones, most boxes first', () => {
    const i = random(129);
    expect(optimize(withMinimum(i, 'auto')).layouts[0]!.layout).toMatchObject({
      totalProducts: 900,
      stability: { rating: 'poor' },
    });
    const r = optimize(withMinimum(i, 'good'));
    expect(r.belowMinimum).toBe(true);
    expect(products(r)).toEqual([810, 810, 792, 792, 774]);
    expect(new Set(ratings(r))).toEqual(new Set(['fair']));
    expect(r.autoBestProducts).toBe(900);
    // Fair or better is met by the same layouts, so there it is not flagged.
    const fair = optimize(withMinimum(i, 'fair'));
    expect(fair.belowMinimum).toBeUndefined();
    expect(fair.layouts).toEqual(r.layouts);
  });

  it('nothing reaches Fair: the poor layouts as Auto lists them, flagged', () => {
    const i = random(138);
    const r = optimize(withMinimum(i, 'fair'));
    expect(r.belowMinimum).toBe(true);
    expect(new Set(ratings(r))).toEqual(new Set(['poor']));
    expect(r.layouts).toEqual(optimize(withMinimum(i, 'auto')).layouts);
  });

  it('keeps the empty reasons: a minimum never turns "nothing fits" into something else', () => {
    const i = { ...DEFAULT_INPUTS, product: { length: 30, width: 30, height: 30 } };
    expect(optimize(withMinimum(i, 'good'))).toEqual(optimize(i));
    expect(optimize(withMinimum(i, 'good')).emptyReason).toBe('NO_CARTON_FITS');
  });

  it('still judges a layout in its interlocked form', () => {
    const r = optimize(withMinimum(DEFAULT_INPUTS, 'good'));
    expect(r.layouts.some((x) => x.layout.layers.some((l) => l.turned))).toBe(true);
  });

  describe('time', () => {
    it('a search that used the whole budget still rates the first group', () => {
      let t = 0;
      const r = optimize(withMinimum(DEFAULT_INPUTS, 'good'), {
        now: () => (t += 5000),
        budgetMs: 4000,
      });
      expect(r.truncated).toBe(true);
      expect(r.layouts.length).toBeGreaterThan(0);
    });

    it('marks the result limited when the budget ends the rating walk early', () => {
      // Count the clock readings of the search, then let the time run out right after it.
      let readings = 0;
      const full = optimize(withMinimum(DEFAULT_INPUTS, 'good'), {
        now: () => {
          readings += 1;
          return 0;
        },
      });
      expect(full.truncated).toBe(false);
      expect(readings).toBeGreaterThan(2);
      const searchReadings = (() => {
        let n = 0;
        optimize(DEFAULT_INPUTS, { now: () => ((n += 1), 0) });
        return n;
      })();
      let n = 0;
      const cut = optimize(withMinimum(DEFAULT_INPUTS, 'good'), {
        now: () => ((n += 1) <= searchReadings ? 0 : 1e9 + n * 1000),
      });
      expect(cut.truncated).toBe(true);
      // Only the group of 260 was rated, and it is fair: the best found, below the minimum.
      expect(cut.belowMinimum).toBe(true);
      expect(new Set(products(cut))).toEqual(new Set([260]));
      // Auto reads the clock no more than before: its result cannot depend on the walk.
      expect(optimize(DEFAULT_INPUTS, { now: () => ((n += 1), 0) })).toEqual(auto);
    });
  });

  describe.each(['fair', 'good'] as const)('minimum %s over the fixtures and a random run', (m) => {
    it.each([...NAMED_CASES, ...RANDOM])('$name', ({ inputs }) => {
      const base = optimize(withMinimum(inputs, 'auto'));
      const r = optimize(withMinimum(inputs, m));
      expect(r.truncated).toBe(base.truncated);
      expect(r.emptyReason).toBe(base.emptyReason);
      expect(r.candidatesEvaluated).toBe(base.candidatesEvaluated);
      expect(r).toEqual(optimize(withMinimum(inputs, m))); // deterministic
      if (base.layouts.length === 0) {
        expect(r).toEqual(base);
        return;
      }
      expect(r.layouts.length).toBeGreaterThan(0);
      expect(r.layouts.map((x) => x.rank)).toEqual(r.layouts.map((_, k) => k + 1));
      const top = base.layouts[0]!.layout.totalProducts;
      const shown = r.layouts[0]!.layout.totalProducts;
      expect(shown).toBeLessThanOrEqual(top);
      expect(r.autoBestProducts).toBe(shown < top ? top : undefined);
      for (let k = 1; k < r.layouts.length; k++) {
        expect(r.layouts[k]!.layout.totalProducts).toBeLessThanOrEqual(
          r.layouts[k - 1]!.layout.totalProducts,
        );
      }
      const met = r.layouts.map((x) => meetsMinimum(x.layout.stability!.rating, m));
      if (r.belowMinimum) {
        // Nothing met it: one rating throughout, and Auto found nothing that meets it either.
        expect(met.some(Boolean)).toBe(false);
        expect(new Set(ratings(r)).size).toBe(1);
        expect(base.layouts.some((x) => meetsMinimum(x.layout.stability!.rating, m))).toBe(false);
      } else {
        expect(r.belowMinimum).toBeUndefined();
        expect(met.every(Boolean)).toBe(true);
      }
      // When every layout Auto lists meets the minimum, the minimum changes nothing.
      if (base.layouts.every((x) => meetsMinimum(x.layout.stability!.rating, m))) {
        expect(r).toEqual(base);
      }
    });
  });
});
