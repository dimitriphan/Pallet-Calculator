import { describe, expect, it } from 'vitest';
import { PALLET_HEIGHT } from '../domain/constants';
import { designCarton, type CartonDesign } from '../engine/manual/carton';
import { allProductPlacements, cartonPlacements } from '../engine/packing/positions';
import { manualStores } from '../store/manualTestSupport';
import { perspectiveFit, VIEW_DIR } from './cameraFit';
import {
  cartonPreviewLayout,
  cartonsBounds,
  footprintOutline,
  layerPreviewLayout,
  layerStepBounds,
} from './editorGeometry';

const inputs = manualStores().current();
const design: CartonDesign = {
  counts: { length: 3, width: 2, height: 2 },
  facing: 'LWH',
  sideDown: 'base',
};

describe('cartonPreviewLayout', () => {
  it('is one carton on the floor at the middle of the scene, every box inside it', () => {
    const carton = designCarton(design, inputs);
    const layout = cartonPreviewLayout(design, carton, inputs);
    expect(cartonPlacements(layout, inputs)).toHaveLength(1);
    expect(allProductPlacements(layout, inputs)).toHaveLength(12);
    const bounds = cartonsBounds(layout, inputs)!;
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(carton.outer.H);
    expect(bounds.min[0]).toBeCloseTo(-carton.outer.L / 2);
    expect(bounds.max[0]).toBeCloseTo(carton.outer.L / 2);
    expect(bounds.min[2]).toBeCloseTo(-carton.outer.W / 2);
    expect(bounds.max[2]).toBeCloseTo(carton.outer.W / 2);
  });

  it('stands the carton on the chosen side, its longer base side across the view', () => {
    const onEnd: CartonDesign = { ...design, sideDown: 'end' };
    const carton = designCarton(onEnd, inputs);
    const bounds = cartonsBounds(cartonPreviewLayout(onEnd, carton, inputs), inputs)!;
    // On its end the carton's length (the box length, 3 boxes) is upright.
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(carton.outer.L);
    const across = bounds.max[0] - bounds.min[0];
    const deep = bounds.max[2] - bounds.min[2];
    expect(across).toBeGreaterThanOrEqual(deep);
    expect([across, deep].sort()).toEqual([carton.outer.W, carton.outer.H].sort());
  });
});

describe('the pallet layer step', () => {
  it('shows only the bottom layer of the built layout', async () => {
    const s = manualStores();
    await s.calculate();
    s.manualEditor.getState().openFromCalculated(0);
    const build = s.manualEditor.getState().session!.build;
    expect(build.layout.layers.length).toBeGreaterThan(1);
    const one = layerPreviewLayout(build.layout);
    expect(one.layers).toHaveLength(1);
    expect(one.totalCartons).toBe(build.layout.layers[0]!.cartonCount);
    expect(cartonPlacements(one, build.inputs).every((c) => c.z === 0)).toBe(true);
  });

  it('outlines the usable footprint on the pallet top and frames it with the pallet', () => {
    const wide = { ...inputs, overhang: 2 };
    const outline = footprintOutline(wide);
    expect(outline).toHaveLength(8);
    const xs = outline.map((p) => p[0]);
    const zs = outline.map((p) => p[2]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(wide.pallet.length + 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(wide.pallet.width + 2);
    expect(outline.every((p) => p[1] > PALLET_HEIGHT && p[1] < PALLET_HEIGHT + 0.5)).toBe(true);
    const empty = {
      id: 'x',
      carton: designCarton(design, wide),
      layers: [],
      totalCartons: 0,
      totalProducts: 0,
    };
    const bounds = layerStepBounds(empty, wide);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(wide.pallet.length + 2);
    expect(bounds.min[1]).toBe(0);
  });
});

describe('perspectiveFit with a direction', () => {
  const bounds = {
    min: [-10, 0, -5] as [number, number, number],
    max: [10, 8, 5] as [number, number, number],
  };
  it('looks from the default direction unless one is given', () => {
    expect(perspectiveFit(bounds, 40, 1.5)).toEqual(perspectiveFit(bounds, 40, 1.5, VIEW_DIR));
    expect(perspectiveFit(bounds, 40, 1.5, [0, 0, 0])).toEqual(perspectiveFit(bounds, 40, 1.5));
  });

  it('keeps the distance and looks along the direction given', () => {
    const fit = perspectiveFit(bounds, 40, 1.5, [0, 5, 0]);
    const usual = perspectiveFit(bounds, 40, 1.5);
    expect(fit.target).toEqual(usual.target);
    expect(fit.position[0]).toBeCloseTo(fit.target[0]);
    expect(fit.position[2]).toBeCloseTo(fit.target[2]);
    const distance = (f: typeof fit) => Math.hypot(...f.position.map((v, k) => v - f.target[k]!));
    expect(distance(fit)).toBeCloseTo(distance(usual));
  });
});
