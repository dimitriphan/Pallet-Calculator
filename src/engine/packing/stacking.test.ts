import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layer, Layout } from '../../domain/types';
import { cartonKey, generateCartonCandidates } from './cartons';
import { usableFootprint, usableHeight } from './geometry';
import { gridLayer, searchLayer } from './layerSearch';
import {
  bestLayer,
  buildLayouts,
  footprintAxes,
  layoutSignature,
  plainLayers,
  type LayerCache,
} from './stacking';
import { fitsWithin } from './tolerance';

/** 10-inch cube, no leeway or walls, max carton 20 x 20 x 10, pallet 40 x 40 x 25 (usable height 20). */
const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

/**
 * One 7 x 6 x 10 carton (1x1x1), pallet 30 x 30 x 25 (usable height 20).
 * Best layers: L up 15 cartons x 7 in, W up 12 x 6 in, H up 20 x 10 in.
 * Single-axis maxima: L 30, W 36, H 40. The mixed stack 2 x L + 1 x W gives 42 in exactly 20 in.
 */
const MIXED: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 7, width: 6, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 10, width: 10, height: 10 },
  pallet: { length: 30, width: 30, height: 25 },
};

function verticals(l: Layout): Set<string> {
  return new Set(l.layers.map((layer) => layer.vertical));
}

function candidateByKey(i: Inputs, key: string) {
  const c = generateCartonCandidates(i).find((x) => cartonKey(x) === key);
  if (!c) throw new Error(`no candidate ${key}`);
  return c;
}

describe('footprintAxes', () => {
  it('returns the other two product axes in L, W, H order', () => {
    expect(footprintAxes('L')).toEqual(['W', 'H']);
    expect(footprintAxes('W')).toEqual(['L', 'H']);
    expect(footprintAxes('H')).toEqual(['L', 'W']);
  });
});

describe('bestLayer', () => {
  it('runs the layer search on the usable footprint with the footprint sizes', () => {
    const c = candidateByKey(DEFAULT_INPUTS, '1x2x5');
    const { x, y } = usableFootprint(DEFAULT_INPUTS);
    const layer = bestLayer(c, 'H', DEFAULT_INPUTS, new Map());
    const search = searchLayer(x, y, c.outer.L, c.outer.W);
    expect(layer).not.toBeNull();
    expect(layer?.vertical).toBe('H');
    expect(layer?.height).toBe(c.outer.H);
    expect(layer?.cartonCount).toBe(search.count);
    expect(layer?.blocks).toEqual(search.blocks);
  });

  it('reports the bounding size of the blocks as the extent', () => {
    const layer = bestLayer(candidateByKey(CUBES, '1x2x2'), 'L', CUBES, new Map());
    expect(layer?.extent).toEqual({ x: 40, y: 40 });
    const w = bestLayer(candidateByKey(MIXED, '1x1x1'), 'W', MIXED, new Map());
    expect(w?.cartonCount).toBe(12);
    // 7 x 10 footprint: an unrotated block spans 7 along x, a rotated one 10
    const maxX = Math.max(...(w?.blocks ?? []).map((b) => b.x + b.cols * (b.rotated ? 10 : 7)));
    const maxY = Math.max(...(w?.blocks ?? []).map((b) => b.y + b.rows * (b.rotated ? 7 : 10)));
    expect(w?.extent).toEqual({ x: maxX, y: maxY });
  });

  it('caches on the footprint sizes and keeps the vertical axis and height of each request', () => {
    // 1x2x2 cube carton: outer 10 x 20 x 20. Vertical W and H share the footprint 10 x 20.
    const c = candidateByKey(CUBES, '1x2x2');
    const cache: LayerCache = new Map();
    const w = bestLayer(c, 'W', CUBES, cache);
    expect([...cache.keys()]).toEqual(['10|20']);
    const h = bestLayer(c, 'H', CUBES, cache);
    expect(cache.size).toBe(1);
    expect(w?.vertical).toBe('W');
    expect(h?.vertical).toBe('H');
    expect(h?.cartonCount).toBe(w?.cartonCount);
    expect(h?.blocks).toEqual(w?.blocks);
  });

  it('returns null when nothing fits and caches the null', () => {
    const tiny: Inputs = { ...CUBES, pallet: { length: 15, width: 15, height: 25 } };
    const cache: LayerCache = new Map();
    expect(bestLayer(candidateByKey(tiny, '1x2x2'), 'L', tiny, cache)).toBeNull();
    expect(cache.get('20|20')).toBeNull();
  });
});

