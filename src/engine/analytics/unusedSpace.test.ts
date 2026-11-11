import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Block, Inputs, Layout } from '../../domain/types';
import { optimize } from '../optimize';
import { cartonPlacements } from '../packing/positions';
import { overlappingPairs, PINWHEEL_INPUTS, type Box3 } from '../packing/testSupport';
import { computeAnalytics } from './analytics';
import { MIN_GAP, unusedSpace, type SpaceBox } from './unusedSpace';
import { trimToWeight } from './weight';

const winner = (i: Inputs): Layout => optimize(i).layouts[0]!.layout;

/** Pallet 40 x 40, 25 tall (20 usable), no overhang; 10 x 10 x 10 cartons. */
const SQUARE: Inputs = {
  ...DEFAULT_INPUTS,
  pallet: { length: 40, width: 40, height: 25 },
  overhang: 0,
};

/** A hand-made layout of 10 x 10 x 10 cartons: one layer per block list, stacked from 0. */
function cubeLayout(layers: Block[][]): Layout {
  const count = (blocks: Block[]) => blocks.reduce((s, b) => s + b.cols * b.rows, 0);
  const total = layers.reduce((s, blocks) => s + count(blocks), 0);
  return {
    id: 'hand-made',
    carton: {
      counts: { L: 1, W: 1, H: 1 },
      inner: { L: 10, W: 10, H: 10 },
      outer: { L: 10, W: 10, H: 10 },
      boxesPerCarton: 1,
      utilization: 1,
      emptyVolume: 0,
    },
    layers: layers.map((blocks, k) => ({
      vertical: 'H',
      height: 10,
      cartonCount: count(blocks),
      blocks,
      extent: { x: 40, y: 40 },
      z: k * 10,
    })),
    totalCartons: total,
    totalProducts: total,
  };
}

const volumeOf = (b: SpaceBox) => b.dx * b.dy * b.dz;

/** The identity the analytics rely on: headroom plus gaps is the remaining volume. */
function expectIdentity(l: Layout, i: Inputs) {
  const a = computeAnalytics(l, i);
  expect(a.totals.headroomVolume + a.totals.layerGapVolume).toBeCloseTo(
    a.totals.remainingVolume,
    6,
  );
  const u = unusedSpace(l, i);
  expect(a.totals.headroomVolume).toBe(u.headroomVolume);
  expect(a.totals.layerGapVolume).toBe(u.gapVolume);
}

