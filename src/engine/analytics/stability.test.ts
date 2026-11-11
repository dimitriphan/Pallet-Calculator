import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import { STABILITY } from '../../domain/stabilityThresholds';
import type {
  Block,
  CartonCandidate,
  Layer,
  Layout,
  ProductAxis,
  StabilityWarning,
} from '../../domain/types';
import { blocksBounds, footprintAxes } from '../packing/stacking';
import {
  assessStability,
  describeWarning,
  measureStability,
  ratingOf,
  supportShare,
} from './stability';

function carton(L: number, W: number, H: number): CartonCandidate {
  return {
    counts: { L: 1, W: 1, H: 1 },
    inner: { L, W, H },
    outer: { L, W, H },
    boxesPerCarton: 1,
    utilization: 1,
    emptyVolume: 0,
  };
}

function block(x: number, y: number, cols: number, rows: number, rotated = false): Block {
  return { x, y, cols, rows, rotated };
}

/** A layout from layers given bottom first as [vertical, blocks]; z and totals worked out. */
function layout(c: CartonCandidate, specs: [ProductAxis, Block[]][]): Layout {
  let z = 0;
  const layers: Layer[] = specs.map(([vertical, blocks]) => {
    const [fa, fb] = footprintAxes(vertical);
    const height = c.outer[vertical];
    const cartonCount = blocks.reduce((s, b) => s + b.cols * b.rows, 0);
    const layer: Layer = {
      vertical,
      height,
      cartonCount,
      blocks,
      extent: blocksBounds(blocks, c.outer[fa], c.outer[fb]).size,
      z,
    };
    z += height;
    return layer;
  });
  const totalCartons = layers.reduce((s, l) => s + l.cartonCount, 0);
  return { id: 'test', carton: c, layers, totalCartons, totalProducts: totalCartons };
}

const checks = (l: Layout) => assessStability(l, DEFAULT_INPUTS).warnings;
const only = (l: Layout, check: StabilityWarning['check']) =>
  checks(l).filter((w) => w.check === check);

describe('stack height check', () => {
  // One 20 x 20 carton per layer, two layers: stack height 2H over a 20 in base.
  const twoHigh = (h: number) =>
    layout(carton(20, 20, h), [
      ['H', [block(0, 0, 1, 1)]],
      ['H', [block(0, 0, 1, 1)]],
    ]);

  it('is the stack height over the shorter side of the bottom layer', () => {
    expect(measureStability(twoHigh(15)).stackHeightRatio).toBeCloseTo(1.5, 12);
    // 4 x 2 cartons of 10 x 10: a 40 x 20 base; three layers of 10 make 30 -> 1.5.
    const wide = layout(carton(10, 10, 10), [
      ['H', [block(0, 0, 4, 2)]],
      ['H', [block(0, 0, 4, 2)]],
      ['H', [block(0, 0, 4, 2)]],
    ]);
    expect(measureStability(wide).stackHeightRatio).toBeCloseTo(1.5, 12);
  });

  it.each([
    [14.99, []],
    [15, []],
    [15.01, ['caution']],
    [19.99, ['caution']],
    [20, ['caution']],
    [20.01, ['serious']],
  ])('carton height %s gives %j', (h, levels) => {
    expect(only(twoHigh(h), 'stackHeight').map((w) => w.level)).toEqual(levels);
  });

  it('reports the ratio as its value and no layer', () => {
    const [w] = only(twoHigh(18), 'stackHeight');
    expect(w).toEqual({ check: 'stackHeight', level: 'caution', value: 1.8 });
  });
});

describe('carton height check', () => {
  // A 4 x 4 grid of 10 x 10 cartons: a 40 x 40 base, so the stack stays low.
  const grid = (h: number) => layout(carton(10, 10, h), [['H', [block(0, 0, 4, 4)]]]);

  it.each([
    [14.99, []],
    [15, []],
    [15.01, ['caution']],
    [24.99, ['caution']],
    [25, ['caution']],
    [25.01, ['serious']],
  ])('height %s on a 10 in base gives %j', (h, levels) => {
    expect(only(grid(h), 'cartonHeight').map((w) => w.level)).toEqual(levels);
  });

  it('is measured per layer when cartons stand on different axes, worst layer reported', () => {
    // 10 x 10 x 30 carton. Layer 1 lies on its length (footprint 10 x 30, 10 tall: 1.0);
    // layer 2 stands on its height (footprint 10 x 10, 30 tall: 3.0).
    const l = layout(carton(10, 10, 30), [
      ['L', [block(0, 0, 4, 2)]], // 40 x 60
      ['H', [block(0, 0, 4, 4)]], // 40 x 40
    ]);
    expect(measureStability(l).cartonHeight).toEqual({ ratio: 3, layer: 2 });
    expect(only(l, 'cartonHeight')).toEqual([
      { check: 'cartonHeight', level: 'serious', value: 3, layer: 2 },
    ]);
    // Stack 40 over the bottom layer's shorter side 40.
    expect(measureStability(l).stackHeightRatio).toBe(1);
    expect(measureStability(l).support).toEqual({ share: 1, layer: 2 });
  });

  it('reports the lowest of equally bad layers', () => {
    const l = layout(carton(10, 10, 20), [
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 4, 4)]],
    ]);
    expect(measureStability(l).cartonHeight).toEqual({ ratio: 2, layer: 1 });
  });
});