describe('plainLayers', () => {
  it('returns both flat rotations of the plain grid on the usable footprint', () => {
    const c = candidateByKey(MIXED, '1x1x1');
    const layers = plainLayers(c, 'H', MIXED);
    expect(layers.map((l) => l.blocks)).toEqual([
      gridLayer(30, 30, 7, 6, false).blocks,
      gridLayer(30, 30, 7, 6, true).blocks,
    ]);
    for (const l of layers) {
      expect(l.vertical).toBe('H');
      expect(l.height).toBe(10);
    }
    expect(layers[0]?.cartonCount).toBe(20); // 4 x 5
    expect(layers[0]?.extent).toEqual({ x: 28, y: 30 });
    expect(layers[1]?.extent).toEqual({ x: 30, y: 28 });
  });

  it('omits a rotation that holds nothing', () => {
    const narrow: Inputs = { ...CUBES, pallet: { length: 40, width: 15, height: 25 } };
    // 1x2x2 with H vertical: footprint 10 x 20; only the rotated grid (20 along x) fits 15 in of width
    const layers = plainLayers(candidateByKey(narrow, '1x2x2'), 'H', narrow);
    expect(layers).toHaveLength(1);
    expect(layers[0]?.blocks).toEqual([{ x: 0, y: 0, cols: 2, rows: 1, rotated: true }]);
  });
});

describe('buildLayouts', () => {
  it('fills the exact cube case with 32 products in every layout of every candidate', () => {
    const candidates = generateCartonCandidates(CUBES);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      const layouts = buildLayouts(c, CUBES, new Map());
      expect(layouts.length).toBeGreaterThan(0);
      for (const l of layouts) expect(l.totalProducts).toBe(32);
    }
  });

  it('adds the mixed stack when two vertical axes beat any single axis', () => {
    const layouts = buildLayouts(candidateByKey(MIXED, '1x1x1'), MIXED, new Map());
    const best = Math.max(...layouts.map((l) => l.totalCartons));
    expect(best).toBe(42);
    const mixed = layouts.filter((l) => verticals(l).size > 1);
    expect(mixed).toHaveLength(1);
    const m = mixed[0] as Layout;
    expect(m.totalCartons).toBe(42);
    expect(m.layers.map((l) => [l.vertical, l.cartonCount, l.height, l.z])).toEqual([
      ['L', 15, 7, 0],
      ['L', 15, 7, 7],
      ['W', 12, 6, 14],
    ]);
    // the single-axis stacks are present too
    const singles = layouts.filter((l) => verticals(l).size === 1);
    for (const axis of ['L', 'W', 'H'] as const) {
      expect(singles.some((l) => l.layers[0]?.vertical === axis)).toBe(true);
    }
    expect(Math.max(...singles.map((l) => l.totalCartons))).toBe(40);
  });

  it('prefers a single axis over a mixed stack with the same carton count', () => {
    // 1x1x2 cube carton, outer 10 x 10 x 20: 2 x L, 2 x W, 1 x H and 1 x L + 1 x W all hold 16
    const layouts = buildLayouts(candidateByKey(CUBES, '1x1x2'), CUBES, new Map());
    expect(layouts.map((l) => l.totalCartons)).toContain(16);
    for (const l of layouts) expect(verticals(l).size).toBe(1);
  });

  it('never mixes vertical axes when cartons must stay upright', () => {
    const upright = { ...MIXED, keepCartonsUpright: true };
    const layouts = buildLayouts(candidateByKey(upright, '1x1x1'), upright, new Map());
    for (const l of layouts) expect(verticals(l).size).toBe(1);
    expect(new Set(layouts.map((l) => l.layers[0]?.vertical))).toEqual(new Set(['L', 'W', 'H']));
    expect(Math.max(...layouts.map((l) => l.totalCartons))).toBe(40);

    const def = { ...DEFAULT_INPUTS, keepCartonsUpright: true };
    const layoutsDef = buildLayouts(candidateByKey(def, '1x2x5'), def, new Map());
    expect(layoutsDef.length).toBeGreaterThan(0);
    for (const l of layoutsDef) expect(verticals(l).size).toBe(1);
  });

  it('uses all three vertical axes for carton 1x2x5 on the default pallet (no outer size exceeds 67)', () => {
    const c = candidateByKey(DEFAULT_INPUTS, '1x2x5');
    for (const v of ['L', 'W', 'H'] as const) {
      expect(fitsWithin(c.outer[v], usableHeight(DEFAULT_INPUTS))).toBe(true);
    }
    const layouts = buildLayouts(c, DEFAULT_INPUTS, new Map());
    const used = new Set(layouts.flatMap((l) => l.layers.map((layer) => layer.vertical)));
    expect(used).toEqual(new Set(['L', 'W', 'H']));
  });

  it('keeps the product upright when rotation is "upright"', () => {
    const i: Inputs = { ...DEFAULT_INPUTS, rotationMode: 'upright' };
    for (const c of generateCartonCandidates(i)) {
      for (const l of buildLayouts(c, i, new Map())) {
        for (const layer of l.layers) expect(layer.vertical).toBe('H');
      }
    }
  });

  it('skips a vertical axis whose carton height exceeds the usable height', () => {
    // usable height 15: the 1x2x5 carton (outer 13 x 17 x 21) may only stand with L vertical
    const i: Inputs = { ...DEFAULT_INPUTS, pallet: { length: 50, width: 42, height: 20 } };
    const layouts = buildLayouts(candidateByKey(i, '1x2x5'), i, new Map());
    expect(layouts.length).toBeGreaterThan(0);
    for (const l of layouts) for (const layer of l.layers) expect(layer.vertical).toBe('L');
  });

  it('returns [] when the carton is taller than the usable height on every allowed axis', () => {
    const i: Inputs = { ...DEFAULT_INPUTS, pallet: { length: 50, width: 42, height: 5.5 } };
    expect(buildLayouts(generateCartonCandidates(DEFAULT_INPUTS)[0]!, i, new Map())).toEqual([]);
  });

  it('returns [] when the footprint holds no carton', () => {
    const i: Inputs = { ...CUBES, pallet: { length: 5, width: 5, height: 60 } };
    expect(buildLayouts(candidateByKey(CUBES, '1x1x1'), i, new Map())).toEqual([]);
  });

  it('includes plain-grid stacks that differ from the best layer', () => {
    const layouts = buildLayouts(candidateByKey(MIXED, '1x1x1'), MIXED, new Map());
    const plain = plainLayers(candidateByKey(MIXED, '1x1x1'), 'H', MIXED);
    for (const p of plain) {
      const sig = p.blocks.map((b) => `${b.cols}x${b.rows}${b.rotated ? 'r' : 'u'}`).join(',');
      expect(
        layouts.some(
          (l) =>
            l.layers.length === 2 &&
            l.layers.every(
              (layer) =>
                layer.vertical === 'H' &&
                layer.blocks.map((b) => `${b.cols}x${b.rows}${b.rotated ? 'r' : 'u'}`).join(',') ===
                  sig,
            ),
        ),
      ).toBe(true);
    }
  });

  it('returns distinct, deterministic layouts whose id is the signature', () => {
    const c = candidateByKey(DEFAULT_INPUTS, '1x2x5');
    const a = buildLayouts(c, DEFAULT_INPUTS, new Map());
    const b = buildLayouts(c, DEFAULT_INPUTS, new Map());
    expect(a).toEqual(b);
    const ids = a.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of a) expect(l.id).toBe(layoutSignature(l));
  });

  it('gives the same result with a shared cache as with a fresh one', () => {
    const shared: LayerCache = new Map();
    for (const c of generateCartonCandidates(DEFAULT_INPUTS)) {
      expect(buildLayouts(c, DEFAULT_INPUTS, shared)).toEqual(
        buildLayouts(c, DEFAULT_INPUTS, new Map()),
      );
    }
  });

  it('satisfies the layer invariants for every default candidate', () => {
    const h = usableHeight(DEFAULT_INPUTS);
    for (const c of generateCartonCandidates(DEFAULT_INPUTS)) {
      for (const l of buildLayouts(c, DEFAULT_INPUTS, new Map())) {
        expect(l.carton).toBe(c);
        expect(l.layers.length).toBeGreaterThan(0);
        expect(l.totalCartons).toBe(l.layers.reduce((s, layer) => s + layer.cartonCount, 0));
        expect(l.totalProducts).toBe(l.totalCartons * c.boxesPerCarton);
        let z = 0;
        let prev: Layer | undefined;
        for (const layer of l.layers) {
          expect(layer.z).toBe(z);
          expect(layer.height).toBe(c.outer[layer.vertical]);
          expect(layer.blocks.reduce((s, b) => s + b.cols * b.rows, 0)).toBe(layer.cartonCount);
          if (prev) {
            const ordered =
              prev.cartonCount > layer.cartonCount ||
              (prev.cartonCount === layer.cartonCount && prev.height >= layer.height);
            expect(ordered).toBe(true);
          }
          z += layer.height;
          prev = layer;
        }
        expect(fitsWithin(z, h)).toBe(true);
      }
    }
  });
});

