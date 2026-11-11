import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, EPS } from '../../domain/constants';
import { STABILITY } from '../../domain/stabilityThresholds';
import type {
  Block,
  CartonCandidate,
  Inputs,
  Layer,
  Layout,
  ProductAxis,
} from '../../domain/types';
import { assessStability, measureStability, supportShare } from '../analytics/stability';
import { generateCartonCandidates } from './cartons';
import { usableFootprint } from './geometry';
import { interlockLayers, turnBlocks } from './interlock';
import { assertNoOverlapWithin } from './overlap.testSupport';
import { cartonPlacements } from './positions';
import { blocksBounds, buildLayouts, footprintAxes, layoutSignature } from './stacking';
import { PINWHEEL_INPUTS } from './testSupport';

function carton(L: number, W: number, H: number): CartonCandidate {
  return {
    counts: { L: 1, W: 1, H: 1 },
    inner: { L, W, H },
    outer: { L, W, H },
    boxesPerCarton: 2,
    utilization: 1,
    emptyVolume: 0,
  };
}

function block(x: number, y: number, cols: number, rows: number, rotated = false): Block {
  return { x, y, cols, rows, rotated };
}

/** `n` layers of the same blocks (one shared list, as the stacking code builds them). */
function stackOf(c: CartonCandidate, specs: [ProductAxis, Block[], number][]): Layout {
  let z = 0;
  const layers: Layer[] = specs.flatMap(([vertical, blocks, n]) => {
    const [fa, fb] = footprintAxes(vertical);
    const pattern = {
      vertical,
      height: c.outer[vertical],
      cartonCount: blocks.reduce((s, b) => s + b.cols * b.rows, 0),
      blocks,
      extent: blocksBounds(blocks, c.outer[fa], c.outer[fb]).size,
    };
    return Array.from({ length: n }, () => {
      const layer = { ...pattern, z };
      z += pattern.height;
      return layer;
    });
  });
  const totalCartons = layers.reduce((s, l) => s + l.cartonCount, 0);
  const l: Layout = {
    id: '',
    carton: c,
    layers,
    totalCartons,
    totalProducts: totalCartons * c.boxesPerCarton,
  };
  l.id = layoutSignature(l);
  return l;
}

/** Pallet 30 x 40 (no overhang), 70 tall: a 30 x 40 usable footprint and 65 in of height. */
const SMALL: Inputs = {
  ...DEFAULT_INPUTS,
  pallet: { length: 30, width: 40, height: 70 },
  overhang: 0,
};

/** Every layer valid in its frame and every placed carton inside the usable footprint. */
function expectValid(l: Layout, i: Inputs): void {
  const { x, y } = usableFootprint(i);
  for (const layer of l.layers) {
    const [fa, fb] = footprintAxes(layer.vertical);
    assertNoOverlapWithin(layer.blocks, l.carton.outer[fa], l.carton.outer[fb], x, y);
  }
  for (const p of cartonPlacements(l, i)) {
    expect(p.x).toBeGreaterThanOrEqual(-EPS);
    expect(p.y).toBeGreaterThanOrEqual(-EPS);
    expect(p.x + p.dx).toBeLessThanOrEqual(x + EPS);
    expect(p.y + p.dy).toBeLessThanOrEqual(y + EPS);
  }
}

describe('turnBlocks', () => {
  it('turns each block about the centre of the footprint and keeps the order of a turn', () => {
    // 10 x 20 cartons: a 1 x 4 column (10 x 80) at x 0, a turned 2 x 2 block (40 x 20) at 10.
    const blocks = [block(0, 0, 1, 4), block(10, 0, 2, 2, true)];
    expect(turnBlocks(blocks, 10, 20, 60, 90, 'grid')).toEqual([
      block(60 - 10 - 40, 90 - 0 - 20, 2, 2, true),
      block(60 - 0 - 10, 90 - 0 - 80, 1, 4),
    ]);
  });
});

