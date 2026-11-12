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
import { assertNoOverlapWithin } from './packing/overlap.testSupport';
import { hasThroughCut } from './packing/pinwheel';
import {
  bestLayer,
  buildLayouts,
  footprintAxes,
  preferredPinwheel,
  type LayerCache,
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
      expect(products(r)).toEqual([144, 135, 126, 114]);
      expect(r.layouts.every((x) => allPinwheel(x.layout))).toBe(true);
      expect(r.autoBestProducts).toBe(150);
      expect(r.patternFallback).toBeUndefined();
      // Scored against the best layout listed.
      expect(r.layouts[0]!.score.quantity).toBeCloseTo(100, 9);
      expectNoOverlap(FEWER, r);
    });

    it('no pinwheel exists (square cartons): the Auto result, marked as the fallback', () => {
      const r = optimize(withPattern(CUBES, 'pinwheelOnly'));
      expect(r).toEqual({ ...optimize(CUBES), patternFallback: true });
      expect(r.layouts.some((x) => isPinwheel(x.layout))).toBe(false);
      expect(r).not.toHaveProperty('autoBestProducts');
    });

    it('every pinwheel is too heavy: the Auto result, marked as the fallback', () => {
      const i: Inputs = {
        ...PINWHEEL_INPUTS,
        rotationMode: 'upright',
        weights: { ...PINWHEEL_INPUTS.weights, productBox: 10, maxPallet: 130 },
      };
      expect(optimize(withPattern(i, 'pinwheelOnly'))).toEqual({
        ...optimize(i),
        patternFallback: true,
      });
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

    it('Pinwheel only where no pinwheel reaches the minimum: pinwheels still, flagged', () => {
      // Every layout of the pinned pinwheel case is fair.
      const r = optimize(withPattern(PINWHEEL_INPUTS, 'pinwheelOnly', 'good'));
      expect(r.belowMinimum).toBe(true);
      expect(r.patternFallback).toBeUndefined();
      expect(r.layouts).toEqual(optimize(withPattern(PINWHEEL_INPUTS, 'pinwheelOnly')).layouts);
    });

    it('the fallback is filtered by the minimum too', () => {
      const good = optimize(withPattern(CUBES, 'pinwheelOnly', 'good'));
      expect(good).toEqual({
        ...optimize({ ...CUBES, minStability: 'good' }),
        patternFallback: true,
      });
    });
  });

  describe('search cost', () => {
    it('marks the result limited when the further pinwheel work is spent, not under Auto', () => {
      // Single-box cartons of 1.1 x 0.7 in lie some 2,400 to a layer: more ties to look for
      // than the allowance covers.
      const i = single(1.1, 0.7, 0.5);
      const auto = optimize(i);
      expect(auto.truncated).toBe(false);
      const prefer = optimize(withPattern(i, 'preferPinwheel'));
      expect(prefer.truncated).toBe(true);
      expect(products(prefer)[0]).toBeGreaterThanOrEqual(products(auto)[0]!);
      expectNoOverlap(i, prefer);
    });

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

    it.each(cases)('$name: Prefer pinwheel', ({ inputs }) => {
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
    });

    it.each(cases)('$name: Pinwheel only', ({ inputs }) => {
      const auto = optimize(withPattern(inputs, 'auto'));
      const r = optimize(withPattern(inputs, 'pinwheelOnly'));
      expect(r).toEqual(optimize(withPattern(inputs, 'pinwheelOnly'))); // deterministic
      expect(r.truncated).toBe(false);
      expect(r.emptyReason).toBe(auto.emptyReason);
      if (auto.layouts.length === 0) {
        expect(r).toEqual(auto);
        return;
      }
      if (r.patternFallback) {
        // The stated fallback: exactly the Auto result, which then holds no pinwheel.
        expect(r).toEqual({ ...auto, patternFallback: true });
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
    });

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
          }
        }
      },
    );
  });

  describe('every pinwheel layer kept', () => {
    const cases = [...NAMED_CASES, ...randomCases(60)];

    it.each(cases)('$name: no overlap, inside the pallet, and a true pinwheel', ({ inputs }) => {
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
            expect(pin.cartonCount).toBe(pin.blocks.reduce((s, blk) => s + blk.cols * blk.rows, 0));
            assertNoOverlapWithin(pin.blocks, a, b, x, y);
            expect(hasThroughCut(pin.blocks, a, b)).toBe(false);
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
    });
  });
});
