import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layout } from '../../domain/types';
import { optimize } from '../optimize';
import { computeAnalytics, cartonDisplayDims } from './analytics';

const CASE_I: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

function winner(i: Inputs): Layout {
  const l = optimize(i).layouts[0]?.layout;
  if (!l) throw new Error('no layout');
  return l;
}

describe('computeAnalytics, case I', () => {
  const layout = winner(CASE_I);
  const a = computeAnalytics(layout, CASE_I);

  it('reports a completely full pallet', () => {
    expect(a.totals.products).toBe(32);
    expect(a.totals.cartons).toBe(8);
    expect(a.totals.volumeUsed).toBe(32000);
    expect(a.totals.volumeAvailable).toBe(32000);
    expect(a.totals.utilizationPct).toBe(100);
    expect(a.totals.remainingVolume).toBe(0);
    expect(a.pallet.volumeUtilizationPct).toBe(100);
    expect(a.pallet.remainingHeight).toBe(0);
    expect(a.pallet.totalLoadHeight).toBe(25);
    expect(a.pallet.remainingFootprintArea).toBe(0);
  });

  it('describes product, carton and pallet', () => {
    expect(a.product).toEqual({ dims: CASE_I.product, volume: 1000, perCarton: 4 });
    expect(a.carton.perPallet).toBe(8);
    expect(a.carton.utilizationPct).toBe(100);
    expect(a.carton.emptyVolume).toBe(0);
    expect(a.pallet.usableHeight).toBe(20);
    expect(a.pallet.usableFootprint).toEqual({ x: 40, y: 40 });
    expect(a.pallet.layers).toBe(layout.layers.length);
    expect(a.pallet.loadLength).toBe(40);
    expect(a.pallet.loadWidth).toBe(40);
  });

  it('summarises per layer counts', () => {
    const counts = layout.layers.map((l) => l.cartonCount);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(a.pallet.cartonsPerLayerMin).toBe(min);
    expect(a.pallet.cartonsPerLayerMax).toBe(max);
    expect(a.summary).toEqual({
      boxesPerCarton: 4,
      cartonsPerLayer: min === max ? String(min) : `${min}–${max}`,
      layers: layout.layers.length,
      cartonsPerPallet: 8,
      totalBoxes: 32,
    });
  });
});

describe('computeAnalytics, target', () => {
  const layout = winner(CASE_I);
  const run = (t: number | null) => computeAnalytics(layout, { ...CASE_I, targetQuantity: t }).target;

  it('met', () => {
    expect(run(32)).toMatchObject({ status: 'met', requested: 32, maxPossible: 32, cartonsNeeded: 8 });
  });
  it('exceeded', () => {
    const t = run(20);
    expect(t).toMatchObject({ status: 'exceeded', requested: 20, cartonsNeeded: 5 });
    expect(t.layersNeeded).toBeGreaterThanOrEqual(1);
    let cum = 0;
    let n = 0;
    for (const l of layout.layers) {
      cum += l.cartonCount;
      n++;
      if (cum >= 5) break;
    }
    expect(t.layersNeeded).toBe(n);
  });
  it('notAchievable', () => {
    expect(run(40)).toEqual({
      status: 'notAchievable',
      requested: 40,
      maxPossible: 32,
      cartonsNeeded: null,
      layersNeeded: null,
    });
  });
  it('none', () => {
    expect(run(null)).toEqual({
      status: 'none',
      requested: null,
      maxPossible: 32,
      cartonsNeeded: null,
      layersNeeded: null,
    });
  });
});

describe('cartonDisplayDims', () => {
  it('uses the shared vertical axis as height, rest sorted descending', () => {
    const l = winner(DEFAULT_INPUTS);
    const v = l.layers[0]?.vertical;
    if (!v) throw new Error('no layer');
    const shared = l.layers.every((x) => x.vertical === v);
    const o = l.carton.outer;
    const d = cartonDisplayDims(l, 'outer');
    if (shared) {
      expect(d.height).toBe(o[v]);
      expect(d.length).toBeGreaterThanOrEqual(d.width);
    } else {
      expect([d.length, d.width, d.height]).toEqual([o.L, o.W, o.H].sort((p, q) => q - p));
    }
    expect([d.length, d.width, d.height].sort()).toEqual([o.L, o.W, o.H].sort());
  });

  it('sorts descending when layers mix vertical axes', () => {
    const base = winner(CASE_I);
    const layer = base.layers[0];
    if (!layer) throw new Error('no layer');
    const mixed: Layout = {
      ...base,
      carton: { ...base.carton, outer: { L: 7, W: 6, H: 10 }, inner: { L: 5, W: 4, H: 9 } },
      layers: [{ ...layer, vertical: 'L' }, { ...layer, vertical: 'W' }],
    };
    expect(cartonDisplayDims(mixed, 'outer')).toEqual({ length: 10, width: 7, height: 6 });
    expect(cartonDisplayDims(mixed, 'inner')).toEqual({ length: 9, width: 5, height: 4 });
  });

  it('puts a shared vertical axis in height even when it is not the smallest', () => {
    const base = winner(CASE_I);
    const forced: Layout = {
      ...base,
      carton: { ...base.carton, outer: { L: 7, W: 6, H: 10 } },
      layers: base.layers.map((l) => ({ ...l, vertical: 'H' as const })),
    };
    expect(cartonDisplayDims(forced, 'outer')).toEqual({ length: 7, width: 6, height: 10 });
  });
});

describe('computeAnalytics, default inputs', () => {
  it('uses usable height 67 and the winner carton dims', () => {
    const l = winner(DEFAULT_INPUTS);
    const a = computeAnalytics(l, DEFAULT_INPUTS);
    expect(a.pallet.usableHeight).toBe(67);
    expect(a.carton.outer).toEqual(cartonDisplayDims(l, 'outer'));
    expect(a.carton.inner).toEqual(cartonDisplayDims(l, 'inner'));
    expect(a.totals.remainingVolume).toBeCloseTo(a.totals.volumeAvailable - a.totals.volumeUsed, 6);
  });
});