describe('interlockLayers', () => {
  // 10 x 20 x 5 cartons. A 1 x 2 column (10 x 40) and a turned 1 x 4 block (20 x 40) beside it
  // fill the 30 x 40 footprint; turned, the column moves to the other side.
  const c = carton(10, 20, 5);
  const twoBlocks = [block(0, 0, 1, 2), block(10, 0, 1, 4, true)];

  it('turns layers 2, 4 and 6 of an asymmetric two-block layer stacked six high', () => {
    const l = stackOf(c, [['H', twoBlocks, 6]]);
    expect(assessStability(l, SMALL).warnings.map((w) => w.check)).toEqual(['columns']);
    const out = interlockLayers(l, SMALL);
    expect(out.layers.map((layer) => layer.turned === true)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(out.totalCartons).toBe(l.totalCartons);
    expect(out.totalProducts).toBe(l.totalProducts);
    expect(out.layers.map((layer) => [layer.cartonCount, layer.z, layer.height])).toEqual(
      l.layers.map((layer) => [layer.cartonCount, layer.z, layer.height]),
    );
    expectValid(out, SMALL);
    // The turned layer is the placed layer turned half a turn about the footprint's centre.
    const before = cartonPlacements(l, SMALL).filter((p) => p.layerIndex === 1);
    const after = cartonPlacements(out, SMALL).filter((p) => p.layerIndex === 1);
    const key = (p: { x: number; y: number; dx: number; dy: number }) =>
      `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.dx},${p.dy}`;
    expect(after.map(key).sort()).toEqual(
      before.map((p) => key({ ...p, x: 30 - p.x - p.dx, y: 40 - p.y - p.dy })).sort(),
    );
    expect(measureStability(out).columns).toEqual({ layers: 1, from: 1 });
    expect(assessStability(out, SMALL)).toEqual({ rating: 'good', warnings: [] });
    // A new id, because the layers are not where they were.
    expect(out.id).not.toBe(l.id);
    expect(out.id).toBe(layoutSignature(out));
  });

  it('leaves a grid that looks the same turned alone, so the columns caution stands', () => {
    // A 3 x 2 grid filling the footprint, and a 2 x 2 grid that does not (flush at the origin,
    // so its blocks do move when turned, but the placed cartons stay where they were).
    for (const blocks of [[block(0, 0, 3, 2)], [block(0, 0, 2, 2)]]) {
      const l = stackOf(c, [['H', blocks, 6]]);
      const out = interlockLayers(l, SMALL);
      expect(out).toBe(l);
      expect(assessStability(out, SMALL).warnings.map((w) => w.check)).toEqual(['columns']);
    }
  });

  it('turns nothing when a turned layer would rest on less than 90% of the layer below', () => {
    // The column and a turned 1 x 2 block (20 x 20) only: turned, half of it overhangs a gap.
    const blocks = [block(0, 0, 1, 2), block(10, 0, 1, 2, true)];
    const l = stackOf(c, [['H', blocks, 6]]);
    const out = interlockLayers(l, SMALL);
    expect(out).toBe(l);
    // The share it would have had, for the record: 400 of 800 in².
    const turned = { ...l.layers[1]!, blocks: turnBlocks(blocks, 10, 20, 30, 40, 'grid') };
    expect(supportShare(turned, l.layers[0]!, l)).toBeCloseTo(0.5, 12);
    expect(0.5).toBeLessThan(STABILITY.supportShare.caution);
  });

  it('turns nothing when the layer above the run would lose its support', () => {
    // 10 x 10 cartons on a 100 x 100 footprint. The run's layer: a 10 x 9 grid and one carton
    // at the top-left corner. Turned, it still rests on 82 of its 91 cartons (0.90).
    const c10 = carton(10, 10, 5);
    const wide: Inputs = { ...SMALL, pallet: { length: 100, width: 100, height: 70 } };
    const runLayer = [block(0, 0, 10, 9), block(0, 90, 1, 1)];
    const pair = stackOf(c10, [['H', runLayer, 2]]);
    const turnedPair = interlockLayers(pair, wide);
    expect(turnedPair.layers.map((layer) => layer.turned === true)).toEqual([false, true]);
    expect(supportShare(turnedPair.layers[1]!, pair.layers[0]!, pair)).toBeCloseTo(82 / 91, 12);
    // On top: three corner cartons. On the unturned layer all three are carried; on the
    // turned one the bottom-left carton is over the gap, so only two of three are.
    const corners = [block(0, 0, 1, 1), block(90, 0, 1, 1), block(0, 90, 1, 1)];
    const l = stackOf(c10, [
      ['H', runLayer, 2],
      ['H', corners, 1],
    ]);
    expect(supportShare(l.layers[2]!, l.layers[1]!, l)).toBe(1);
    const withTop = { ...turnedPair, layers: [...turnedPair.layers, { ...l.layers[2]! }] };
    expect(supportShare(withTop.layers[2]!, withTop.layers[1]!, withTop)).toBeCloseTo(2 / 3, 12);
    expect(interlockLayers(l, wide)).toBe(l);
  });

  it('works on each run of a mixed stack separately', () => {
    // 10 x 20 x 10 carton: three layers lying on W (footprint 10 x 10), then three on H.
    const mixed = carton(10, 20, 10);
    const onW = [block(0, 0, 3, 4)]; // 30 x 40, symmetric
    const l = stackOf(mixed, [
      ['W', onW, 3],
      ['H', twoBlocks, 3],
    ]);
    const out = interlockLayers(l, SMALL);
    expect(out.layers.map((layer) => layer.turned === true)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expectValid(out, SMALL);
    expect(out.totalCartons).toBe(l.totalCartons);
  });

  /** The six-high stack of pinwheel layers standing on H for a product that is its carton. */
  function pinwheelStack(i: Inputs): Layout {
    const cand = generateCartonCandidates(i).find((k) => k.boxesPerCarton === 1)!;
    const found = buildLayouts(cand, i, new Map()).find(
      (l) =>
        l.layers.length === 6 &&
        l.layers.every((layer) => layer.kind === 'pinwheel' && layer.vertical === 'H'),
    );
    expect(found).toBeDefined();
    return found!;
  }

  /** 48 x 40 pallet, 13.5 x 10.5 x 10 cartons: a pinwheel of 12 (straight cuts fit 11). */
  const ASYMMETRIC_PINWHEEL: Inputs = {
    ...PINWHEEL_INPUTS,
    pallet: { length: 48, width: 40, height: 65 },
    product: { length: 13.5, width: 10.5, height: 10 },
    maxCarton: { length: 13.5, width: 10.5, height: 10 },
  };

  it('turns alternate layers of a pinwheel stack and keeps them valid', () => {
    const l = pinwheelStack(ASYMMETRIC_PINWHEEL);
    expect(l.layers[0]!.cartonCount).toBe(12);
    const out = interlockLayers(l, ASYMMETRIC_PINWHEEL);
    expect(out.layers.map((layer) => layer.turned === true)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expectValid(out, ASYMMETRIC_PINWHEEL);
    expect(out.totalCartons).toBe(l.totalCartons);
    for (const layer of out.layers) {
      expect(layer.kind).toBe('pinwheel');
      // Still bottom-left, bottom-right, top-right, top-left, alternately turned 90°.
      const [bl, br, tr, tl] = layer.blocks;
      const r = bl!.rotated;
      expect([br!.rotated, tr!.rotated, tl!.rotated]).toEqual([!r, r, !r]);
      expect(br!.x).toBeGreaterThan(bl!.x);
      expect(tr!.y).toBeGreaterThan(br!.y);
      expect(tl!.x).toBeLessThan(tr!.x);
    }
    // 0.942 of each turned layer rests on the layer below (and the other way).
    expect(supportShare(out.layers[1]!, out.layers[0]!, out)).toBeGreaterThan(0.94);
    expect(measureStability(out).columns).toEqual({ layers: 1, from: 1 });
  });

  it('leaves a pinwheel alone when it looks the same turned', () => {
    // The pinned 16.5 x 10.5 pinwheel is symmetric under a half turn.
    const i: Inputs = { ...PINWHEEL_INPUTS, pallet: { ...PINWHEEL_INPUTS.pallet, height: 113 } };
    const l = pinwheelStack(i);
    expect(interlockLayers(l, i)).toBe(l);
  });

  it('leaves a pinwheel alone when its turn would rest on less than 90%', () => {
    // 50 x 42 pallet, 11 x 8.5 cartons: turned, a layer rests on 0.89 of the one below.
    const i: Inputs = {
      ...PINWHEEL_INPUTS,
      pallet: { length: 50, width: 42, height: 65 },
      product: { length: 11, width: 8.5, height: 10 },
      maxCarton: { length: 11, width: 8.5, height: 10 },
    };
    const l = pinwheelStack(i);
    expect(interlockLayers(l, i)).toBe(l);
  });

  it('turns nothing in a layout of distinct layers', () => {
    const l = stackOf(c, [
      ['H', twoBlocks, 1],
      ['H', [block(0, 0, 3, 2)], 1],
    ]);
    expect(interlockLayers(l, SMALL)).toBe(l);
  });
});