describe('unusedSpace', () => {
  it('finds the two strips beside a centred grid and the headroom above it', () => {
    // One layer of 3 x 4 cartons (30 x 40), centred: 5-inch strips at x 0..5 and 35..40.
    const l = cubeLayout([[{ x: 0, y: 0, cols: 3, rows: 4, rotated: false }]]);
    const u = unusedSpace(l, SQUARE);
    expect(u.gaps).toEqual([
      { x: 0, y: 0, z: 0, dx: 5, dy: 40, dz: 10 },
      { x: 35, y: 0, z: 0, dx: 5, dy: 40, dz: 10 },
    ]);
    expect(u.gapVolume).toBe(2 * 5 * 40 * 10);
    expect(u.headroom).toEqual({ x: 0, y: 0, z: 10, dx: 40, dy: 40, dz: 10 });
    expect(u.headroomVolume).toBe(40 * 40 * 10);
    expectIdentity(l, SQUARE);
  });

  it('gives one gap box per layer for an L-shaped layer, at each layer height', () => {
    const blocks: Block[] = [
      { x: 0, y: 0, cols: 4, rows: 3, rotated: false },
      { x: 0, y: 30, cols: 3, rows: 1, rotated: false },
    ];
    const l = cubeLayout([blocks, blocks]);
    const u = unusedSpace(l, SQUARE);
    expect(u.gaps).toEqual([
      { x: 30, y: 30, z: 0, dx: 10, dy: 10, dz: 10 },
      { x: 30, y: 30, z: 10, dx: 10, dy: 10, dz: 10 },
    ]);
    expect(u.headroom).toBeNull();
    expect(u.headroomVolume).toBe(0);
    expectIdentity(l, SQUARE);
  });

  it('shows no headroom when the stack reaches the height limit', () => {
    const full: Block[] = [{ x: 0, y: 0, cols: 4, rows: 4, rotated: false }];
    const l = cubeLayout([full, full]);
    const u = unusedSpace(l, SQUARE);
    expect(u.headroom).toBeNull();
    expect(u.gaps).toEqual([]);
    expect(u.headroomVolume + u.gapVolume).toBe(0);
  });

  it('counts a sliver under the minimum gap in the volume but draws no box for it', () => {
    // Pallet 40.1 wide: the full 4 x 4 grid leaves 0.05 in on each side; 2 in of headroom
    // is drawn, a 0.1 in headroom would not be.
    const i: Inputs = { ...SQUARE, pallet: { length: 40.1, width: 40, height: 27 } };
    const l = cubeLayout([[{ x: 0, y: 0, cols: 4, rows: 4, rotated: false }]]);
    const u = unusedSpace(l, i);
    expect(u.gaps).toEqual([]);
    expect(u.gapVolume).toBeCloseTo(0.1 * 40 * 10, 9);
    expect(u.headroom).toEqual({ x: 0, y: 0, z: 10, dx: 40.1, dy: 40, dz: 12 });
    expectIdentity(l, i);

    const low: Inputs = { ...i, pallet: { ...i.pallet, height: 15.1 } };
    const v = unusedSpace(l, low);
    expect(v.headroom).toBeNull();
    expect(v.headroomVolume).toBeCloseTo(40.1 * 40 * 0.1, 9);
    expectIdentity(l, low);
    expect(MIN_GAP).toBe(0.25);
  });

  it('finds the centre gap of a pinwheel layer and the strips beside it', () => {
    // Pinned case: four blocks round a 15 x 4.5 centre gap, a 48 x 37.5 layer centred in
    // 48 x 40 (1.25 in strips), three 18 in layers under 55 in: 1 in of headroom.
    const l = winner(PINWHEEL_INPUTS);
    expect(l.layers.every((layer) => layer.kind === 'pinwheel')).toBe(true);
    const u = unusedSpace(l, PINWHEEL_INPUTS);
    expect(u.gaps).toHaveLength(9);
    for (const z of [0, 18, 36]) {
      expect(u.gaps.filter((g) => g.z === z)).toEqual([
        { x: 0, y: 0, z, dx: 48, dy: 1.25, dz: 18 },
        { x: 16.5, y: 17.75, z, dx: 15, dy: 4.5, dz: 18 },
        { x: 0, y: 38.75, z, dx: 48, dy: 1.25, dz: 18 },
      ]);
    }
    expect(u.headroom).toEqual({ x: 0, y: 0, z: 54, dx: 48, dy: 40, dz: 1 });
    expectIdentity(l, PINWHEEL_INPUTS);
  });

  it('never overlaps a carton or another gap, for the default example and the pinwheel case', () => {
    for (const i of [DEFAULT_INPUTS, PINWHEEL_INPUTS]) {
      const l = winner(i);
      const u = unusedSpace(l, i);
      const gaps: Box3[] = [...u.gaps, ...(u.headroom ? [u.headroom] : [])];
      expect(overlappingPairs(gaps)).toBe(0);
      expect(overlappingPairs([...gaps, ...cartonPlacements(l, i)])).toBe(0);
      // Boxes drawn plus cartons account for every drawn-size piece of the envelope.
      const drawn = gaps.reduce((s, g) => s + volumeOf(g), 0);
      expect(drawn).toBeLessThanOrEqual(u.headroomVolume + u.gapVolume + 1e-6);
    }
  });

  it('draws the default example as 20 gap boxes and no headroom', () => {
    // Layer 1 (45 x 42 in 50 x 42): two 2.5 in strips; layers 2-7 (47 x 42 with a 21 x 3
    // notch, alternate layers turned): a 1.5 in strip, a shortened strip and the notch.
    const u = unusedSpace(winner(DEFAULT_INPUTS), DEFAULT_INPUTS);
    expect(u.headroom).toBeNull();
    expect(u.gaps).toHaveLength(20);
    expect(u.gaps.filter((g) => g.z === 0)).toEqual([
      { x: 0, y: 0, z: 0, dx: 2.5, dy: 42, dz: 13 },
      { x: 47.5, y: 0, z: 0, dx: 2.5, dy: 42, dz: 13 },
    ]);
  });

  it('keeps headroom plus gaps equal to the remaining volume', () => {
    expectIdentity(winner(DEFAULT_INPUTS), DEFAULT_INPUTS);
    expectIdentity(winner(PINWHEEL_INPUTS), PINWHEEL_INPUTS);
    const withOverhang: Inputs = { ...PINWHEEL_INPUTS, overhang: 3 };
    expectIdentity(winner(withOverhang), withOverhang);
    // Weight-trimmed: the 612 lb default winner loses its top layer under a 611 lb maximum.
    const heavy: Inputs = {
      ...DEFAULT_INPUTS,
      weights: { productBox: 2, emptyCarton: 1, pallet: 40, maxPallet: 611 },
    };
    const trimmed = trimToWeight(winner(DEFAULT_INPUTS), heavy)!;
    expect(trimmed.weightTrim?.layersRemoved).toBe(1);
    const u = unusedSpace(trimmed, heavy);
    expect(u.headroom).toEqual({ x: 0, y: 0, z: 58, dx: 50, dy: 42, dz: 9 });
    expectIdentity(trimmed, heavy);
  });

  it('is the whole envelope as headroom for a layout without layers', () => {
    const l = cubeLayout([]);
    const u = unusedSpace(l, SQUARE);
    expect(u.gaps).toEqual([]);
    expect(u.headroom).toEqual({ x: 0, y: 0, z: 0, dx: 40, dy: 40, dz: 20 });
  });
});
