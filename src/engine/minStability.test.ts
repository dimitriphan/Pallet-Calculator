import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, MinStability, OptimizeResult } from '../domain/types';
import { NAMED_CASES, randomCases } from './autoBaseline.testSupport';
import { HARD_LIMIT_MS, MIN_RATING_WALK_MS, optimize, ratingWalkOver } from './optimize';
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

    /**
     * With no time budget at all the search stops after its first carton, whatever the clock
     * says, as soon as it has layouts: for the defaults those are 250, 240 and 200 boxes rated
     * Fair and 210 and 180 rated Good. What follows is the rating walk alone. `after` is the
     * clock once the search is over (its reading number, from 1).
     */
    const GOOD = withMinimum(DEFAULT_INPUTS, 'good');
    const searchReadings = (() => {
      let n = 0;
      optimize(DEFAULT_INPUTS, { now: () => ((n += 1), 0), budgetMs: 0 });
      return n;
    })();
    const walk = (after: (reading: number) => number) => {
      let n = 0;
      return optimize(GOOD, {
        now: () => ((n += 1) <= searchReadings ? 0 : after(n - searchReadings)),
        budgetMs: 0,
      });
    };

    it('past the budget the walk still gets its 500 ms, enough here to find the good layouts', () => {
      // Each reading of the clock is 1 ms on: every layout is rated well inside 500 ms.
      const r = walk((k) => k);
      expect(products(r)).toEqual([210, 180]);
      expect(ratings(r)).toEqual(['good', 'good']);
      expect(r.belowMinimum).toBeUndefined();
      expect(r.autoBestProducts).toBe(250);
    });

    it('marks the result limited when the walk is ended after its 500 ms', () => {
      // 300 ms a reading: the walk starts at 300, and is over at the reading of 900.
      const r = walk((k) => 300 * k);
      expect(r.truncated).toBe(true);
      // Only the group of 250 was rated in full, and it is fair: the best found.
      expect(r.belowMinimum).toBe(true);
      expect(new Set(ratings(r))).toEqual(new Set(['fair']));
      expect(products(r)[0]).toBe(250);
    });

    it('at the hard limit the walk rates the first group and no more, 500 ms or not', () => {
      // The clock stands at 7 s: the walk has had none of its 500 ms, but the limit is passed.
      const r = walk(() => 7000);
      expect(r.truncated).toBe(true);
      expect(r.belowMinimum).toBe(true);
      expect(products(r)).toEqual([250]);
      // Just under the limit, with a clock that stands still, it goes on to the good ones.
      expect(products(walk(() => HARD_LIMIT_MS - 1))).toEqual([210, 180]);
    });

    it('the rule itself: budget and 500 ms of its own, or budget and the hard limit', () => {
      expect(ratingWalkOver(3999, 9999, 4000)).toBe(false);
      expect(ratingWalkOver(4000, MIN_RATING_WALK_MS - 1, 4000)).toBe(false);
      expect(ratingWalkOver(4000, MIN_RATING_WALK_MS, 4000)).toBe(true);
      expect(ratingWalkOver(HARD_LIMIT_MS - 1, 0, 4000)).toBe(false);
      expect(ratingWalkOver(HARD_LIMIT_MS, 0, 4000)).toBe(true);
      // A budget above the hard limit is the caller's own: nothing stops before it.
      expect(ratingWalkOver(HARD_LIMIT_MS, 9999, 10_000)).toBe(false);
    });

    it('Auto reads the clock no more than the search does: no walk', () => {
      let n = 0;
      expect(optimize(DEFAULT_INPUTS, { now: () => ((n += 1), 0) })).toEqual(auto);
      const plain = n;
      n = 0;
      optimize(withMinimum(DEFAULT_INPUTS, 'good'), { now: () => ((n += 1), 0) });
      expect(n).toBeGreaterThan(plain);
    });
  });

  describe.each(['fair', 'good'] as const)('minimum %s over the fixtures and a random run', (m) => {
    it.each([...NAMED_CASES, ...RANDOM])('$name', ({ inputs }) => {
      const base = optimize(withMinimum(inputs, 'auto'));
      const r = optimize(withMinimum(inputs, m));
      expect(r.truncated).toBe(base.truncated);
      expect(r.emptyReason).toBe(base.emptyReason);
      // Cartons are skipped only against layouts that meet the minimum, so never more than
      // under Auto.
      expect(r.candidatesEvaluated).toBeGreaterThanOrEqual(base.candidatesEvaluated);
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
        expect({ ...r, candidatesEvaluated: 0 }).toEqual({ ...base, candidatesEvaluated: 0 });
      }
    });
  });
});