describe('layoutSignature', () => {
  const c = generateCartonCandidates(CUBES)[0]!;
  const layer = (blocks: Layer['blocks']): Layer => ({
    vertical: 'H',
    height: 10,
    cartonCount: blocks.reduce((s, b) => s + b.cols * b.rows, 0),
    blocks,
    extent: { x: 40, y: 40 },
    z: 0,
  });
  const layout = (layers: Layer[]): Layout => ({
    id: '',
    carton: c,
    layers,
    totalCartons: 0,
    totalProducts: 0,
  });

  it('lists carton key, then vertical, count and sorted blocks per layer', () => {
    const l = layout([
      layer([
        { x: 0, y: 0, cols: 2, rows: 1, rotated: true },
        { x: 0, y: 20, cols: 1, rows: 2, rotated: false },
      ]),
      { ...layer([{ x: 0, y: 0, cols: 2, rows: 2, rotated: false }]), z: 10 },
    ]);
    expect(layoutSignature(l)).toBe(`${cartonKey(c)}|H:4:1x2u,2x1r/H:4:2x2u`);
  });

  it('ignores block positions and order', () => {
    const one = layout([
      layer([
        { x: 0, y: 0, cols: 2, rows: 1, rotated: true },
        { x: 0, y: 20, cols: 1, rows: 2, rotated: false },
      ]),
    ]);
    const mirrored = layout([
      layer([
        { x: 0, y: 0, cols: 1, rows: 2, rotated: false },
        { x: 0, y: 20, cols: 2, rows: 1, rotated: true },
      ]),
    ]);
    expect(layoutSignature(mirrored)).toBe(layoutSignature(one));
  });
});
