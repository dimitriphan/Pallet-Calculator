import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, Layout } from '../domain/types';
import {
  boxEdgePositions,
  instanceMatrices,
  loadBounds,
  toScenePosition,
  toSceneScale,
} from './transforms';

/** Case I: a 40 x 40 pallet, 25 tall, no overhang. */
const I40: Inputs = {
  ...DEFAULT_INPUTS,
  pallet: { length: 40, width: 40, height: 25 },
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
};

/** One layer of 2 x 2 cartons of 20 x 20 x 20 that exactly covers the 40 x 40 footprint. */
const LAYOUT_I: Layout = {
  id: 'case-i',
  carton: {
    counts: { L: 2, W: 2, H: 2 },
    inner: { L: 20, W: 20, H: 20 },
    outer: { L: 20, W: 20, H: 20 },
    boxesPerCarton: 8,
    utilization: 1,
    emptyVolume: 0,
  },
  layers: [
    {
      vertical: 'H',
      height: 20,
      cartonCount: 4,
      blocks: [{ x: 0, y: 0, cols: 2, rows: 2, rotated: false }],
      extent: { x: 40, y: 40 },
      z: 0,
    },
  ],
  totalCartons: 4,
  totalProducts: 32,
};

const BOX = { x: 0, y: 0, z: 0, dx: 10, dy: 20, dz: 30 };

describe('toScenePosition', () => {
  it('centres the box in the scene frame: X from length, Y up from the pallet top, Z from width', () => {
    expect(toScenePosition(BOX, I40)).toEqual([-15, 20, -10]);
  });

  it('centres on the usable footprint, which includes the overhang', () => {
    const overhang = { ...I40, overhang: 2 };
    expect(toScenePosition(BOX, overhang)).toEqual([-16, 20, -11]);
  });
});

describe('toSceneScale', () => {
  it('maps engine dx, dz, dy to scene X, Y, Z', () => {
    expect(toSceneScale(BOX)).toEqual([10, 30, 20]);
  });
});

describe('instanceMatrices', () => {
  it('writes 16 numbers per box with the scene position in elements 12..14', () => {
    const second = { x: 20, y: 0, z: 0, dx: 20, dy: 20, dz: 20 };
    const m = instanceMatrices([BOX, second], I40);
    expect(m).toHaveLength(32);
    expect(Array.from(m.slice(12, 15))).toEqual([-15, 20, -10]);
    expect(Array.from(m.slice(16 + 12, 16 + 15))).toEqual([10, 15, -10]);
    expect(m[15]).toBe(1);
  });

  it('puts the scale on the diagonal, reduced by the shrink', () => {
    const m = instanceMatrices([BOX], I40, 0.02);
    expect(m[0]).toBeCloseTo(9.98, 5);
    expect(m[5]).toBeCloseTo(29.98, 5);
    expect(m[10]).toBeCloseTo(19.98, 5);
    expect([m[1], m[2], m[4], m[6], m[8], m[9], m[3], m[7], m[11]]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('loadBounds', () => {
  it('spans the pallet and every carton (case I)', () => {
    expect(loadBounds(LAYOUT_I, I40)).toEqual({ min: [-20, 0, -20], max: [20, 25, 20] });
  });

  it('is the pallet alone when there is no layout', () => {
    expect(loadBounds(null, I40)).toEqual({ min: [-20, 0, -20], max: [20, 5, 20] });
  });

  it('grows past the pallet when cartons overhang it', () => {
    const overhang = { ...I40, pallet: { length: 38, width: 38, height: 25 }, overhang: 2 };
    expect(loadBounds(LAYOUT_I, overhang)).toEqual({ min: [-20, 0, -20], max: [20, 25, 20] });
  });

  it('uses a 48 x 5 x 40 placeholder when there are no inputs', () => {
    expect(loadBounds(null, null)).toEqual({ min: [-24, 0, -20], max: [24, 5, 20] });
  });
});

describe('boxEdgePositions', () => {
  it('writes the 12 edges of each box as 24 scene-frame vertices', () => {
    const p = boxEdgePositions([BOX], I40);
    expect(p).toHaveLength(12 * 2 * 3);
    const xs = new Set<number>();
    const ys = new Set<number>();
    const zs = new Set<number>();
    for (let k = 0; k < p.length; k += 3) {
      xs.add(p[k]!);
      ys.add(p[k + 1]!);
      zs.add(p[k + 2]!);
    }
    expect([...xs].sort((a, b) => a - b)).toEqual([-20, -10]);
    expect([...ys].sort((a, b) => a - b)).toEqual([5, 35]);
    expect([...zs].sort((a, b) => a - b)).toEqual([-20, 0]);
  });
});
