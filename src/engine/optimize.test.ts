import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, OptimizeResult, ProductAxis, WeightInputs } from '../domain/types';
import { cartonKey, generateCartonCandidates } from './packing/cartons';
import { usableFootprint, usableHeight } from './packing/geometry';
import { gridLayer } from './packing/layerSearch';
import { footprintAxes } from './packing/stacking';
import { fitsCount } from './packing/tolerance';
import { HARD_LIMIT_MS, optimize, TIME_BUDGET_MS } from './optimize';
import { computeAnalytics } from './analytics/analytics';
import { layoutWeight, trimToWeight } from './analytics/weight';
import { buildLayouts } from './packing/stacking';
import baseline from './fixtures/blankWeightBaseline.json';
import { cartonPlacements } from './packing/positions';
import { boxesOutside, overlappingPairs, PINWHEEL_INPUTS } from './packing/testSupport';
import { assertNoOverlapWithin } from './packing/overlap.testSupport';

/** Case I: 10-inch cube, no leeway or walls, max carton 20 x 20 x 10, pallet 40 x 40 x 25. */
const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

/** Products from the biggest carton on a plain grid, best over vertical axis and flat rotation. */
function plainGridBaseline(i: Inputs): number {
  const c = generateCartonCandidates(i)[0];
  if (!c) return 0;
  const { x, y } = usableFootprint(i);
  let best = 0;
  for (const v of ['L', 'W', 'H'] as ProductAxis[]) {
    const [fa, fb] = footprintAxes(v);
    const layers = fitsCount(usableHeight(i), c.outer[v]);
    for (const rotated of [false, true]) {
      const grid = gridLayer(x, y, c.outer[fa], c.outer[fb], rotated);
      best = Math.max(best, grid.count * layers * c.boxesPerCarton);
    }
  }
  return best;
}

