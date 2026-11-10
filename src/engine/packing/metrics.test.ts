import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs } from '../../domain/types';
import { cartonKey, generateCartonCandidates } from './cartons';
import { availableVolume, productSize, volumeOf } from './geometry';
import { layoutMetrics } from './metrics';
import { buildLayouts, footprintAxes } from './stacking';

/** 10-inch cube, no leeway or walls, max carton 20 x 20 x 10, pallet 40 x 40 x 25 (usable height 20). */
const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

/** One 7 x 6 x 10 carton (1x1x1), pallet 30 x 30 x 25; the mixed stack is 2 x L (15) + 1 x W (12). */
const MIXED: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 7, width: 6, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 10, width: 10, height: 10 },
  pallet: { length: 30, width: 30, height: 25 },
};

describe('layoutMetrics', () => {
  it('fills the exact cube case completely', () => {
    for (const c of generateCartonCandidates(CUBES)) {
      for (const l of buildLayouts(c, CUBES, new Map())) {
        const m = layoutMetrics(l, CUBES);
        expect(m.cartonVolume).toBe(32000);
        expect(m.productVolume).toBe(32000);
        expect(m.loadExtent).toEqual({ x: 40, y: 40, z: 20 });
        expect(m.loadBoundingVolume).toBe(32000);
        expect(m.availableVolume).toBe(32000);
      }
    }
  });

  it('reports extent, volumes and the fullest layer of a mixed stack', () => {
    const c = generateCartonCandidates(MIXED)[0]!;
    const mixed = buildLayouts(c, MIXED, new Map()).find(
      (l) => new Set(l.layers.map((layer) => layer.vertical)).size > 1,
    )!;
    const m = layoutMetrics(mixed, MIXED);
    expect(m.cartonVolume).toBe(42 * 420);
    expect(m.productVolume).toBe(42 * 420);
    expect(m.loadExtent.x).toBe(Math.max(...mixed.layers.map((l) => l.extent.x)));
    expect(m.loadExtent.y).toBe(Math.max(...mixed.layers.map((l) => l.extent.y)));
    expect(m.loadExtent.z).toBe(20);
    expect(m.loadBoundingVolume).toBe(m.loadExtent.x * m.loadExtent.y * 20);
    expect(m.availableVolume).toBe(30 * 30 * 20);
    expect(m.fullestLayerCartons).toBe(15);
    // L vertical: footprint W x H = 6 x 10
    expect(m.fullestLayerUsedArea).toBe(15 * 60);
  });

  it('is consistent with the layout for every default layout', () => {
    const i = DEFAULT_INPUTS;
    const productVolume = volumeOf(productSize(i));
    for (const c of generateCartonCandidates(i)) {
      for (const l of buildLayouts(c, i, new Map())) {
        const m = layoutMetrics(l, i);
        expect(m.cartonVolume).toBeCloseTo(l.totalCartons * volumeOf(c.outer), 6);
        expect(m.productVolume).toBeCloseTo(l.totalProducts * productVolume, 6);
        expect(m.productVolume).toBeLessThanOrEqual(m.cartonVolume);
        expect(m.cartonVolume).toBeLessThanOrEqual(m.loadBoundingVolume + 1e-6);
        expect(m.loadBoundingVolume).toBeLessThanOrEqual(m.availableVolume + 1e-6);
        expect(m.availableVolume).toBe(availableVolume(i));
        const fullest = Math.max(...l.layers.map((layer) => layer.cartonCount));
        expect(m.fullestLayerCartons).toBe(fullest);
        const layer = l.layers.find((x) => x.cartonCount === fullest)!;
        const [fa, fb] = footprintAxes(layer.vertical);
        expect(m.fullestLayerUsedArea).toBeCloseTo(fullest * c.outer[fa] * c.outer[fb], 6);
      }
    }
    expect(cartonKey(generateCartonCandidates(i)[0]!)).toBe('1x2x5');
  });
});
