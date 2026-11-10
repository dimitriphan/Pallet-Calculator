import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layout } from '../../domain/types';
import { cartonKey, generateCartonCandidates } from './cartons';
import { productSize, usableFootprint, usableHeight } from './geometry';
import {
  allProductPlacements,
  cartonPlacements,
  productsInCarton,
  type PlacedCarton,
} from './positions';
import { buildLayouts, footprintAxes, layoutSignature, plainLayers } from './stacking';
import { boxesOutside, isInside, overlappingPairs } from './testSupport';

/** One 7 x 6 x 10 carton (1x1x1), pallet 30 x 30 x 25 (usable height 20). */
const MIXED: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 7, width: 6, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 10, width: 10, height: 10 },
  pallet: { length: 30, width: 30, height: 25 },
};

function candidateByKey(i: Inputs, key: string) {
  const c = generateCartonCandidates(i).find((x) => cartonKey(x) === key);
  if (!c) throw new Error(`no candidate ${key}`);
  return c;
}

function singleLayerLayout(i: Inputs, key: string, layer: Layout['layers'][number]): Layout {
  const carton = candidateByKey(i, key);
  const l: Layout = {
    id: '',
    carton,
    layers: [layer],
    totalCartons: layer.cartonCount,
    totalProducts: layer.cartonCount * carton.boxesPerCarton,
  };
  return { ...l, id: layoutSignature(l) };
}

describe('cartonPlacements', () => {
  it('emits cartons layer by layer, block by block, row by row with a running index', () => {
    // 7 x 6 footprint (H up), two blocks of 2 cols x 1 row, the second offset by one row
    const layout = singleLayerLayout(MIXED, '1x1x1', {
      vertical: 'H',
      height: 10,
      cartonCount: 4,
      blocks: [
        { x: 0, y: 0, cols: 2, rows: 1, rotated: false },
        { x: 0, y: 6, cols: 1, rows: 2, rotated: true },
      ],
      extent: { x: 14, y: 20 },
      z: 0,
    });
    const placed = cartonPlacements(layout, MIXED);
    // offset: x (30 - 14) / 2 = 8, y (30 - 20) / 2 = 5
    expect(placed).toEqual([
      {
        index: 0,
        layerIndex: 0,
        x: 8,
        y: 5,
        z: 0,
        dx: 7,
        dy: 6,
        dz: 10,
        axes: { x: 'L', y: 'W', z: 'H' },
      },
      {
        index: 1,
        layerIndex: 0,
        x: 15,
        y: 5,
        z: 0,
        dx: 7,
        dy: 6,
        dz: 10,
        axes: { x: 'L', y: 'W', z: 'H' },
      },
      {
        index: 2,
        layerIndex: 0,
        x: 8,
        y: 11,
        z: 0,
        dx: 6,
        dy: 7,
        dz: 10,
        axes: { x: 'W', y: 'L', z: 'H' },
      },
      {
        index: 3,
        layerIndex: 0,
        x: 8,
        y: 18,
        z: 0,
        dx: 6,
        dy: 7,
        dz: 10,
        axes: { x: 'W', y: 'L', z: 'H' },
      },
    ]);
  });

  it('orders cartons within a block row by row (x varies fastest)', () => {
    const layout = singleLayerLayout(MIXED, '1x1x1', {
      vertical: 'L',
      height: 7,
      cartonCount: 4,
      blocks: [{ x: 0, y: 0, cols: 2, rows: 2, rotated: false }],
      extent: { x: 12, y: 20 },
      z: 0,
    });
    const placed = cartonPlacements(layout, MIXED);
    expect(placed.map((p) => [p.x, p.y])).toEqual([
      [9, 5],
      [15, 5],
      [9, 15],
      [15, 15],
    ]);
    expect(placed[0]?.axes).toEqual({ x: 'W', y: 'H', z: 'L' });
  });

  it('centres on the bounding box of blocks that do not start at the origin', () => {
    const layout = singleLayerLayout(MIXED, '1x1x1', {
      vertical: 'H',
      height: 10,
      cartonCount: 1,
      blocks: [{ x: 3, y: 4, cols: 1, rows: 1, rotated: false }],
      extent: { x: 7, y: 6 },
      z: 0,
    });
    const [only] = cartonPlacements(layout, MIXED);
    expect(only?.x).toBe((30 - 7) / 2);
    expect(only?.y).toBe((30 - 6) / 2);
  });

  it('centres a layer whose extent is smaller than the footprint', () => {
    const c = candidateByKey(MIXED, '1x1x1');
    const plain = plainLayers(c, 'H', MIXED)[0]!; // 4 x 5 grid, extent 28 x 30
    expect(plain.extent).toEqual({ x: 28, y: 30 });
    const layout = buildLayouts(c, MIXED, new Map()).find((l) =>
      l.layers.every((layer) => layer.vertical === 'H' && layer.extent.x === 28),
    )!;
    expect(layout).toBeDefined();
    const placed = cartonPlacements(layout, MIXED);
    expect(Math.min(...placed.map((p) => p.x))).toBe((30 - 28) / 2);
    expect(Math.min(...placed.map((p) => p.y))).toBe((30 - layout.layers[0]!.extent.y) / 2);
  });

  it('stacks layers at their z with the carton height of their vertical axis', () => {
    const c = candidateByKey(MIXED, '1x1x1');
    const mixed = buildLayouts(c, MIXED, new Map()).find(
      (l) => new Set(l.layers.map((layer) => layer.vertical)).size > 1,
    )!;
    const placed = cartonPlacements(mixed, MIXED);
    for (const p of placed) {
      const layer = mixed.layers[p.layerIndex]!;
      expect(p.z).toBe(layer.z);
      expect(p.dz).toBe(c.outer[layer.vertical]);
      expect(p.axes.z).toBe(layer.vertical);
    }
  });
});

