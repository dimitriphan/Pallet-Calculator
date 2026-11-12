/** The scene's geometry for a layer placed by hand: cartons at negative positions and overhanging. */
import { describe, expect, it } from 'vitest';
import { PALLET_HEIGHT } from '../domain/constants';
import { unusedSpace } from '../engine/analytics/unusedSpace';
import { overhangingLayout, OVERHANG_INPUTS as I } from '../engine/manual/testSupport';
import { cartonPlacements } from '../engine/packing/positions';
import { orthoFit, perspectiveFit } from './cameraFit';
import { dimensionLines, selectionBounds, withMeasurements } from './sceneGeometry';
import {
  boxEdgePositions,
  instanceMatrices,
  loadBounds,
  measuredBounds,
  palletBounds,
  toSceneBounds,
} from './transforms';

const L = overhangingLayout();
const cartons = cartonPlacements(L, I);

describe('scene bounds of an overhanging manual layout', () => {
  it('the load bounds hold every carton, beyond the pallet and the usable footprint', () => {
    const b = loadBounds(L, I);
    // Engine x -5..57 and y -2..46 in a 52 x 44 footprint centred on the origin.
    expect(b.min).toEqual([-31, 0, -24]);
    expect(b.max).toEqual([31, PALLET_HEIGHT + L.layers.length * 5, 24]);
    const pallet = palletBounds(I);
    expect(b.min[0]).toBeLessThan(pallet.min[0]);
    expect(b.max[0]).toBeGreaterThan(pallet.max[0]);
    for (const c of cartons) {
      const cb = toSceneBounds(c, I);
      for (const k of [0, 1, 2] as const) {
        expect(cb.min[k]).toBeGreaterThanOrEqual(b.min[k]);
        expect(cb.max[k]).toBeLessThanOrEqual(b.max[k]);
      }
    }
  });

  it('the measured bounds are the cartons own extent, as the analytics report it', () => {
    const m = measuredBounds(L, I);
    expect(m.max[0] - m.min[0]).toBe(62);
    expect(m.max[2] - m.min[2]).toBe(48);
    expect(m.min[1]).toBe(0);
    const lines = dimensionLines(m, { clearOf: loadBounds(L, I) });
    expect(lines.labels.map((l) => l.text)).toEqual(['62.00 in', '48.00 in', '70.00 in']);
    for (const p of lines.segments) expect(p.every(Number.isFinite)).toBe(true);
  });

  it('the camera fits the whole load, overhanging cartons included', () => {
    const b = withMeasurements(loadBounds(L, I));
    const fit = perspectiveFit(b, 40, 16 / 9);
    expect([...fit.position, ...fit.target].every(Number.isFinite)).toBe(true);
    const top = orthoFit(loadBounds(L, I), 'top', 1.5);
    // Every carton lies inside the top view's frame.
    for (const c of cartons) {
      const cb = toSceneBounds(c, I);
      expect(cb.min[0] - top.target[0]).toBeGreaterThanOrEqual(top.left);
      expect(cb.max[0] - top.target[0]).toBeLessThanOrEqual(top.right);
      expect(cb.min[2] - top.target[2]).toBeGreaterThanOrEqual(top.bottom);
      expect(cb.max[2] - top.target[2]).toBeLessThanOrEqual(top.top);
    }
  });

  it('instance matrices, edges and selection bounds are finite for every carton', () => {
    expect(Array.from(instanceMatrices(cartons, I)).every(Number.isFinite)).toBe(true);
    expect(Array.from(boxEdgePositions(cartons, I)).every(Number.isFinite)).toBe(true);
    const first = selectionBounds({ kind: 'carton', cartonIndex: 0 }, L, I, cartons);
    // The carton at engine (-3, -2): scene x from -3 - 26.
    expect(first?.min).toEqual([-29, PALLET_HEIGHT, -24]);
    expect(first?.max).toEqual([-4, PALLET_HEIGHT + 5, -7]);
  });

  it('the unused-space boxes stay inside the envelope the scene draws', () => {
    const u = unusedSpace(L, I);
    expect(u.gaps.length).toBeGreaterThan(0);
    for (const g of u.gaps) {
      const b = toSceneBounds(g, I);
      expect(b.min[0]).toBeGreaterThanOrEqual(-26 - 1e-9);
      expect(b.max[0]).toBeLessThanOrEqual(26 + 1e-9);
      expect(b.min[2]).toBeGreaterThanOrEqual(-22 - 1e-9);
      expect(b.max[2]).toBeLessThanOrEqual(22 + 1e-9);
    }
  });
});