describe('optimize', () => {
  it('picks the fewest cartons among the case I ties', () => {
    const r = optimize(CUBES);
    expect(r.emptyReason).toBeNull();
    expect(r.layouts[0]?.layout).toMatchObject({ totalProducts: 32, totalCartons: 8 });
    expect(r.layouts[0]?.layout.carton.boxesPerCarton).toBe(4);
  });

  describe('default inputs', () => {
    const r = optimize(DEFAULT_INPUTS);

    it('returns 1 to 5 ranked, distinct layouts without truncation', () => {
      expect(r.emptyReason).toBeNull();
      expect(r.truncated).toBe(false);
      expect(r.layouts.length).toBeGreaterThanOrEqual(1);
      expect(r.layouts.length).toBeLessThanOrEqual(5);
      expect(r.layouts.map((x) => x.rank)).toEqual(r.layouts.map((_, k) => k + 1));
      expect(new Set(r.layouts.map((x) => x.layout.id)).size).toBe(r.layouts.length);
      expect(r.candidatesEvaluated).toBeGreaterThan(0);
      expect(r.candidatesEvaluated).toBeLessThanOrEqual(
        generateCartonCandidates(DEFAULT_INPUTS).length,
      );
    });

    it('lists products non-increasing and no carton more than twice', () => {
      for (let k = 1; k < r.layouts.length; k++) {
        expect(r.layouts[k - 1]!.layout.totalProducts).toBeGreaterThanOrEqual(
          r.layouts[k]!.layout.totalProducts,
        );
      }
      const keys = r.layouts.map((x) => cartonKey(x.layout.carton));
      const distinct = new Set(keys);
      if (distinct.size >= 5) {
        for (const k of distinct) expect(keys.filter((x) => x === k).length).toBeLessThanOrEqual(2);
      }
    });

    it('keeps the recorded default winner', () => {
      // Recorded from a run that satisfied every invariant in this file:
      // 52 cartons of 1x1x5 (13 x 9 x 21 outer), one layer of 10 on L plus six of 7 on W.
      const winner = r.layouts[0]!.layout;
      expect(winner.totalProducts).toBe(260);
      expect(winner.totalCartons).toBe(52);
      expect(cartonKey(winner.carton)).toBe('1x1x5');
    });

    it('is deterministic', () => {
      expect(optimize(DEFAULT_INPUTS)).toEqual(r);
    });

    it('never exceeds the available volume and beats the biggest carton on a plain grid', () => {
      const winner = r.layouts[0]!.layout;
      expect(winner.totalProducts * 384).toBeLessThanOrEqual(50 * 42 * 67);
      expect(winner.totalProducts).toBeGreaterThanOrEqual(plainGridBaseline(DEFAULT_INPUTS));
    });
  });

  it('reports NO_CARTON_FITS when the product exceeds the maximum carton', () => {
    expect(
      optimize({ ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 } }),
    ).toMatchObject({
      layouts: [],
      emptyReason: 'NO_CARTON_FITS',
      candidatesEvaluated: 0,
    });
  });

  it('reports CARTON_EXCEEDS_PALLET when no carton fits the usable height', () => {
    expect(
      optimize({ ...DEFAULT_INPUTS, pallet: { length: 50, width: 42, height: 5.5 } }),
    ).toMatchObject({
      layouts: [],
      emptyReason: 'CARTON_EXCEEDS_PALLET',
    });
  });

  it('reports CARTON_EXCEEDS_PALLET without throwing when there is no usable height', () => {
    for (const height of [5, 4]) {
      expect(
        optimize({ ...DEFAULT_INPUTS, pallet: { length: 50, width: 42, height } }),
      ).toMatchObject({
        layouts: [],
        emptyReason: 'CARTON_EXCEEDS_PALLET',
      });
    }
  });

  it('finishes a tiny product in time with valid layouts', () => {
    const t0 = performance.now();
    const tiny = optimize({
      ...DEFAULT_INPUTS,
      product: { length: 1, width: 1, height: 1 },
      pallet: { length: 48, width: 40, height: 72 },
    });
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(tiny.layouts.length).toBeGreaterThan(0);
    expect(tiny.emptyReason).toBeNull();
    expect(tiny.layouts[0]!.layout.totalProducts).toBeLessThanOrEqual(48 * 40 * 67);
  });

  it('stops at the time budget, keeps the first layouts and marks the result truncated', () => {
    expect(TIME_BUDGET_MS).toBe(4000);
    let t = 0;
    const clock = () => (t += 5000);
    const r = optimize(DEFAULT_INPUTS, { now: clock, budgetMs: 4000 });
    expect(r.truncated).toBe(true);
    expect(r.candidatesEvaluated).toBe(1);
    expect(r.layouts.length).toBeGreaterThan(0);
    expect(r.emptyReason).toBeNull();
  });

  it('stays near the time budget on a very long pallet', () => {
    const t0 = performance.now();
    const r = optimize({ ...DEFAULT_INPUTS, pallet: { length: 5000, width: 42, height: 72 } });
    expect(performance.now() - t0).toBeLessThan(6000);
    expect(r.layouts.length).toBeGreaterThan(0);
    expect(r.emptyReason).toBeNull();
  }, 15000);

  describe('absurdly small products', () => {
    const cube = (n: number) => ({ length: n, width: n, height: n });
    const sevens = { ...DEFAULT_INPUTS, product: cube(0.01), boxesPerCarton: 7 };
    const bare = { ...sevens, leeway: 0, wallThickness: 0 };
    const prime = { ...DEFAULT_INPUTS, product: cube(0.005), boxesPerCarton: 999983 };

    it('returns layouts of 7 for a 0.01 in product within 10 s', () => {
      const t0 = performance.now();
      const r = optimize(sevens);
      expect(performance.now() - t0).toBeLessThan(10000);
      expect(r.layouts.length).toBeGreaterThan(0);
      expect(r.layouts.every((l) => l.layout.carton.boxesPerCarton === 7)).toBe(true);
    }, 20000);

    it('returns layouts of 7 for a 0.01 in product with no leeway or walls within 10 s', () => {
      // Thousands of possible layers per vertical axis: the mixed-stack search is the cost.
      const t0 = performance.now();
      const r = optimize(bare);
      expect(performance.now() - t0).toBeLessThan(10000);
      expect(r.layouts.length).toBeGreaterThan(0);
      expect(r.emptyReason).toBeNull();
    }, 20000);

    it('names the nearest counts for a prime count of 0.005 in boxes within 10 s', () => {
      const t0 = performance.now();
      const r = optimize(prime);
      expect(performance.now() - t0).toBeLessThan(10000);
      expect(r.emptyReason).toBe('NO_CARTON_WITH_COUNT');
      expect(r.nearestCounts).toEqual({ below: 999978, above: 999984 });
      expect(r.truncated).toBe(false);
    }, 20000);

    it('stops the nearest-count search at the hard limit and marks the result truncated', () => {
      let t = 0;
      const r = optimize(prime, { now: () => (t += HARD_LIMIT_MS) });
      expect(r).toMatchObject({
        layouts: [],
        emptyReason: 'NO_CARTON_WITH_COUNT',
        truncated: true,
      });
      expect('nearestCounts' in r).toBe(false);
    });

    it('stops before the first layout once past the hard limit, keeping what it found', () => {
      let t = 0;
      const r = optimize(bare, { now: () => (t += HARD_LIMIT_MS) });
      expect(r.truncated).toBe(true);
      expect(r.candidatesEvaluated).toBe(1);
      expect(r.layouts.length).toBeGreaterThan(0);
      expect(r.emptyReason).toBeNull();
    });
  });

  describe('desired boxes per carton', () => {
    it('gives the Round 1 result when blank', () => {
      const blank = optimize({ ...DEFAULT_INPUTS, boxesPerCarton: null });
      expect(blank).toEqual(optimize(DEFAULT_INPUTS));
      expect(blank.layouts[0]!.layout).toMatchObject({ totalProducts: 260, totalCartons: 52 });
      expect('nearestCounts' in blank).toBe(false);
    });

    const six = { ...DEFAULT_INPUTS, boxesPerCarton: 6 };
    const r6 = optimize(six);

    it('uses only cartons of exactly N boxes', () => {
      expect(r6.emptyReason).toBeNull();
      expect(r6.truncated).toBe(false);
      expect(r6.layouts.length).toBeGreaterThan(0);
      expect(r6.layouts.every((l) => l.layout.carton.boxesPerCarton === 6)).toBe(true);
      expect(r6.layouts.every((l) => l.layout.totalProducts === 6 * l.layout.totalCartons)).toBe(
        true,
      );
      expect('nearestCounts' in r6).toBe(false);
    });

    it('places every carton of N inside the usable space without overlaps', () => {
      const { x, y } = usableFootprint(six);
      const size = { x, y, z: usableHeight(six) };
      for (const { layout } of r6.layouts) {
        const placed = cartonPlacements(layout, six);
        expect(placed).toHaveLength(layout.totalCartons);
        expect(overlappingPairs(placed)).toBe(0);
        expect(boxesOutside(placed, size)).toBe(0);
      }
    });

    it('reports NO_CARTON_WITH_COUNT with the nearest achievable counts', () => {
      expect(optimize({ ...DEFAULT_INPUTS, boxesPerCarton: 7 })).toEqual({
        layouts: [],
        candidatesEvaluated: 0,
        emptyReason: 'NO_CARTON_WITH_COUNT',
        truncated: false,
        nearestCounts: { below: 6, above: 8 },
      });
      expect(optimize({ ...DEFAULT_INPUTS, boxesPerCarton: 50 })).toMatchObject({
        layouts: [],
        emptyReason: 'NO_CARTON_WITH_COUNT',
        nearestCounts: { below: 10, above: null },
      });
    });

    it('reports exact nearest counts quickly for a tiny product', () => {
      const t0 = performance.now();
      const r = optimize({
        ...DEFAULT_INPUTS,
        product: { length: 0.2, width: 0.2, height: 0.2 },
        boxesPerCarton: 1009,
      });
      expect(performance.now() - t0).toBeLessThan(300);
      expect(r).toEqual({
        layouts: [],
        candidatesEvaluated: 0,
        emptyReason: 'NO_CARTON_WITH_COUNT',
        truncated: false,
        nearestCounts: { below: 1008, above: 1010 },
      });
    });

    it('reports NO_CARTON_FITS when no carton fits at all', () => {
      const r = optimize({
        ...DEFAULT_INPUTS,
        product: { length: 30, width: 8, height: 4 },
        boxesPerCarton: 2,
      });
      expect(r).toMatchObject({ layouts: [], emptyReason: 'NO_CARTON_FITS' });
      expect('nearestCounts' in r).toBe(false);
    });

    it('reports CARTON_EXCEEDS_PALLET when cartons of N exist but none can be placed', () => {
      const r = optimize({
        ...DEFAULT_INPUTS,
        pallet: { length: 50, width: 42, height: 5.5 },
        boxesPerCarton: 6,
      });
      expect(r).toMatchObject({ layouts: [], emptyReason: 'CARTON_EXCEEDS_PALLET' });
      expect('nearestCounts' in r).toBe(false);
    });
  });

  it('marks the result truncated when the candidate list was capped', () => {
    const r = optimize(
      { ...DEFAULT_INPUTS, product: { length: 0.2, width: 0.2, height: 0.2 } },
      { now: () => 0 },
    );
    expect(r.truncated).toBe(true);
    expect(r.layouts.length).toBeGreaterThan(0);
  });

  describe('weight', () => {
    const MIXED: Inputs = {
      ...DEFAULT_INPUTS,
      overhang: 2,
      targetQuantity: 150,
      boxesPerCarton: 6,
      rotationMode: 'upright',
    };
    const weighed = (i: Inputs, w: Partial<WeightInputs>): Inputs => ({
      ...i,
      weights: { ...i.weights, ...w },
    });

    /** The most products of any layout of any carton, each trimmed to the maximum on its own. */
    function bestTrimmedProducts(i: Inputs): number {
      let best = 0;
      for (const c of generateCartonCandidates(i)) {
        for (const l of buildLayouts(c, i, new Map())) {
          const t = trimToWeight(l, i);
          if (t) best = Math.max(best, t.totalProducts);
        }
      }
      return best;
    }

    it('gives the results recorded before weight existed when the weights are blank', () => {
      // Recorded at 25f2d6d, before weights were part of the inputs.
      const recorded = baseline as unknown as Record<string, OptimizeResult>;
      expect(DEFAULT_INPUTS.weights).toEqual({
        productBox: null,
        maxPallet: null,
        emptyCarton: 0,
        pallet: 40,
      });
      expect(optimize(DEFAULT_INPUTS)).toEqual(recorded.default);
      expect(optimize(CUBES)).toEqual(recorded.cubes);
      expect(optimize(MIXED)).toEqual(recorded.overhangTargetSix);
      // A maximum alone (box weight blank) is ignored too.
      expect(optimize(weighed(DEFAULT_INPUTS, { maxPallet: 100 }))).toEqual(recorded.default);
      // So is a box weight with no maximum.
      expect(optimize(weighed(DEFAULT_INPUTS, { productBox: 3 })).layouts).toEqual(
        recorded.default!.layouts,
      );
    });

    it('never returns a layout over the maximum, and ranks the most products first', () => {
      const i = weighed(DEFAULT_INPUTS, { productBox: 2, emptyCarton: 1, maxPallet: 450 });
      const r = optimize(i);
      expect(r.emptyReason).toBeNull();
      expect(r.layouts.length).toBeGreaterThan(0);
      for (const { layout } of r.layouts) {
        expect(layoutWeight(layout, i)!.total).toBeLessThanOrEqual(450);
        expect(layout.layers.length).toBeGreaterThan(0);
      }
      expect(r.layouts[0]!.layout.totalProducts).toBe(bestTrimmedProducts(i));
      // Unlimited, the default winner holds 260 boxes; 450 lb cannot carry that.
      expect(r.layouts[0]!.layout.totalProducts).toBeLessThan(260);
      expect(r.layouts.some((x) => x.layout.weightTrim)).toBe(true);
      expect(new Set(r.layouts.map((x) => x.layout.id)).size).toBe(r.layouts.length);
    });

    it('trims before keeping the best, so a carton with lighter layers is not lost', () => {
      // Product 6 x 4 x 3 in at 5 lb, empty carton 1 lb, pallet 40 lb, maximum 1600 lb.
      const i = weighed(
        { ...DEFAULT_INPUTS, product: { length: 6, width: 4, height: 3 } },
        { productBox: 5, emptyCarton: 1, maxPallet: 1600 },
      );
      // Without a limit the winner is a 30-box carton (2 x 5 x 3) in layers of 10 cartons:
      // 1500 boxes. A layer weighs 10 x (1 + 30 x 5) = 1510 lb, so under 1600 lb it keeps one
      // layer: 40 + 1510 = 1550 lb, 300 boxes, with 50 lb unused.
      const free = optimize({ ...i, weights: DEFAULT_INPUTS.weights }).layouts[0]!.layout;
      expect(free.carton.boxesPerCarton).toBe(30);
      expect(free.totalProducts).toBe(1500);
      expect(trimToWeight(free, i)!.totalProducts).toBe(300);
      // An 8-box carton (2 x 4 x 1) lays 38 cartons in a layer: 304 boxes at
      // 40 + 38 x (1 + 8 x 5) = 1598 lb. Its untrimmed total is far below the 30-box layouts',
      // so it survives only if every layout is trimmed before the keep-best list counts it.
      const r = optimize(i);
      const winner = r.layouts[0]!.layout;
      expect(winner.carton.boxesPerCarton).toBe(8);
      expect(winner.totalProducts).toBe(304);
      expect(winner.layers.map((l) => l.cartonCount)).toEqual([38]);
      expect(layoutWeight(winner, i)!.total).toBe(1598);
      expect(winner.totalProducts).toBe(bestTrimmedProducts(i));
    });

    it('reports OVER_WEIGHT when one layer is already over the maximum', () => {
      // The lightest layer of any carton holds several boxes of 50 lb.
      const r = optimize(weighed(DEFAULT_INPUTS, { productBox: 50, maxPallet: 100 }));
      expect(r.layouts).toEqual([]);
      expect(r.emptyReason).toBe('OVER_WEIGHT');
      expect(r.candidatesEvaluated).toBeGreaterThan(0);
    });

    describe('a very small product, whose carton list is capped', () => {
      // 0.5 in cubes at 0.1 lb on a 40 lb pallet. The search never times out (clock fixed).
      const tiny = (maxPallet: number) =>
        weighed(
          { ...DEFAULT_INPUTS, product: { length: 0.5, width: 0.5, height: 0.5 } },
          { productBox: 0.1, maxPallet },
        );
      const ROUNDING = 1 + 1e-9; // "never over" holds up to the weight tolerance

      it('finds a layout under 400 lb with at least the 3584 boxes of 4-box cartons', () => {
        const i = tiny(400);
        const r = optimize(i, { now: () => 0 });
        expect(r.emptyReason).toBeNull();
        const best = r.layouts[0]!.layout;
        expect(layoutWeight(best, i)!.total).toBeLessThanOrEqual(400 * ROUNDING);
        // With exactly 4 boxes per carton the optimizer finds 3584 boxes at 398.4 lb.
        const four = optimize({ ...i, boxesPerCarton: 4 }).layouts[0]!.layout;
        expect(four.totalProducts).toBe(3584);
        expect(best.totalProducts).toBeGreaterThanOrEqual(3584);
      });

      it('reaches the 9600 boxes 1000 lb allows', () => {
        const i = tiny(1000);
        const best = optimize(i, { now: () => 0 }).layouts[0]!.layout;
        expect(layoutWeight(best, i)!.total).toBeLessThanOrEqual(1000 * ROUNDING);
        // (1000 - 40) / 0.1 = 9600 boxes at most.
        expect(best.totalProducts).toBe(9600);
      });
    });

    it('says the search was limited, not that nothing fits, when it stopped early', () => {
      // One box in one carton (40 + 50 = 90 lb) is under 100 lb, so a lighter layout is not
      // ruled out; the clock passes the hard limit after the first carton.
      let t = 0;
      const r = optimize(weighed(DEFAULT_INPUTS, { productBox: 50, maxPallet: 100 }), {
        now: () => (t += HARD_LIMIT_MS),
      });
      expect(r).toMatchObject({
        layouts: [],
        emptyReason: 'WEIGHT_SEARCH_LIMITED',
        truncated: true,
        candidatesEvaluated: 1,
      });
    });

    it('reports OVER_WEIGHT even when stopped early once one box on the pallet is over', () => {
      let t = 0;
      const r = optimize(weighed(DEFAULT_INPUTS, { productBox: 70, maxPallet: 100 }), {
        now: () => (t += HARD_LIMIT_MS),
      });
      expect(r).toMatchObject({ layouts: [], emptyReason: 'OVER_WEIGHT', truncated: true });
    });

    it('skips cartons too heavy for one carton on the pallet, without waiting', () => {
      // 40 lb pallet + any carton of 70 lb boxes > 100 lb: every carton is skipped at once.
      const heavy = weighed(DEFAULT_INPUTS, { productBox: 70, maxPallet: 100 });
      const r = optimize(heavy, { now: () => 0 });
      expect(r).toMatchObject({ layouts: [], emptyReason: 'OVER_WEIGHT', truncated: false });
      expect(r.candidatesEvaluated).toBe(generateCartonCandidates(heavy).length);
      const t0 = performance.now();
      const tinyHeavy = optimize(
        weighed(
          { ...DEFAULT_INPUTS, product: { length: 0.5, width: 0.5, height: 0.5 } },
          { productBox: 70, maxPallet: 100 },
        ),
      );
      expect(performance.now() - t0).toBeLessThan(HARD_LIMIT_MS / 2);
      expect(tinyHeavy).toMatchObject({ layouts: [], emptyReason: 'OVER_WEIGHT' });
      // Skipping changes no answer: under 1000 lb with 30 lb boxes, cartons of more than 32
      // boxes are skipped, and the winner is still the best of every carton trimmed alone.
      const some = weighed(DEFAULT_INPUTS, { productBox: 30, maxPallet: 1000 });
      const best = optimize(some).layouts[0]!.layout;
      expect(best.totalProducts).toBeGreaterThan(0);
      expect(best.totalProducts).toBe(bestTrimmedProducts(some));
    });

    it('keeps the other empty reasons ahead of OVER_WEIGHT', () => {
      const r = optimize(
        weighed(
          { ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 } },
          {
            productBox: 50,
            maxPallet: 100,
          },
        ),
      );
      expect(r.emptyReason).toBe('NO_CARTON_FITS');
    });

    it('works with a target quantity', () => {
      const limit = { productBox: 2, emptyCarton: 1, maxPallet: 300 };
      // Unlimited, 150 boxes is well within the 260 of the winner.
      const free = { ...DEFAULT_INPUTS, targetQuantity: 150 };
      expect(computeAnalytics(optimize(free).layouts[0]!.layout, free).target.status).toBe(
        'exceeded',
      );
      // Under 300 lb the winner is two layers of 6 ten-box cartons at 21 lb: 40 + 12 x 21 = 292 lb.
      const over = weighed(free, limit);
      const best = optimize(over).layouts[0]!.layout;
      expect(best.totalProducts).toBe(120);
      expect(best.weightTrim).toEqual({ layersRemoved: 1 });
      expect(computeAnalytics(best, over).target).toMatchObject({
        status: 'notAchievable',
        maxPossible: 120,
      });
      const under = weighed({ ...DEFAULT_INPUTS, targetQuantity: 100 }, limit);
      expect(computeAnalytics(optimize(under).layouts[0]!.layout, under).target).toMatchObject({
        status: 'exceeded',
        maxPossible: 120,
        cartonsNeeded: 10,
      });
    });

    it('works with an exact number of boxes per carton', () => {
      const i = weighed(
        { ...DEFAULT_INPUTS, boxesPerCarton: 6 },
        { productBox: 2, emptyCarton: 1, maxPallet: 400 },
      );
      const r = optimize(i);
      expect(r.emptyReason).toBeNull();
      expect(r.layouts.length).toBeGreaterThan(0);
      for (const { layout } of r.layouts) {
        expect(layout.carton.boxesPerCarton).toBe(6);
        expect(layoutWeight(layout, i)!.total).toBeLessThanOrEqual(400);
      }
      expect(r.layouts[0]!.layout.totalProducts).toBe(bestTrimmedProducts(i));
    });
  });

  describe('pinwheel layers', () => {
    const hasPinwheel = (l: { layers: { kind?: string }[] }) =>
      l.layers.some((layer) => layer.kind === 'pinwheel');

    /** The verifier over every layer of every returned layout, and the 3D placements. */
    function expectValidResult(i: Inputs, r: OptimizeResult): void {
      const { x, y } = usableFootprint(i);
      for (const { layout } of r.layouts) {
        for (const layer of layout.layers) {
          const [fa, fb] = footprintAxes(layer.vertical);
          assertNoOverlapWithin(
            layer.blocks,
            layout.carton.outer[fa],
            layout.carton.outer[fb],
            x,
            y,
          );
        }
        const placed = cartonPlacements(layout, i);
        expect(boxesOutside(placed, { x, y, z: usableHeight(i) })).toBe(0);
        expect(overlappingPairs(placed)).toBe(0);
      }
    }

    it('puts three pinwheel layers first in the pinned case: 30 boxes, where straight cuts gave 27', () => {
      const r = optimize(PINWHEEL_INPUTS);
      const winner = r.layouts[0]!.layout;
      expect(winner.totalProducts).toBe(30);
      expect(winner.layers.map((l) => [l.vertical, l.cartonCount, l.kind])).toEqual([
        ['H', 10, 'pinwheel'],
        ['H', 10, 'pinwheel'],
        ['H', 10, 'pinwheel'],
      ]);
      expect(r.layouts[1]!.layout.totalProducts).toBe(27);
      expectValidResult(PINWHEEL_INPUTS, r);
    });

    it('still uses the pinwheel with an exact number of boxes per carton', () => {
      // Two 8.25 x 10.5 x 18 boxes side by side make the same 16.5 x 10.5 x 18 carton.
      const i: Inputs = {
        ...PINWHEEL_INPUTS,
        product: { length: 8.25, width: 10.5, height: 18 },
        boxesPerCarton: 2,
      };
      const r = optimize(i);
      const winner = r.layouts[0]!.layout;
      expect(winner.carton.boxesPerCarton).toBe(2);
      expect(hasPinwheel(winner)).toBe(true);
      expect(winner.totalProducts).toBe(60);
      expectValidResult(i, r);
    });

    it('falls back to the straight-cut layer when a pinwheel layer is too heavy', () => {
      // 10 lb a carton: a pinwheel layer of 10 weighs 100 lb, a straight-cut layer of 9, 90 lb.
      // Under 130 lb with a 40 lb pallet only the straight-cut layer fits. Upright, so the
      // only other layers are the plain grids of 6 and 8.
      const i: Inputs = {
        ...PINWHEEL_INPUTS,
        rotationMode: 'upright',
        weights: { ...PINWHEEL_INPUTS.weights, productBox: 10, maxPallet: 130 },
      };
      const r = optimize(i);
      expect(r.layouts[0]!.layout.totalProducts).toBe(9);
      expect(hasPinwheel(r.layouts[0]!.layout)).toBe(false);
      expectValidResult(i, r);
    });

    it('gives valid layers in every layout of the optimizer fixtures', () => {
      for (const i of [
        DEFAULT_INPUTS,
        CUBES,
        PINWHEEL_INPUTS,
        { ...PINWHEEL_INPUTS, overhang: 2, keepCartonsUpright: true },
        { ...DEFAULT_INPUTS, overhang: 2, targetQuantity: 150, boxesPerCarton: 6 },
        { ...DEFAULT_INPUTS, product: { length: 6, width: 4, height: 3 } },
      ]) {
        const r = optimize(i);
        expect(r.layouts.length).toBeGreaterThan(0);
        expectValidResult(i, r);
      }
    });
  });
});