describe('productsInCarton', () => {
  it('packs products tight in a group centred in the carton', () => {
    // default product 12 x 8 x 4, carton 1x2x5: outer 13 x 17 x 21, walls 0.25, leeway 0.5
    const c = candidateByKey(DEFAULT_INPUTS, '1x2x5');
    const carton: PlacedCarton = {
      index: 0,
      layerIndex: 0,
      x: 100,
      y: 200,
      z: 300,
      dx: c.outer.W,
      dy: c.outer.L,
      dz: c.outer.H,
      axes: { x: 'W', y: 'L', z: 'H' },
    };
    const layout = singleLayerLayout(DEFAULT_INPUTS, '1x2x5', {
      vertical: 'H',
      height: c.outer.H,
      cartonCount: 1,
      blocks: [{ x: 0, y: 0, cols: 1, rows: 1, rotated: true }],
      extent: { x: c.outer.W, y: c.outer.L },
      z: 0,
    });
    const products = productsInCarton(layout, DEFAULT_INPUTS, carton);
    expect(products).toHaveLength(10);
    for (const p of products) {
      expect([p.dx, p.dy, p.dz]).toEqual([8, 12, 4]);
      expect(p.y).toBe(200.5);
    }
    expect(new Set(products.map((p) => p.x))).toEqual(new Set([100.5, 108.5]));
    expect(new Set(products.map((p) => p.z))).toEqual(new Set([300.5, 304.5, 308.5, 312.5, 316.5]));
  });
});

describe('placements of every default layout', () => {
  const i = DEFAULT_INPUTS;
  const usable = usableFootprint(i);
  const bounds = { ...usable, z: usableHeight(i) };
  const size = productSize(i);
  const layouts = generateCartonCandidates(i).flatMap((c) => buildLayouts(c, i, new Map()));

  it('has layouts to check', () => {
    expect(layouts.length).toBeGreaterThan(10);
  });

  it('places every carton inside the usable space without overlap', () => {
    for (const l of layouts) {
      const placed = cartonPlacements(l, i);
      expect(placed).toHaveLength(l.totalCartons);
      expect(placed.map((p) => p.index)).toEqual(placed.map((_, k) => k));
      expect(boxesOutside(placed, bounds)).toBe(0);
      expect(overlappingPairs(placed)).toBe(0);
      for (const p of placed) {
        const layer = l.layers[p.layerIndex]!;
        const [fa, fb] = footprintAxes(layer.vertical);
        expect([p.axes.x, p.axes.y].sort()).toEqual([fa, fb].sort());
        expect([p.dx, p.dy, p.dz]).toEqual([
          l.carton.outer[p.axes.x],
          l.carton.outer[p.axes.y],
          l.carton.outer[p.axes.z],
        ]);
      }
    }
  });

  it('centres each layer on its block extent', () => {
    for (const l of layouts) {
      const placed = cartonPlacements(l, i);
      l.layers.forEach((layer, k) => {
        const own = placed.filter((p) => p.layerIndex === k);
        expect(Math.min(...own.map((p) => p.x))).toBeCloseTo((usable.x - layer.extent.x) / 2, 9);
        expect(Math.min(...own.map((p) => p.y))).toBeCloseTo((usable.y - layer.extent.y) / 2, 9);
      });
    }
  });

  it('places every product inside its carton with wall clearance', () => {
    for (const l of layouts) {
      const all = allProductPlacements(l, i);
      expect(all).toHaveLength(l.totalProducts);
      let n = 0;
      for (const carton of cartonPlacements(l, i)) {
        const products = productsInCarton(l, i, carton);
        expect(products).toHaveLength(l.carton.boxesPerCarton);
        expect(overlappingPairs(products)).toBe(0);
        for (const p of products) {
          expect(isInside(p, carton, i.wallThickness)).toBe(true);
          expect(p.dz).toBe(size[carton.axes.z]);
          expect(p.dx).toBe(size[carton.axes.x]);
          expect(p.dy).toBe(size[carton.axes.y]);
          expect(all[n++]).toEqual(p);
        }
      }
    }
  });
});

describe('testSupport helpers', () => {
  const box = (x: number, y: number, z: number, d = 1) => ({ x, y, z, dx: d, dy: d, dz: d });

  it('counts overlapping pairs but not touching boxes', () => {
    expect(overlappingPairs([box(0, 0, 0), box(1, 0, 0), box(0, 1, 0), box(0, 0, 1)])).toBe(0);
    expect(overlappingPairs([box(0, 0, 0), box(0.5, 0.5, 0.5), box(0.9, 0.9, 0.9)])).toBe(3);
    expect(overlappingPairs([box(0, 0, 0, 3), box(2, 2, 2), box(5, 5, 5)])).toBe(1);
  });

  it('counts boxes outside a space and checks containment with clearance', () => {
    expect(boxesOutside([box(0, 0, 0), box(1, 1, 1), box(-0.5, 0, 0)], { x: 2, y: 2, z: 2 })).toBe(
      1,
    );
    expect(isInside(box(1, 1, 1), box(0, 0, 0, 3), 1)).toBe(true);
    expect(isInside(box(0.5, 1, 1), box(0, 0, 0, 3), 1)).toBe(false);
  });
});
