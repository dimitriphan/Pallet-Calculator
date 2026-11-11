import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layout, WeightInputs } from '../../domain/types';
import { optimize } from '../optimize';
import { layoutSignature } from '../packing/stacking';
import { layoutWeight, roomForCartons, trimToWeight } from './weight';

/**
 * The default example's winner: 52 cartons of 1 x 1 x 5 boxes (13 x 9 x 21 outer), stacked
 * bottom first as one layer of 10 cartons standing on product length (13 tall) and six
 * layers of 7 standing on product width (9 tall each): 13 + 6 x 9 = 67 = 72 - 5.
 */
const layout: Layout = optimize(DEFAULT_INPUTS).layouts[0]!.layout;

function withWeights(w: Partial<WeightInputs>): Inputs {
  return { ...DEFAULT_INPUTS, weights: { ...DEFAULT_INPUTS.weights, ...w } };
}

// Box 2 lb, empty carton 1 lb, pallet 40 lb.
const weighed = withWeights({ productBox: 2, emptyCarton: 1, pallet: 40 });

describe('the default example layout', () => {
  it('is the recorded winner', () => {
    expect(layout.carton.boxesPerCarton).toBe(5);
    expect(layout.totalCartons).toBe(52);
    expect(layout.layers.map((l) => [l.cartonCount, l.height, l.z])).toEqual([
      [10, 13, 0],
      [7, 9, 13],
      [7, 9, 22],
      [7, 9, 31],
      [7, 9, 40],
      [7, 9, 49],
      [7, 9, 58],
    ]);
  });
});

describe('layoutWeight', () => {
  it('works out the totals by hand', () => {
    const w = layoutWeight(layout, weighed)!;
    // Per carton: 1 + 5 x 2 = 11 lb.
    expect(w.perCarton).toBe(11);
    // Layers: 10 x 11 = 110, then six layers of 7 x 11 = 77.
    expect(w.perLayer).toEqual([110, 77, 77, 77, 77, 77, 77]);
    // Total: 40 + 52 x 11 = 612 lb.
    expect(w.total).toBe(612);
    // Centre of mass above the floor (pallet deck 5 in):
    //   pallet   40 lb at 5 / 2 = 2.5          ->    100
    //   layer 1 110 lb at 5 + 0 + 13 / 2 = 11.5 ->   1265
    //   layers 2-7, 77 lb each at 5 + z + 4.5 for z = 13, 22, 31, 40, 49, 58
    //     = 22.5 + 31.5 + 40.5 + 49.5 + 58.5 + 67.5 = 270 -> 77 x 270 = 20790
    //   moment 22155 lb·in / 612 lb = 36.2009803...
    expect(w.centreOfMassHeight).toBeCloseTo(22155 / 612, 10);
  });

  it('is null when the product box weight is blank', () => {
    expect(layoutWeight(layout, DEFAULT_INPUTS)).toBeNull();
    expect(layoutWeight(layout, withWeights({ maxPallet: 500 }))).toBeNull();
  });
});

describe('trimToWeight', () => {
  it('returns the same layout when there is no maximum', () => {
    expect(trimToWeight(layout, weighed)).toBe(layout);
  });

  it('returns the same layout when the box weight is blank', () => {
    expect(trimToWeight(layout, withWeights({ maxPallet: 100 }))).toBe(layout);
  });

  it('returns the same layout when the total equals the maximum exactly', () => {
    expect(
      trimToWeight(layout, { ...weighed, weights: { ...weighed.weights, maxPallet: 612 } }),
    ).toBe(layout);
  });

  it('removes the top layer at one pound under the total', () => {
    const t = trimToWeight(layout, {
      ...weighed,
      weights: { ...weighed.weights, maxPallet: 611 },
    })!;
    expect(t.layers).toEqual(layout.layers.slice(0, 6));
    expect(t.totalCartons).toBe(45);
    expect(t.totalProducts).toBe(225);
    expect(t.weightTrim).toEqual({ layersRemoved: 1 });
    expect(t.id).toBe(layoutSignature(t));
    expect(t.id).not.toBe(layout.id);
    expect(t.carton).toBe(layout.carton);
    // 40 + 45 x 11 = 535 <= 611.
    expect(layoutWeight(t, weighed)!.total).toBe(535);
    // The input layout is untouched.
    expect(layout.layers).toHaveLength(7);
    expect(layout.weightTrim).toBeUndefined();
  });

  it('stops at the exact layer where the total is at or under the maximum', () => {
    // 535 - 77 = 458 (5 layers); one pound under it takes a fourth layer away.
    const at = (max: number) =>
      trimToWeight(layout, { ...weighed, weights: { ...weighed.weights, maxPallet: max } })!;
    expect(at(458).layers).toHaveLength(5);
    expect(at(458).weightTrim).toEqual({ layersRemoved: 2 });
    expect(at(457).layers).toHaveLength(4);
    // Only the bottom layer: 40 + 110 = 150.
    expect(at(150).layers).toHaveLength(1);
    expect(at(150).weightTrim).toEqual({ layersRemoved: 6 });
    expect(at(150).totalProducts).toBe(50);
  });

  it('returns null when one layer and the pallet are already over the maximum', () => {
    expect(
      trimToWeight(layout, { ...weighed, weights: { ...weighed.weights, maxPallet: 149 } }),
    ).toBeNull();
    expect(
      trimToWeight(layout, { ...weighed, weights: { ...weighed.weights, maxPallet: 30 } }),
    ).toBeNull();
  });
});

describe('roomForCartons', () => {
  it('is 0 without a maximum or without a box weight', () => {
    expect(roomForCartons(layout, weighed)).toBe(0);
    expect(roomForCartons(layout, withWeights({ maxPallet: 1000 }))).toBe(0);
  });

  it('is floor((max - total) / per carton)', () => {
    const i = { ...weighed, weights: { ...weighed.weights, maxPallet: 611 } };
    const t = trimToWeight(layout, i)!;
    // (611 - 535) / 11 = 6.9 -> 6.
    expect(roomForCartons(t, i)).toBe(6);
    // At the maximum exactly there is no room.
    const exact = { ...weighed, weights: { ...weighed.weights, maxPallet: 612 } };
    expect(roomForCartons(layout, exact)).toBe(0);
    // 10 lb short of a carton: still 0. 22 lb spare: 2.
    expect(
      roomForCartons(layout, { ...exact, weights: { ...exact.weights, maxPallet: 622 } }),
    ).toBe(0);
    expect(
      roomForCartons(layout, { ...exact, weights: { ...exact.weights, maxPallet: 634 } }),
    ).toBe(2);
  });
});