describe('supportShare', () => {
  const c = carton(10, 10, 10);

  it('is 1 for an identical layer', () => {
    const l = layout(c, [
      ['H', [block(0, 0, 3, 2)]],
      ['H', [block(0, 0, 3, 2)]],
    ]);
    expect(supportShare(l.layers[1]!, l.layers[0]!, l)).toBe(1);
  });

  it('is worked out for a layer shifted by half a carton', () => {
    // Lower: cartons at x 0-10 and 20-30 (centred: -15..-5 and 5..15).
    // Upper: cartons at x 0-10 and 10-20 (centred: -10..0 and 0..10).
    // Overlap: -10..-5 (5 in) and 5..10 (5 in), all 10 in deep: 100 of 200 in².
    const l = layout(c, [
      ['H', [block(0, 0, 1, 1), block(20, 0, 1, 1)]],
      ['H', [block(0, 0, 2, 1)]],
    ]);
    expect(supportShare(l.layers[1]!, l.layers[0]!, l)).toBeCloseTo(0.5, 12);
  });

  it('is 1 for a smaller layer centred on a larger one, and a quarter the other way', () => {
    const l = layout(c, [
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 2, 2)]],
      ['H', [block(0, 0, 4, 4)]],
    ]);
    expect(supportShare(l.layers[1]!, l.layers[0]!, l)).toBe(1);
    expect(supportShare(l.layers[2]!, l.layers[1]!, l)).toBeCloseTo(0.25, 12);
  });

  it('works across layers standing on different axes', () => {
    // 10 x 10 x 20 carton. Lower lies on its length: footprint 10 (W) x 20 (H), 2 x 1 -> 20 x 20.
    // Upper stands on its height: footprint 10 x 10, 4 x 4 -> 40 x 40 centred: 400 of 1600.
    const l = layout(carton(10, 10, 20), [
      ['L', [block(0, 0, 2, 1)]],
      ['H', [block(0, 0, 4, 4)]],
    ]);
    expect(supportShare(l.layers[1]!, l.layers[0]!, l)).toBeCloseTo(0.25, 12);
  });
});

describe('support check', () => {
  /**
   * 10 x 10 x h carton. Upper: 10 x 10 of them standing on H (100 x 100). Lower: k x 10 lying on
   * L and turned, each h wide along x and 10 deep: k·h x 100, so the share is k·h / 100.
   */
  const supported = (k: number, h: number) =>
    layout(carton(10, 10, h), [
      ['L', [block(0, 0, k, 10, true)]],
      ['H', [block(0, 0, 10, 10)]],
    ]);

  it.each([
    [9, 10.01, []],
    [9, 10, []],
    [9, 9.99, ['caution']],
    [7, 10.01, ['caution']],
    [7, 10, ['caution']],
    [7, 9.99, ['serious']],
  ])('k = %s, h = %s gives %j', (k, h, levels) => {
    expect(
      supportShare(supported(k, h).layers[1]!, supported(k, h).layers[0]!, supported(k, h)),
    ).toBeCloseTo((k * h) / 100, 12);
    expect(only(supported(k, h), 'support').map((w) => w.level)).toEqual(levels);
  });

  it('reports the worst layer by its number', () => {
    const l = layout(carton(10, 10, 10), [
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 2, 2)]],
      ['H', [block(0, 0, 4, 4)]], // a quarter supported
    ]);
    expect(measureStability(l).support).toEqual({ share: 0.25, layer: 4 });
    expect(only(l, 'support')).toEqual([
      { check: 'support', level: 'serious', value: 0.25, layer: 4 },
    ]);
  });

  it('is absent with a single layer', () => {
    expect(measureStability(layout(carton(10, 10, 10), [['H', [block(0, 0, 4, 4)]]])).support).toBe(
      null,
    );
  });
});

