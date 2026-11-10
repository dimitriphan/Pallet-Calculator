import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, ProductAxis } from '../domain/types';
import { cartonKey, generateCartonCandidates } from './packing/cartons';
import { usableFootprint, usableHeight } from './packing/geometry';
import { gridLayer } from './packing/layerSearch';
import { footprintAxes } from './packing/stacking';
import { fitsCount } from './packing/tolerance';
import { optimize, TIME_BUDGET_MS } from './optimize';

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

  it('marks the result truncated when the candidate list was capped', () => {
    const r = optimize(
      { ...DEFAULT_INPUTS, product: { length: 0.2, width: 0.2, height: 0.2 } },
      { now: () => 0 },
    );
    expect(r.truncated).toBe(true);
    expect(r.layouts.length).toBeGreaterThan(0);
  });
});
