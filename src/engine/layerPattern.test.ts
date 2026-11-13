import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type {
  Inputs,
  LayerPatternPref,
  Layout,
  MinStability,
  OptimizeResult,
} from '../domain/types';
import { NAMED_CASES, randomCases } from './autoBaseline.testSupport';
import { optimize } from './optimize';
import { generateCartonCandidates } from './packing/cartons';
import { usableFootprint } from './packing/geometry';
import { assertNoOverlapWithin, lineMissingEveryCarton } from './packing/overlap.testSupport';
import { searchLayer } from './packing/layerSearch';
import { hasThroughCut } from './packing/pinwheel';
import {
  bestLayer,
  buildLayouts,
  footprintAxes,
  preferredPinwheel,
  type LayerCache,
  type PinwheelSearchTime,
} from './packing/stacking';
import { PINWHEEL_INPUTS } from './packing/testSupport';
import { meetsMinimum } from './ranking/rank';

const withPattern = (i: object, layerPattern: LayerPatternPref, minStability?: MinStability) =>
  ({ ...i, layerPattern, ...(minStability ? { minStability } : {}) }) as Inputs;
const isPinwheel = (l: Layout) => l.layers.some((layer) => layer.kind === 'pinwheel');
const allPinwheel = (l: Layout) => l.layers.every((layer) => layer.kind === 'pinwheel');
const products = (r: OptimizeResult) => r.layouts.map((x) => x.layout.totalProducts);
const patterns = (r: OptimizeResult) =>
  r.layouts.map((x) => (isPinwheel(x.layout) ? 'pinwheel' : 'straight'));
const ratings = (r: OptimizeResult) => r.layouts.map((x) => x.layout.stability?.rating);

/** The pinned pinwheel pallet (48 x 40 x 60, no leeway or walls) with another single-box carton. */
const single = (length: number, width: number, height: number): Inputs => ({
  ...PINWHEEL_INPUTS,
  product: { length, width, height },
  maxCarton: { length, width, height },
});
/** A pinwheel of ten 18 x 10 cartons ties the straight-cut layer, and rates below it. */
const TIE = single(18, 10, 10);
/** The best pinwheel of 14 x 8 cartons holds fewer than straight cuts. */
const FEWER = single(14, 8, 6);
const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};
/** One cube to a carton: every footprint is square, so no pinwheel exists. */
const SQUARE: Inputs = { ...CUBES, maxCarton: { length: 10, width: 10, height: 10 } };

/** Generous: these runs take a few seconds alone and several times that on a loaded machine. */
const HEAVY = 30_000;

/**
 * No pinwheel layer listed that ties the straight-cut count or holds fewer has a straight line
 * right across it that passes through no carton (judged on the carton rectangles, not by the
 * engine's own check). A pinwheel layer of more cartons than straight cuts hold is Auto's own
 * and stays as Auto lays it: no straight-cut layer equals it, whatever line crosses it.
 */
function expectTruePinwheels(i: Inputs, r: OptimizeResult): void {
  const { x, y } = usableFootprint(i);
  for (const { layout } of r.layouts) {
    for (const layer of layout.layers) {
      if (layer.kind !== 'pinwheel') continue;
      const [fa, fb] = footprintAxes(layer.vertical);
      const [a, b] = [layout.carton.outer[fa], layout.carton.outer[fb]];
      if (layer.cartonCount > searchLayer(x, y, a, b).count) continue;
      const line = lineMissingEveryCarton(layer.blocks, a, b);
      expect(line, `${layout.id}: a line across the layer misses every carton`).toBeNull();
    }
  }
}

/** Every layer of every layout listed passes the overlap verifier, inside the usable area. */
function expectNoOverlap(i: Inputs, r: OptimizeResult): void {
  const { x, y } = usableFootprint(i);
  for (const { layout } of r.layouts) {
    for (const layer of layout.layers) {
      const [fa, fb] = footprintAxes(layer.vertical);
      assertNoOverlapWithin(layer.blocks, layout.carton.outer[fa], layout.carton.outer[fb], x, y);
    }
  }
}

