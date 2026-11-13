import { describe, expect, it } from 'vitest';
import { PALLET_HEIGHT } from '../domain/constants';
import { designCarton, type CartonDesign } from '../engine/manual/carton';
import { allProductPlacements, cartonPlacements } from '../engine/packing/positions';
import { manualStores } from '../store/manualTestSupport';
import { LAYER_VIEW_DIR, perspectiveFit, TOP_VIEW_DIR, VIEW_DIR } from './cameraFit';
import {
  atLeftFront,
  cartonPreviewLayout,
  cartonsBounds,
  DRAG_LIFT,
  footprintOutline,
  fromLeftFront,
  layerBoxes,
  layerPreviewLayout,
  layerStepBounds,
  overhanging,
  sceneToFootprint,
  seamPositions,
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

describe('the working layer as the editor draws it', () => {
  // A 20 x 10 base on a 50 x 42 footprint: one carton as it lies, one turned, one outside.
  const base = { a: 20, b: 10 };
  const usable = { x: 50, y: 42 };
  const cartons = [
    { x: 0, y: 0, rotated: false },
    { x: 30, y: 12, rotated: true },
    { x: 45, y: 30, rotated: false },
  ];

  it('stands every carton on the pallet top, the dragged one a little above', () => {
    const boxes = layerBoxes(cartons, base, 13, 1);
    expect(boxes).toEqual([
      { x: 0, y: 0, z: 0, dx: 20, dy: 10, dz: 13 },
      { x: 30, y: 12, z: DRAG_LIFT, dx: 10, dy: 20, dz: 13 },
      { x: 45, y: 30, z: 0, dx: 20, dy: 10, dz: 13 },
    ]);
    expect(layerBoxes(cartons, base, 13).every((b) => b.z === 0)).toBe(true);
  });

  it('marks the cartons outside the usable footprint, touching its edge allowed', () => {
    expect(overhanging(cartons, base, usable)).toEqual([false, false, true]);
    expect(overhanging([{ x: 30, y: 32, rotated: false }], base, usable)).toEqual([false]);
    expect(overhanging([{ x: -0.25, y: 0, rotated: false }], base, usable)).toEqual([true]);
    expect(overhanging([{ x: 0, y: 32.01, rotated: false }], base, usable)).toEqual([true]);
  });

  it('draws a seam along the longer side of each carton, so a turned one shows', () => {
    const boxes = layerBoxes(cartons, base, 13);
    const seams = seamPositions(boxes, cartons, base, usable);
    expect(seams).toHaveLength(18);
    const seam = (k: number) => [...seams.slice(k * 6, k * 6 + 6)];
    // Unturned: along x, at the middle of its depth, on top of the carton.
    const [x0, y0, z0, x1, y1, z1] = seam(0) as [number, number, number, number, number, number];
    expect(z0).toBeCloseTo(z1);
    expect(z0).toBeCloseTo(5 - 21);
    expect(x1 - x0).toBeGreaterThan(10);
    expect(y0).toBe(y1);
    expect(y0).toBeGreaterThan(PALLET_HEIGHT + 13);
    // Turned: along z.
    const t = seam(1) as [number, number, number, number, number, number];
    expect(t[0]).toBeCloseTo(t[3]);
    expect(t[5] - t[2]).toBeGreaterThan(10);
    // A base longer along b: the seam of an unturned carton runs along z instead.
    const tall = seamPositions(boxes, cartons, { a: 10, b: 20 }, usable);
    expect(tall[0]).toBeCloseTo(tall[3]!);
  });

  it('measures a carton from the left and front edges, and back again', () => {
    // The front is the edge at the greatest y.
    expect(fromLeftFront(cartons[0]!, base, usable)).toEqual({ left: 0, front: 32 });
    expect(fromLeftFront(cartons[1]!, base, usable)).toEqual({ left: 30, front: 10 });
    for (const c of cartons) {
      const at = fromLeftFront(c, base, usable);
      expect(atLeftFront(c, base, usable, at)).toEqual({ x: c.x, y: c.y });
    }
    expect(atLeftFront(cartons[1]!, base, usable, { left: -2, front: 0 })).toEqual({
      x: -2,
      y: 22,
    });
  });

  it('turns a point of the scene into a point of the footprint', () => {
    expect(sceneToFootprint(0, 0, usable)).toEqual({ x: 25, y: 21 });
    expect(sceneToFootprint(-25, 21, usable)).toEqual({ x: 0, y: 42 });
  });
});

describe('the layer step views', () => {
  it('looks down at an angle from the front, and straight down for the top view', () => {
    // From above, and from the front (scene +z is the front of the pallet).
    expect(LAYER_VIEW_DIR[1]).toBeGreaterThan(0);
    expect(LAYER_VIEW_DIR[2]).toBeGreaterThan(0);
    const bounds = { min: [-25, 0, -21] as Vec, max: [25, 18, 21] as Vec };
    const top = perspectiveFit(bounds, 40, 1.5, TOP_VIEW_DIR);
    expect(top.position[0]).toBeCloseTo(top.target[0]);
    expect(top.position[1]).toBeGreaterThan(bounds.max[1]);
    // Tipped toward the front by a hair, so the front edge is at the bottom of the screen.
    const lean = top.position[2] - top.target[2];
    expect(lean).toBeGreaterThan(0);
    expect(lean).toBeLessThan(0.5);
  });
});

type Vec = [number, number, number];
