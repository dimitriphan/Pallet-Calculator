import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type {
  Dims,
  Inputs,
  LayerPatternPref,
  MinStability,
  OptimizeResult,
  RotationMode,
  WeightInputs,
} from '../domain/types';
import { optimize } from './optimize';

/**
 * A carton is skipped when it cannot reach the box counts of the 30 best layouts kept. Those
 * 30 must be layouts that can be listed: under a minimum stability the ones that meet it, under
 * Pinwheel only the pinwheel layouts. These tests compare the search with one that skips
 * nothing.
 */
const d = (length: number, width: number, height: number): Dims => ({ length, width, height });
const weights = (productBox: number | null, maxPallet: number | null): WeightInputs => ({
  productBox,
  maxPallet,
  emptyCarton: 0,
  pallet: 40,
});
const BASE: Inputs = { ...DEFAULT_INPUTS, leeway: 0.25, wallThickness: 0.125 };
const products = (r: OptimizeResult) => r.layouts.map((x) => x.layout.totalProducts);
const ratings = (r: OptimizeResult) => r.layouts.map((x) => x.layout.stability?.rating);

describe('Good only finds the good layout in a carton that 30 better-filled ones would hide', () => {
  // Each was found by review of the first minimum stability release, which skipped cartons
  // against layouts the minimum then left out.
  it('pallet 40 x 40 x 84, product 7 x 7 x 4.5, weight limit: a Good layout of 288', () => {
    const i: Inputs = {
      ...BASE,
      pallet: d(40, 40, 84),
      product: d(7, 7, 4.5),
      maxCarton: d(29, 36, 23.5),
      overhang: 1,
      weights: weights(3.5, 1500),
      minStability: 'good',
    };
    const r = optimize(i);
    expect(r.belowMinimum).toBeUndefined();
    expect(products(r)).toEqual([288]);
    expect(ratings(r)).toEqual(['good']);
    expect(r.autoBestProducts).toBe(416);
    expect(r.truncated).toBe(false);
  });

  it('pallet 32 x 20 x 60, product 4 x 3.5 x 1.5, no side rotation: Good layouts of 648', () => {
    const i: Inputs = {
      ...BASE,
      pallet: d(32, 20, 60),
      product: d(4, 3.5, 1.5),
      maxCarton: d(17, 15, 8.5),
      rotationMode: 'noSide',
      weights: weights(1, 900),
      minStability: 'good',
    };
    const r = optimize(i);
    expect(r.belowMinimum).toBeUndefined();
    expect(products(r)).toEqual([648, 648, 576]);
    expect(new Set(ratings(r))).toEqual(new Set(['good']));
  });

  it('pallet 20 x 32 x 84, product 8.5 x 4 x 3, upright: 112 Good, not 96', () => {
    const i: Inputs = {
      ...BASE,
      pallet: d(20, 32, 84),
      product: d(8.5, 4, 3),
      maxCarton: d(43.5, 21, 16),
      rotationMode: 'upright',
      keepCartonsUpright: true,
      weights: weights(2, 300),
      minStability: 'good',
    };
    const r = optimize(i);
    expect(products(r)).toEqual([112, 112, 96, 96, 96]);
    expect(new Set(ratings(r))).toEqual(new Set(['good']));
  });

  it('pallet 32 x 32 x 56, product 3 x 3.5 x 2, no weights: 1848 Good, not 1820', () => {
    const i: Inputs = {
      ...BASE,
      pallet: d(32, 32, 56),
      product: d(3, 3.5, 2),
      maxCarton: d(7, 18.5, 11),
      overhang: 1,
      rotationMode: 'noSide',
      minStability: 'good',
    };
    const r = optimize(i);
    expect(products(r)).toEqual([1848, 1820, 1792, 1792, 1764]);
    expect(new Set(ratings(r))).toEqual(new Set(['good']));
  });
});

/** A small seeded generator (mulberry32): the same numbers on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODES: RotationMode[] = ['full', 'upright', 'noSide'];

/**
 * Inputs of the kind that hid layouts: small pallets, tall height limits (many layers, so
 * tall stacks rate badly), large maximum cartons (many carton sizes) and, for half, weights.
 */
