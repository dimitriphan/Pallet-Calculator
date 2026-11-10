import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, Layout } from '../domain/types';
import { cartonPlacements } from '../engine/packing/positions';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { formatNumber } from '../engine/units/units';
import { dimensionLines, palletParts, selectionBounds, withMeasurements } from './sceneGeometry';
import { loadBounds, measuredBounds, type SceneBounds } from './transforms';

const I: Inputs = {
  ...DEFAULT_INPUTS,
  pallet: { length: 40, width: 40, height: 25 },
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
};

const LAYOUT: Layout = {
  id: 'one-layer',
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

describe('palletParts', () => {
  const parts = palletParts(50, 42);
  const extent = (k: 0 | 1 | 2, f: 'min' | 'max') =>
    Math[f](...parts.map((p) => p.position[k] + (f === 'min' ? -1 : 1) * (p.size[k] / 2)));

  it('has three 3.5 x 3.5 stringers along the length and seven 1.5-tall deck boards', () => {
    const stringers = parts.filter((p) => p.size[1] === 3.5);
    const boards = parts.filter((p) => p.size[1] === 1.5);
    expect(stringers).toHaveLength(3);
    expect(stringers.every((s) => s.size[0] === 50 && s.size[2] === 3.5)).toBe(true);
    expect(boards).toHaveLength(7);
    expect(boards.every((b) => b.size[2] === 42)).toBe(true);
  });

  it('is exactly length x width, 5 tall, centred on the origin', () => {
    expect([extent(0, 'min'), extent(0, 'max')]).toEqual([-25, 25]);
    expect([extent(2, 'min'), extent(2, 'max')]).toEqual([-21, 21]);
    expect([extent(1, 'min'), extent(1, 'max')]).toEqual([0, 5]);
  });
});

describe('dimensionLines', () => {
  it('labels the overall length, width and height of the bounds', () => {
    const d = dimensionLines({ min: [-25, 0, -21], max: [25, 60, 21] });
    expect(d.labels.map((l) => l.text)).toEqual(['50.00 in', '42.00 in', '60.00 in']);
    // 3 lines, each with 2 end ticks: 9 segments of 2 points.
    expect(d.segments).toHaveLength(9 * 2);
  });

  it('labels in the display unit without moving the lines', () => {
    const b = { min: [-25, 0, -21], max: [25, 60, 21] } as const;
    const inches = dimensionLines({ min: [...b.min], max: [...b.max] });
    const cm = dimensionLines({ min: [...b.min], max: [...b.max] }, { unit: 'cm' });
    const mm = dimensionLines({ min: [...b.min], max: [...b.max] }, { unit: 'mm' });
    expect(cm.labels.map((l) => l.text)).toEqual(['127.0 cm', '106.7 cm', '152.4 cm']);
    expect(mm.labels.map((l) => l.text)).toEqual(['1270 mm', '1067 mm', '1524 mm']);
    expect(cm.segments).toEqual(inches.segments);
    expect(cm.labels.map((l) => l.position)).toEqual(inches.labels.map((l) => l.position));
  });
});

describe('withMeasurements', () => {
  it('grows the bounds to hold every dimension line, tick and label anchor', () => {
    const b = { min: [-25, 0, -21], max: [25, 60, 21] } as const;
    const grown = withMeasurements({ min: [...b.min], max: [...b.max] });
    const d = dimensionLines({ min: [...b.min], max: [...b.max] });
    for (const p of [...d.segments, ...d.labels.map((l) => l.position)]) {
      for (let k = 0; k < 3; k++) {
        expect(p[k]).toBeGreaterThanOrEqual(grown.min[k]!);
        expect(p[k]).toBeLessThanOrEqual(grown.max[k]!);
      }
    }
    expect(grown.min).toEqual([-25, 0, -21]);
    expect(grown.max[1]).toBe(60);
  });
});

describe('selectionBounds', () => {
  const cartons = cartonPlacements(LAYOUT, I);

  it('returns the scene box of a carton', () => {
    expect(selectionBounds({ kind: 'carton', cartonIndex: 3 }, LAYOUT, I, cartons)).toEqual({
      min: [0, 5, 0],
      max: [20, 25, 20],
    });
  });

  it('returns the scene box of a product inside its carton', () => {
    // Product 7 of carton 0 is the last of 2 x 2 x 2: the upper far corner.
    expect(
      selectionBounds({ kind: 'product', cartonIndex: 0, productIndex: 7 }, LAYOUT, I, cartons),
    ).toEqual({ min: [-10, 15, -10], max: [0, 25, 0] });
  });

  it('returns the pallet for the pallet and null for nothing or a stale index', () => {
    expect(selectionBounds({ kind: 'pallet' }, LAYOUT, I, cartons)).toEqual({
      min: [-20, 0, -20],
      max: [20, 5, 20],
    });
    expect(selectionBounds(null, LAYOUT, I, cartons)).toBeNull();
    expect(selectionBounds({ kind: 'carton', cartonIndex: 9 }, LAYOUT, I, cartons)).toBeNull();
  });
});

describe('measurement lines agree with the analytics', () => {
  it.each([0, 2])('labels the load length, width and height (overhang %s)', (overhang) => {
    const inputs = { ...DEFAULT_INPUTS, overhang };
    const layout = optimize(inputs).layouts[0]!.layout;
    const a = computeAnalytics(layout, inputs);
    const d = dimensionLines(measuredBounds(layout, inputs), {
      clearOf: loadBounds(layout, inputs),
    });
    expect(d.labels.map((l) => l.text)).toEqual([
      `${formatNumber(a.pallet.loadLength)} in`,
      `${formatNumber(a.pallet.loadWidth)} in`,
      `${formatNumber(a.pallet.totalLoadHeight)} in`,
    ]);
  });

  it('measures the load from the floor and draws the lines clear of a larger pallet', () => {
    const measured = { min: [-20, 0, -18], max: [20, 40, 18] } as SceneBounds;
    const clear = { min: [-25, 0, -21], max: [25, 40, 21] } as SceneBounds;
    const d = dimensionLines(measured, { clearOf: clear });
    expect(d.labels.map((l) => l.text)).toEqual(['40.00 in', '36.00 in', '40.00 in']);
    const grown = withMeasurements(clear);
    for (const p of [...d.segments, ...d.labels.map((l) => l.position)]) {
      expect(p[0] <= -25 || p[0] >= 25 || p[2] <= -21 || p[2] >= 21).toBe(true);
      for (let k = 0; k < 3; k++) {
        expect(p[k]).toBeGreaterThanOrEqual(grown.min[k]!);
        expect(p[k]).toBeLessThanOrEqual(grown.max[k]!);
      }
    }
  });

  it('measures the pallet alone when there is no layout', () => {
    expect(measuredBounds(null, I)).toEqual({ min: [-20, 0, -20], max: [20, 5, 20] });
  });
});
