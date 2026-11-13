import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layout, StabilityRating } from '../../domain/types';
import { assessStability } from '../analytics/stability';
import { generateCartonCandidates } from '../packing/cartons';
import { interlockLayers } from '../packing/interlock';
import { buildLayouts } from '../packing/stacking';
import { PINWHEEL_INPUTS } from '../packing/testSupport';
import { meetsMinimum, rankLayouts, rankWithMinimum } from './rank';

const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};
const FIXTURES: [string, Inputs][] = [
  ['default', DEFAULT_INPUTS],
  ['cubes', CUBES],
  ['pinwheel', PINWHEEL_INPUTS],
  ['small product', { ...DEFAULT_INPUTS, product: { length: 6, width: 4, height: 3 } }],
];
const MINIMUMS = ['fair', 'good'] as const;

function allLayouts(i: Inputs): Layout[] {
  const cache = new Map();
  return generateCartonCandidates(i).flatMap((c) => buildLayouts(c, i, cache));
}

/** What the optimizer does to a layout before it is rated. */
const prepareFor =
  (i: Inputs) =>
  (l: Layout): Layout => {
    const interlocked = interlockLayers(l, i);
    return { ...interlocked, stability: assessStability(interlocked, i) };
  };

const rated = (l: Layout, rating: StabilityRating): Layout => ({
  ...l,
  stability: { rating, warnings: [] },
});