function hardCases(count: number, seed = 5): { name: string; inputs: Inputs }[] {
  const rnd = mulberry32(seed);
  const pick = (lo: number, hi: number, step: number) =>
    lo + Math.floor(rnd() * (Math.floor((hi - lo) / step) + 1)) * step;
  const out: { name: string; inputs: Inputs }[] = [];
  for (let k = 0; k < count; k++) {
    const product = d(pick(3, 8.5, 0.5), pick(3, 7, 0.5), pick(1.5, 4.5, 0.5));
    const weighed = rnd() < 0.5;
    const inputs: Inputs = {
      ...BASE,
      pallet: d(pick(20, 40, 4), pick(20, 40, 4), pick(48, 84, 4)),
      product,
      maxCarton: d(
        product.length * pick(2, 6, 1) + 1.5,
        product.width * pick(2, 6, 1) + 1.5,
        product.height * pick(2, 6, 1) + 1.5,
      ),
      overhang: rnd() < 0.4 ? 1 : 0,
      rotationMode: MODES[Math.floor(rnd() * MODES.length)] as RotationMode,
      keepCartonsUpright: rnd() < 0.25,
      weights: weights(
        weighed ? pick(0.5, 4, 0.5) : null,
        weighed && rnd() < 0.7 ? pick(300, 1500, 100) : null,
      ),
    };
    out.push({ name: `hard ${k}`, inputs });
  }
  return out;
}

const SETTINGS: [MinStability, LayerPatternPref][] = [
  ['fair', 'auto'],
  ['good', 'auto'],
  ['auto', 'preferPinwheel'],
  ['auto', 'pinwheelOnly'],
  ['good', 'preferPinwheel'],
  ['good', 'pinwheelOnly'],
  ['fair', 'pinwheelOnly'],
];

describe('the search lists what a search that skips no carton lists', () => {
  const cases = hardCases(60);

  it.each(cases)('$name', ({ inputs }) => {
    // Auto first: the generator is worth something only if skipping happens at all.
    const auto = optimize(inputs);
    const autoAll = optimize(inputs, { prune: false });
    expect(auto.truncated || autoAll.truncated).toBe(false);
    expect(auto.layouts[0]?.layout).toEqual(autoAll.layouts[0]?.layout);
    for (const [minStability, layerPattern] of SETTINGS) {
      const i: Inputs = { ...inputs, minStability, layerPattern };
      const r = optimize(i);
      const all = optimize(i, { prune: false });
      const setting = `${minStability}, ${layerPattern}`;
      expect(r.truncated || all.truncated, setting).toBe(false);
      // Rank 1 is the same layout, and nothing is said of the result that is not true of
      // the complete search.
      expect(r.layouts[0]?.layout, setting).toEqual(all.layouts[0]?.layout);
      expect(r.belowMinimum, setting).toBe(all.belowMinimum);
      expect(r.patternFallback, setting).toBe(all.patternFallback);
      expect(r.autoBestProducts, setting).toBe(all.autoBestProducts);
      expect(r.emptyReason, setting).toBe(all.emptyReason);
    }
  });

  it('the cases include ones where cartons are skipped, and ones each setting changes', () => {
    // Counting 30 layouts the minimum leaves out, as the first release did, changes rank 1 in
    // four of these cases (hard 18, 27, 31 and 51).
    let skipped = 0;
    let below = 0;
    let fewer = 0;
    let pinwheelFewer = 0;
    for (const { inputs } of cases) {
      const auto = optimize(inputs);
      const all = optimize(inputs, { prune: false });
      if (auto.candidatesEvaluated < all.candidatesEvaluated) skipped++;
      const good = optimize({ ...inputs, minStability: 'good' });
      if (good.belowMinimum) below++;
      if (good.autoBestProducts !== undefined) fewer++;
      const only = optimize({ ...inputs, layerPattern: 'pinwheelOnly' });
      if (only.autoBestProducts !== undefined) pinwheelFewer++;
    }
    expect(skipped).toBeGreaterThan(30);
    expect(below).toBeGreaterThan(10);
    expect(fewer).toBeGreaterThan(15);
    expect(pinwheelFewer).toBeGreaterThan(15);
  });
});