describe('layer pattern setting (Round 5 spec 5)', () => {
  describe('Auto', () => {
    it('throws a tying pinwheel away, as before', () => {
      const r = optimize(withPattern(TIE, 'auto'));
      expect(products(r)).toEqual([50, 48, 40]);
      expect(patterns(r)).toEqual(['straight', 'straight', 'straight']);
      expect(r).toEqual(optimize(TIE));
      expect(r).not.toHaveProperty('patternFallback');
    });
  });

  describe('Prefer pinwheel', () => {
    const auto = optimize(TIE);
    const r = optimize(withPattern(TIE, 'preferPinwheel'));

    it('keeps a pinwheel that ties the straight-cut count and ranks it first', () => {
      expect(products(r)).toEqual([50, 50, 48, 40]);
      expect(patterns(r)).toEqual(['pinwheel', 'straight', 'straight', 'straight']);
      expect(r.truncated).toBe(false);
      expect(r).not.toHaveProperty('autoBestProducts');
      expect(r).not.toHaveProperty('patternFallback');
      expectNoOverlap(TIE, r);
    });

    it('ranks the pinwheel before a better-rated straight-cut layout, and says why', () => {
      expect(ratings(auto)).toEqual(['good', 'fair', 'fair']);
      expect(ratings(r)).toEqual(['fair', 'good', 'fair', 'fair']);
      expect(r.layouts[0]!.explanation).toBe(
        'Layout #1 ranked above Layout #2 because it uses pinwheel layers, which you asked to prefer, at the same quantity.',
      );
      // Below the pinwheel, the order and the reasons are Auto's.
      expect(r.layouts[1]!.explanation).toContain(
        'Layout #2 ranked above Layout #3 because it fits 2 additional units',
      );
    });

    it('still lists the straight-cut alternative below, as Auto ranks it', () => {
      expect(r.layouts.slice(1).map((x) => x.layout)).toEqual(auto.layouts.map((x) => x.layout));
      // The pinwheel's own straight-cut alternative: the same carton, axis and layer counts.
      const pinwheel = r.layouts[0]!.layout;
      const straight = r.layouts[1]!.layout;
      expect(isPinwheel(straight)).toBe(false);
      expect(straight.carton).toEqual(pinwheel.carton);
      expect(straight.layers.map((l) => [l.vertical, l.cartonCount])).toEqual(
        pinwheel.layers.map((l) => [l.vertical, l.cartonCount]),
      );
      expect(allPinwheel(pinwheel)).toBe(true);
    });

    it('changes nothing when the pinwheel already holds more', () => {
      expect(optimize(withPattern(PINWHEEL_INPUTS, 'preferPinwheel'))).toEqual(
        optimize(PINWHEEL_INPUTS),
      );
    });

    it('box count still comes first: a straight-cut layout with more stays on top', () => {
      const i = { ...PINWHEEL_INPUTS, overhang: 2, keepCartonsUpright: true };
      const p = optimize(withPattern(i, 'preferPinwheel'));
      expect(products(p)[0]).toBe(36);
      expect(patterns(p)[0]).toBe('straight');
    });
  });

  describe('Pinwheel only', () => {
    it('lists pinwheel layouts alone', () => {
      const r = optimize(withPattern(PINWHEEL_INPUTS, 'pinwheelOnly'));
      expect(products(r)).toEqual([30, 24, 20]);
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      expect(r.layouts.map((x) => x.rank)).toEqual([1, 2, 3]);
      expect(r.layouts[0]!.layout).toEqual(optimize(PINWHEEL_INPUTS).layouts[0]!.layout);
      expect(r).not.toHaveProperty('autoBestProducts');
      expect(r).not.toHaveProperty('patternFallback');
      expect(r.truncated).toBe(false);
    });

    it('keeps the best pinwheel even when straight cuts hold more, and says what Auto gives', () => {
      const auto = optimize(FEWER);
      expect(products(auto)[0]).toBe(150);
      expect(patterns(auto)[0]).toBe('straight');
      const r = optimize(withPattern(FEWER, 'pinwheelOnly'));
      // (The first release listed 144 here, in a layer a straight line divided.)
      expect(products(r)).toEqual([141, 135, 126, 108]);
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      expect(r.autoBestProducts).toBe(150);
      expect(r.patternFallback).toBeUndefined();
      // Scored against the best layout listed.
      expect(r.layouts[0]!.score.quantity).toBeCloseTo(100, 9);
      expectNoOverlap(FEWER, r);
    });

    it('no pinwheel exists (square cartons): the Auto result, marked as the fallback', () => {
      const r = optimize(withPattern(SQUARE, 'pinwheelOnly'));
      expect(r).toEqual({ ...optimize(SQUARE), patternFallback: true });
      expect(r.layouts.some((x) => isPinwheel(x.layout))).toBe(false);
      expect(r).not.toHaveProperty('autoBestProducts');
      expect(r).not.toHaveProperty('pinwheelOverWeight');
    });

    it('cartons of two cubes: four of them round a hole, which the first release missed', () => {
      const r = optimize(withPattern(CUBES, 'pinwheelOnly'));
      expect(r).not.toHaveProperty('patternFallback');
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      expectNoOverlap(CUBES, r);
      expectTruePinwheels(CUBES, r);
    });

    it('the largest pinwheel is too heavy: a pinwheel of fewer cartons that fits the weight', () => {
      // Ten 10 lb cartons and the 40 lb pallet are over 130 lb; nine cartons are at it.
      const i: Inputs = {
        ...PINWHEEL_INPUTS,
        rotationMode: 'upright',
        weights: { ...PINWHEEL_INPUTS.weights, productBox: 10, maxPallet: 130 },
      };
      const r = optimize(withPattern(i, 'pinwheelOnly'));
      expect(r.patternFallback).toBeUndefined();
      expect(r.pinwheelOverWeight).toBeUndefined();
      expect(r.truncated).toBe(false);
      expect(r.layouts.length).toBeGreaterThan(0);
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      // The largest true pinwheel of at most nine cartons holds eight.
      expect(products(r)[0]).toBe(8);
      expect(r.layouts.every((x) => x.layout.totalProducts * 10 + 40 <= 130)).toBe(true);
      // Auto lays nine by straight cuts.
      expect(r.autoBestProducts).toBe(9);
      expectNoOverlap(i, r);
      expectTruePinwheels(i, r);
    });

    it('pinwheels exist but the weight allows none: the fallback says so', () => {
      // 30 x 20 cartons on 50 x 50: four in a pinwheel, three by straight cuts. 70 lb leaves
      // room for three 10 lb cartons, and no pinwheel has fewer than four.
      const i: Inputs = {
        ...DEFAULT_INPUTS,
        pallet: { length: 50, width: 50, height: 30 },
        product: { length: 30, width: 20, height: 10 },
        maxCarton: { length: 30, width: 20, height: 10 },
        leeway: 0,
        wallThickness: 0,
        rotationMode: 'upright',
        weights: { productBox: 10, emptyCarton: 0, pallet: 40, maxPallet: 70 },
      };
      const auto = optimize(i);
      expect(auto.layouts.length).toBeGreaterThan(0);
      expect(optimize(withPattern(i, 'pinwheelOnly'))).toEqual({
        ...auto,
        patternFallback: true,
        pinwheelOverWeight: true,
      });
      // Without pinwheels of any weight, nothing is said of weight.
      const cubes = { ...SQUARE, weights: { ...SQUARE.weights, productBox: 1, maxPallet: 60 } };
      const r = optimize(withPattern(cubes, 'pinwheelOnly'));
      expect(r.patternFallback).toBe(true);
      expect(r.pinwheelOverWeight).toBeUndefined();
    });

    it('lists a pinwheel that fits the weight when no straight-cut layout does', () => {
      // Straight cuts lay six cartons (100 lb with the pallet); the pinwheel of four is 80 lb.
      const i: Inputs = {
        ...DEFAULT_INPUTS,
        pallet: { length: 44, width: 36, height: 30 },
        product: { length: 17.5, width: 11.5, height: 12 },
        maxCarton: { length: 17.5, width: 11.5, height: 12 },
        leeway: 0,
        wallThickness: 0,
        rotationMode: 'upright',
        keepCartonsUpright: true,
        weights: { productBox: 10, emptyCarton: 0, pallet: 40, maxPallet: 80 },
      };
      expect(optimize(i).emptyReason).toBe('OVER_WEIGHT');
      const r = optimize(withPattern(i, 'pinwheelOnly'));
      expect(r.emptyReason).toBeNull();
      expect(products(r)).toEqual([4]);
      expect(allPinwheel(r.layouts[0]!.layout)).toBe(true);
      expect(r).not.toHaveProperty('patternFallback');
      expect(r).not.toHaveProperty('autoBestProducts');
      expect(r.truncated).toBe(false);
      expectNoOverlap(i, r);
      expectTruePinwheels(i, r);
    });

    it('finds the classic four-carton pinwheel on a pallet that holds no larger one', () => {
      const i: Inputs = {
        ...DEFAULT_INPUTS,
        pallet: { length: 32, width: 35, height: 40 },
        product: { length: 15, width: 7.5, height: 10 },
        maxCarton: { length: 15, width: 7.5, height: 10 },
        leeway: 0,
        wallThickness: 0,
        rotationMode: 'upright',
      };
      const r = optimize(withPattern(i, 'pinwheelOnly'));
      expect(r).not.toHaveProperty('patternFallback');
      expect(r.layouts.length).toBeGreaterThan(0);
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      expect(r.layouts[0]!.layout.layers[0]!.cartonCount).toBe(4);
      expectNoOverlap(i, r);
      expectTruePinwheels(i, r);
    });

    it('lists no layer that a straight line cuts right across', () => {
      // The first release listed 48 boxes here in a "pinwheel" that the line x = 21 divided:
      // a seam inside one block in line with the edges of the others.
      const i: Inputs = {
        ...DEFAULT_INPUTS,
        pallet: { length: 44, width: 32, height: 45 },
        product: { length: 10, width: 6.5, height: 10 },
        maxCarton: { length: 31.5, width: 22, height: 22 },
        leeway: 0.5,
        rotationMode: 'upright',
        weights: { ...DEFAULT_INPUTS.weights, productBox: 3, maxPallet: 900 },
      };
      for (const p of ['pinwheelOnly', 'preferPinwheel'] as const) {
        const r = optimize(withPattern(i, p));
        expect(r.layouts.length).toBeGreaterThan(0);
        expectNoOverlap(i, r);
        expectTruePinwheels(i, r);
      }
    });

    it('keeps the empty reasons, unmarked', () => {
      const i = { ...DEFAULT_INPUTS, product: { length: 30, width: 30, height: 30 } };
      for (const p of ['preferPinwheel', 'pinwheelOnly'] as const) {
        expect(optimize(withPattern(i, p))).toEqual(optimize(i));
      }
    });
  });

  describe('the minimum stability applies after the layer pattern', () => {
    it('Prefer pinwheel with Good only: the fair pinwheel is left out, the good layout leads', () => {
      const r = optimize(withPattern(TIE, 'preferPinwheel', 'good'));
      expect(products(r)).toEqual([50]);
      expect(patterns(r)).toEqual(['straight']);
      expect(ratings(r)).toEqual(['good']);
      expect(r.belowMinimum).toBeUndefined();
      expect(r.autoBestProducts).toBeUndefined();
    });

    it('Prefer pinwheel with Fair or better: both qualify, the pinwheel leads', () => {
      const r = optimize(withPattern(TIE, 'preferPinwheel', 'fair'));
      expect(r).toEqual(optimize(withPattern(TIE, 'preferPinwheel')));
    });

    it('Pinwheel only with Good only: good pinwheel layouts, and what Auto would give', () => {
      const only = optimize(withPattern(FEWER, 'pinwheelOnly'));
      expect(ratings(only)).toEqual(['fair', 'good', 'good', 'fair']);
      const r = optimize(withPattern(FEWER, 'pinwheelOnly', 'good'));
      expect(products(r)).toEqual([135, 126]);
      expect(ratings(r)).toEqual(['good', 'good']);
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      expect(r.autoBestProducts).toBe(150);
      expect(r.belowMinimum).toBeUndefined();
    });

    it('says what Auto would give as layer pattern Auto and minimum Auto give it', () => {
      // The pinwheel layouts, before the minimum leaves some out, hold more than Auto lists
      // first: the note must still name what Auto gives, not the best pinwheel left out.
      const i: Inputs = {
        ...DEFAULT_INPUTS,
        pallet: { length: 28, width: 36, height: 72 },
        product: { length: 8.5, width: 6, height: 2 },
        maxCarton: { length: 43, width: 6.5, height: 12.5 },
        boxesPerCarton: 5,
        targetQuantity: 80,
        leeway: 0,
        wallThickness: 0.25,
        rotationMode: 'full',
        weights: { productBox: 2, emptyCarton: 1, pallet: 40, maxPallet: 200 },
      };
      const auto = optimize(withPattern(i, 'auto', 'auto'));
      expect(products(auto)[0]).toBe(65);
      for (const m of ['auto', 'fair', 'good'] as const) {
        for (const p of ['preferPinwheel', 'pinwheelOnly'] as const) {
          const r = optimize(withPattern(i, p, m));
          const shown = products(r)[0]!;
          expect(r.autoBestProducts, `${p}, ${m}`).toBe(shown < 65 ? 65 : undefined);
        }
      }
      const r = optimize(withPattern(i, 'pinwheelOnly', 'good'));
      expect(products(r)[0]).toBeLessThan(65);
      expect(r.autoBestProducts).toBe(65);
    });

    it('Pinwheel only where no pinwheel reaches the minimum: pinwheels still, flagged', () => {
      // Every layout of the pinned pinwheel case is fair.
      const r = optimize(withPattern(PINWHEEL_INPUTS, 'pinwheelOnly', 'good'));
      expect(r.belowMinimum).toBe(true);
      expect(r.patternFallback).toBeUndefined();
      expect(r.layouts).toEqual(optimize(withPattern(PINWHEEL_INPUTS, 'pinwheelOnly')).layouts);
    });

    it('the fallback is filtered by the minimum too', () => {
      const good = optimize(withPattern(SQUARE, 'pinwheelOnly', 'good'));
      expect(good).toEqual({
        ...optimize({ ...SQUARE, minStability: 'good' }),
        patternFallback: true,
      });
    });
  });

  describe('search cost', () => {
    it('the further pinwheel searches stop when their time is spent, and only then say so', () => {
      const c = generateCartonCandidates(TIE)[0]!;
      const search = (time: PinwheelSearchTime) => {
        const cache: LayerCache = new Map();
        bestLayer(c, 'H', TIE, cache);
        return preferredPinwheel(c, 'H', TIE, cache, { pref: 'preferPinwheel', time });
      };
      // A clock that never moves: the search runs to its end and nothing is marked.
      const plenty: PinwheelSearchTime = { now: () => 0, limitMs: 100, spentMs: 0 };
      expect(search(plenty)?.cartonCount).toBe(10);
      expect(plenty.cut).toBeUndefined();
      // No time left: the search is not run, and that is recorded.
      const spent: PinwheelSearchTime = { now: () => 0, limitMs: 100, spentMs: 100 };
      expect(search(spent)).toBeNull();
      expect(spent.cut).toBe(true);
      // The time taken is added up.
      let t = 0;
      const ticking: PinwheelSearchTime = { now: () => (t += 30), limitMs: 100, spentMs: 0 };
      search(ticking);
      expect(ticking.spentMs).toBeGreaterThan(0);
    });

    it(
      'a product of an inch or so is searched in full: it is not marked limited',
      () => {
        // Single-box cartons of 1.5 x 1 in lie some 1,250 to a layer, those of 1.1 x 0.7 in
        // some 2,400. A fixed allowance of work marked both limited after a fraction of a
        // second. (The second with time to spare here, so a loaded machine cannot fail it.)
        for (const [i, budgetMs] of [
          [single(1.5, 1, 1), undefined],
          [single(1.1, 0.7, 0.5), 120_000],
        ] as const) {
          const auto = optimize(i);
          expect(auto.truncated).toBe(false);
          for (const p of ['preferPinwheel', 'pinwheelOnly'] as const) {
            const r = optimize(withPattern(i, p), { budgetMs });
            expect(r.truncated, p).toBe(false);
            expect(r.patternFallback, p).toBeUndefined();
            if (p === 'preferPinwheel') {
              expect(products(r)[0]).toBeGreaterThanOrEqual(products(auto)[0]!);
            } else {
              expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
            }
            expectNoOverlap(i, r);
            expectTruePinwheels(i, r);
          }
        }
      },
      HEAVY,
    );

    it('a small product stays well inside the time budget under every setting', () => {
      const i = { ...DEFAULT_INPUTS, product: { length: 3, width: 2, height: 1 } };
      for (const p of ['auto', 'preferPinwheel', 'pinwheelOnly'] as const) {
        const start = performance.now();
        const r = optimize(withPattern(i, p));
        expect(performance.now() - start).toBeLessThan(2000);
        expect(r.truncated).toBe(false);
      }
    });
  });

  describe('over the fixtures and a random run', () => {
    const cases = [...NAMED_CASES, ...randomCases(150)];

    it.each(cases)(
      '$name: Prefer pinwheel',
      ({ inputs }) => {
        const auto = optimize(withPattern(inputs, 'auto'));
        const r = optimize(withPattern(inputs, 'preferPinwheel'));
        expect(r).toEqual(optimize(withPattern(inputs, 'preferPinwheel'))); // deterministic
        expect(r.truncated).toBe(false);
        expect(r.emptyReason).toBe(auto.emptyReason);
        expect(r).not.toHaveProperty('autoBestProducts');
        expect(r).not.toHaveProperty('patternFallback');
        expect(r.layouts.length).toBeGreaterThanOrEqual(auto.layouts.length);
        if (auto.layouts.length === 0) return;
        // Never fewer boxes than Auto at rank 1. (Seldom more: looking for a tie, the search
        // tries narrower blocks, and now and then finds a pinwheel of more than Auto's.)
        expect(products(r)[0]).toBeGreaterThanOrEqual(products(auto)[0]!);
        expect(r.layouts.map((x) => x.rank)).toEqual(r.layouts.map((_, k) => k + 1));
        // Boxes first; among equal box counts pinwheel first; then the rating.
        const order = { good: 0, fair: 1, poor: 2 };
        for (let k = 1; k < r.layouts.length; k++) {
          const [a, b] = [r.layouts[k - 1]!.layout, r.layouts[k]!.layout];
          expect(b.totalProducts).toBeLessThanOrEqual(a.totalProducts);
          if (a.totalProducts !== b.totalProducts) continue;
          expect(Number(isPinwheel(a))).toBeGreaterThanOrEqual(Number(isPinwheel(b)));
          if (isPinwheel(a) === isPinwheel(b)) {
            expect(order[a.stability!.rating]).toBeLessThanOrEqual(order[b.stability!.rating]);
          }
        }
        // A pinwheel layout Auto lists with the most boxes is not lost.
        if (
          auto.layouts.some(
            (x) => x.layout.totalProducts === products(auto)[0] && isPinwheel(x.layout),
          )
        ) {
          expect(isPinwheel(r.layouts[0]!.layout)).toBe(true);
        }
        expectNoOverlap(inputs as Inputs, r);
        expectTruePinwheels(inputs as Inputs, r);
      },
      HEAVY,
    );

    it.each(cases)(
      '$name: Pinwheel only',
      ({ inputs }) => {
        const auto = optimize(withPattern(inputs, 'auto'));
        const r = optimize(withPattern(inputs, 'pinwheelOnly'));
        expect(r).toEqual(optimize(withPattern(inputs, 'pinwheelOnly'))); // deterministic
        expect(r.truncated).toBe(false);
        if (auto.layouts.length === 0) {
          // Nothing under Auto: the same, unless a pinwheel of few cartons fits a weight maximum
          // that every straight-cut layer is over.
          if (r.layouts.length === 0) expect(r).toEqual(auto);
          else {
            expect(auto.emptyReason).toBe('OVER_WEIGHT');
            expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
            expect(r).not.toHaveProperty('autoBestProducts');
            expect(r).not.toHaveProperty('patternFallback');
          }
          return;
        }
        expect(r.emptyReason).toBeNull();
        if (r.patternFallback) {
          // The stated fallback: exactly the Auto result, which then holds no pinwheel.
          const { pinwheelOverWeight: _overWeight, ...rest } = r;
          void _overWeight;
          expect(rest).toEqual({ ...auto, patternFallback: true });
          expect(r.layouts.some((x) => isPinwheel(x.layout))).toBe(false);
          return;
        }
        // No straight-cut layout, and no straight-cut layer, is listed.
        expect(r.layouts.length).toBeGreaterThan(0);
        expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
        const [top, shown] = [products(auto)[0]!, products(r)[0]!];
        expect(r.autoBestProducts).toBe(shown < top ? top : undefined);
        // A pinwheel layout Auto puts first is the first here too.
        if (isPinwheel(auto.layouts[0]!.layout) && allPinwheel(auto.layouts[0]!.layout)) {
          expect(shown).toBeGreaterThanOrEqual(top);
        }
        for (let k = 1; k < r.layouts.length; k++) {
          expect(products(r)[k]).toBeLessThanOrEqual(products(r)[k - 1]!);
        }
        expectNoOverlap(inputs as Inputs, r);
        expectTruePinwheels(inputs as Inputs, r);
      },
      HEAVY,
    );

    it.each(cases.filter((_, k) => k % 3 === 0))(
      '$name: with a minimum stability, after the pattern',
      ({ inputs }) => {
        for (const p of ['preferPinwheel', 'pinwheelOnly'] as const) {
          const plain = optimize(withPattern(inputs, p));
          for (const m of ['fair', 'good'] as const) {
            const r = optimize(withPattern(inputs, p, m));
            expect(r.patternFallback).toBe(plain.patternFallback);
            if (plain.layouts.length === 0) continue;
            expect(r.layouts.length).toBeGreaterThan(0);
            const met = r.layouts.map((x) => meetsMinimum(x.layout.stability!.rating, m));
            expect(met.every(Boolean)).toBe(!r.belowMinimum);
            if (p === 'pinwheelOnly' && !plain.patternFallback) {
              expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
            }
            // When everything the pattern lists meets the minimum, the minimum changes nothing.
            if (plain.layouts.every((x) => meetsMinimum(x.layout.stability!.rating, m))) {
              expect(r.layouts).toEqual(plain.layouts);
            }
            expectNoOverlap(inputs as Inputs, r);
            expectTruePinwheels(inputs as Inputs, r);
          }
        }
      },
      HEAVY,
    );
  });

  describe('every pinwheel layer kept', () => {
    const cases = [...NAMED_CASES, ...randomCases(60)];

    it.each(cases)(
      '$name: no overlap, inside the pallet, and a true pinwheel',
      ({ inputs }) => {
        const i = inputs as Inputs;
        const { x, y } = usableFootprint(i);
        for (const pref of ['preferPinwheel', 'pinwheelOnly'] as const) {
          const cache: LayerCache = new Map();
          for (const c of generateCartonCandidates(i).slice(0, 40)) {
            for (const vertical of ['L', 'W', 'H'] as const) {
              const best = bestLayer(c, vertical, i, cache);
              if (!best) continue;
              const pin = preferredPinwheel(c, vertical, i, cache, { pref });
              if (!pin) continue;
              const [fa, fb] = footprintAxes(vertical);
              const [a, b] = [c.outer[fa], c.outer[fb]];
              expect(pin.kind).toBe('pinwheel');
              expect(pin.blocks).toHaveLength(4);
              expect(pin.cartonCount).toBe(
                pin.blocks.reduce((s, blk) => s + blk.cols * blk.rows, 0),
              );
              assertNoOverlapWithin(pin.blocks, a, b, x, y);
              // Auto's own pinwheel (more cartons than straight cuts) is kept as Auto lays it.
              if (pin.cartonCount <= searchLayer(x, y, a, b).count) {
                expect(hasThroughCut(pin.blocks, a, b)).toBe(false);
                expect(lineMissingEveryCarton(pin.blocks, a, b)).toBeNull();
              }
              // Prefer keeps only a pinwheel of at least the straight-cut count.
              if (pref === 'preferPinwheel') {
                const straight = best.kind === 'pinwheel' ? best.cartonCount - 1 : best.cartonCount;
                expect(pin.cartonCount).toBeGreaterThanOrEqual(straight);
              }
            }
            // And the layouts built from them hold nothing else under Pinwheel only.
            if (pref === 'pinwheelOnly') {
              for (const l of buildLayouts(c, i, cache, undefined, undefined, { pref })) {
                expect(allPinwheel(l)).toBe(true);
              }
            }
          }
        }
      },
      HEAVY,
    );
  });
});