describe('meetsMinimum', () => {
  it('Fair or better takes good and fair; Good only takes good', () => {
    expect((['good', 'fair', 'poor'] as const).map((r) => meetsMinimum(r, 'fair'))).toEqual([
      true,
      true,
      false,
    ]);
    expect((['good', 'fair', 'poor'] as const).map((r) => meetsMinimum(r, 'good'))).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('rankWithMinimum', () => {
  describe.each(FIXTURES)('%s', (_name, i) => {
    const raw = allLayouts(i);
    const prepared = raw.map(prepareFor(i));
    const top = Math.max(...raw.map((l) => l.totalProducts));

    it.each(MINIMUMS)('minimum %s ranks the layouts that meet it exactly as before', (minimum) => {
      const qualifying = prepared.filter((l) => meetsMinimum(l.stability!.rating, minimum));
      const r = rankWithMinimum(raw, i, minimum, { prepare: prepareFor(i) });
      expect(r.truncated).toBe(false);
      if (qualifying.length === 0) {
        expect(r.belowMinimum).toBe(true);
        return;
      }
      expect(r.belowMinimum).toBe(false);
      // Leaving the others out and ranking the rest is all the minimum does.
      expect(r.layouts).toEqual(rankLayouts(qualifying, i));
      for (const x of r.layouts)
        expect(meetsMinimum(x.layout.stability!.rating, minimum)).toBe(true);
      expect(r.layouts[0]!.score.quantity).toBeCloseTo(100, 9);
      const shownTop = r.layouts[0]!.layout.totalProducts;
      expect(r.autoBestProducts).toBe(shownTop < top ? top : undefined);
    });
  });

  const raw = allLayouts(DEFAULT_INPUTS);
  const counts = [...new Set(raw.map((l) => l.totalProducts))].sort((p, q) => q - p);

  it('rates only the groups it needs when the first ones meet the minimum', () => {
    let calls = 0;
    const r = rankWithMinimum(raw, DEFAULT_INPUTS, 'fair', {
      prepare: (l) => {
        calls += 1;
        return rated(l, 'good');
      },
    });
    expect(r.layouts).toEqual(
      rankLayouts(
        raw.map((l) => rated(l, 'good')),
        DEFAULT_INPUTS,
      ),
    );
    expect(calls).toBeLessThan(raw.length / 2);
  });

  it('leaves out a top group that is below the minimum and says what Auto would give', () => {
    const [first, second] = counts as [number, number];
    const prepare = (l: Layout) => rated(l, l.totalProducts === first ? 'poor' : 'good');
    const r = rankWithMinimum(raw, DEFAULT_INPUTS, 'fair', { prepare });
    expect(r.belowMinimum).toBe(false);
    expect(r.layouts[0]!.layout.totalProducts).toBe(second);
    expect(r.layouts.every((x) => x.layout.totalProducts < first)).toBe(true);
    expect(r.autoBestProducts).toBe(first);
    // Scores are against the best layout that is offered.
    expect(r.layouts[0]!.score.quantity).toBeCloseTo(100, 9);
    expect(r.layouts.map((x) => x.rank)).toEqual(r.layouts.map((_, k) => k + 1));
  });

  it('Good only leaves out fair layouts that Fair or better keeps', () => {
    const [first] = counts as [number];
    const prepare = (l: Layout) => rated(l, l.totalProducts === first ? 'fair' : 'good');
    const fair = rankWithMinimum(raw, DEFAULT_INPUTS, 'fair', { prepare });
    expect(fair.layouts[0]!.layout.totalProducts).toBe(first);
    expect(fair.autoBestProducts).toBeUndefined();
    const good = rankWithMinimum(raw, DEFAULT_INPUTS, 'good', { prepare });
    expect(good.layouts[0]!.layout.totalProducts).toBeLessThan(first);
    expect(good.layouts.every((x) => x.layout.stability!.rating === 'good')).toBe(true);
    expect(good.autoBestProducts).toBe(first);
  });

  it('nothing meets the minimum: the best rating found, most products first, flagged', () => {
    const all = (rating: StabilityRating) => (l: Layout) => rated(l, rating);
    const poor = rankWithMinimum(raw, DEFAULT_INPUTS, 'fair', { prepare: all('poor') });
    expect(poor.belowMinimum).toBe(true);
    expect(poor.truncated).toBe(false);
    expect(poor.layouts).toEqual(rankLayouts(raw.map(all('poor')), DEFAULT_INPUTS));
    expect(poor.layouts).toHaveLength(5);
    // The list starts at what Auto would give, so there is nothing more to mention.
    expect(poor.autoBestProducts).toBeUndefined();

    // Good only, with fair layouts lower down: those are the most stable found.
    const [first] = counts as [number];
    const mixed = (l: Layout) => rated(l, l.totalProducts === first ? 'poor' : 'fair');
    const r = rankWithMinimum(raw, DEFAULT_INPUTS, 'good', { prepare: mixed });
    expect(r.belowMinimum).toBe(true);
    expect(r.layouts.length).toBeGreaterThan(0);
    expect(r.layouts.every((x) => x.layout.stability!.rating === 'fair')).toBe(true);
    expect(r.layouts).toEqual(
      rankLayouts(
        raw.map(mixed).filter((l) => l.stability!.rating === 'fair'),
        DEFAULT_INPUTS,
      ),
    );
    expect(r.autoBestProducts).toBe(first);
  });

  it('stops when told to, after the first group, and says the result is limited', () => {
    const [first] = counts as [number];
    let calls = 0;
    const prepare = (l: Layout) => {
      calls += 1;
      return rated(l, 'poor');
    };
    const r = rankWithMinimum(raw, DEFAULT_INPUTS, 'good', { prepare, shouldStop: () => true });
    expect(r.truncated).toBe(true);
    expect(r.belowMinimum).toBe(true);
    // The first group is always rated in full, so there is always something to show.
    expect(calls).toBe(raw.filter((l) => l.totalProducts === first).length);
    expect(r.layouts.length).toBeGreaterThan(0);
    expect(r.layouts.every((x) => x.layout.totalProducts === first)).toBe(true);
  });

  it('keeps what met the minimum before it was stopped', () => {
    const [first, second] = counts as [number, number];
    let rated2 = 0;
    const prepare = (l: Layout) => {
      if (l.totalProducts === second) rated2 += 1;
      return rated(l, l.totalProducts === first ? 'poor' : 'good');
    };
    // Stop once one layout of the second group has been rated.
    const r = rankWithMinimum(raw, DEFAULT_INPUTS, 'good', {
      prepare,
      limit: 100,
      shouldStop: () => rated2 >= 1,
    });
    expect(r.truncated).toBe(true);
    expect(r.belowMinimum).toBe(false);
    expect(r.layouts).toHaveLength(1);
    expect(r.layouts[0]!.layout.totalProducts).toBe(second);
  });

  it('handles an empty list', () => {
    expect(rankWithMinimum([], DEFAULT_INPUTS, 'good')).toEqual({
      layouts: [],
      truncated: false,
      belowMinimum: false,
    });
  });
});