describe('columns check', () => {
  const stack = (n: number) =>
    layout(
      carton(10, 10, 10),
      Array.from({ length: n }, () => ['H', [block(0, 0, 4, 4)]] as [ProductAxis, Block[]]),
    );

  it.each([
    [3, []],
    [STABILITY.columnLayers, ['caution']],
    [5, ['caution']],
  ])('%s identical layers give %j', (n, levels) => {
    expect(only(stack(n), 'columns').map((w) => w.level)).toEqual(levels);
  });

  it('counts the longest run and names its first layer', () => {
    const l = layout(carton(10, 10, 5), [
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 2, 2)]],
      ...Array.from({ length: 5 }, () => ['H', [block(0, 0, 4, 4)]] as [ProductAxis, Block[]]),
    ]);
    expect(measureStability(l).columns).toEqual({ layers: 5, from: 3 });
    expect(only(l, 'columns')).toEqual([
      { check: 'columns', level: 'caution', value: 5, layer: 3 },
    ]);
  });

  it('compares the carton rectangles, not how they are split into blocks', () => {
    // A 4 x 4 grid as one block, and as two 2 x 4 blocks side by side: the same cartons.
    const l = layout(carton(10, 10, 10), [
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 2, 4), block(20, 0, 2, 4)]],
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 2, 4), block(20, 0, 2, 4)]],
    ]);
    expect(measureStability(l).columns).toEqual({ layers: 4, from: 1 });
  });

  it('sees no columns where a layer is turned so its seams fall elsewhere', () => {
    // Cartons 10 x 20: a 10-wide and a 20-wide column side by side; the second layer mirrors.
    const l = layout(carton(10, 20, 10), [
      ['H', [block(0, 0, 1, 2), block(10, 0, 1, 1, true)]],
      ['H', [block(0, 0, 1, 1, true), block(20, 0, 1, 2)]],
      ['H', [block(0, 0, 1, 2), block(10, 0, 1, 1, true)]],
      ['H', [block(0, 0, 1, 1, true), block(20, 0, 1, 2)]],
    ]);
    expect(measureStability(l).columns).toEqual({ layers: 1, from: 1 });
  });
});

describe('rating', () => {
  const w = (check: StabilityWarning['check'], level: StabilityWarning['level']) => ({
    check,
    level,
    value: 0,
  });

  it('is good with no warnings, fair with cautions only, poor with any serious one', () => {
    expect(ratingOf([])).toBe('good');
    expect(ratingOf([w('columns', 'caution')])).toBe('fair');
    expect(ratingOf([w('columns', 'caution'), w('stackHeight', 'caution')])).toBe('fair');
    expect(ratingOf([w('support', 'serious')])).toBe('poor');
    expect(ratingOf([w('columns', 'caution'), w('cartonHeight', 'serious')])).toBe('poor');
  });

  it('is assessed from the checks', () => {
    const good = layout(carton(10, 10, 10), [
      ['H', [block(0, 0, 4, 4)]],
      ['H', [block(0, 0, 4, 4)]],
    ]);
    expect(assessStability(good, DEFAULT_INPUTS)).toEqual({ rating: 'good', warnings: [] });
    const fair = layout(
      carton(10, 10, 10),
      Array.from({ length: 4 }, () => ['H', [block(0, 0, 4, 4)]] as [ProductAxis, Block[]]),
    );
    expect(assessStability(fair, DEFAULT_INPUTS).rating).toBe('fair');
    // One 10 x 10 x 30 carton: carton 3.0 (serious) and stack 3.0 (serious).
    const poor = layout(carton(10, 10, 30), [['H', [block(0, 0, 1, 1)]]]);
    expect(assessStability(poor, DEFAULT_INPUTS)).toEqual({
      rating: 'poor',
      warnings: [
        { check: 'stackHeight', level: 'serious', value: 3 },
        { check: 'cartonHeight', level: 'serious', value: 3, layer: 1 },
      ],
    });
  });
});

describe('describeWarning', () => {
  it('says each check in plain words', () => {
    expect(describeWarning({ check: 'stackHeight', level: 'caution', value: 1.8 })).toBe(
      'Stack is tall for its base (1.8 times its shorter side).',
    );
    expect(describeWarning({ check: 'cartonHeight', level: 'serious', value: 2.6, layer: 3 })).toBe(
      'Cartons in layer 3 stand on a narrow face (2.6 times taller than their shorter side).',
    );
    expect(describeWarning({ check: 'support', level: 'caution', value: 0.82, layer: 4 })).toBe(
      'Layer 4 is only 82% supported by the layer below.',
    );
    expect(describeWarning({ check: 'columns', level: 'caution', value: 6, layer: 1 })).toBe(
      'Layers are stacked in straight columns with no interlocking.',
    );
  });

  it('never prints a ratio at or below the threshold it is over', () => {
    expect(describeWarning({ check: 'stackHeight', level: 'caution', value: 1.52 })).toBe(
      'Stack is tall for its base (1.52 times its shorter side).',
    );
    expect(describeWarning({ check: 'stackHeight', level: 'serious', value: 2.04 })).toBe(
      'Stack is tall for its base (2.04 times its shorter side).',
    );
    expect(
      describeWarning({ check: 'cartonHeight', level: 'caution', value: 1.549, layer: 1 }),
    ).toBe(
      'Cartons in layer 1 stand on a narrow face (1.55 times taller than their shorter side).',
    );
  });

  it('rounds a share down, so it never prints the threshold it is under', () => {
    expect(describeWarning({ check: 'support', level: 'caution', value: 0.8999, layer: 2 })).toBe(
      'Layer 2 is only 89% supported by the layer below.',
    );
    expect(describeWarning({ check: 'support', level: 'serious', value: 0.6999, layer: 2 })).toBe(
      'Layer 2 is only 69% supported by the layer below.',
    );
  });
});
