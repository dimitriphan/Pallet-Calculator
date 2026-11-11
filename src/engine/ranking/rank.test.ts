import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layout, RankedLayout } from '../../domain/types';
import { cartonKey, generateCartonCandidates } from '../packing/cartons';
import { buildLayouts, footprintAxes, layoutSignature } from '../packing/stacking';
import { assessStability } from '../analytics/stability';
import { externalSignature, rankLayouts } from './rank';
import { compareRanked } from './score';

/** Case I: 10-inch cube, no leeway or walls, max carton 20 x 20 x 10, pallet 40 x 40 x 25. */
const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

/** One 7 x 6 x 10 carton only (counts 1x1x1), with several distinct layouts. */
const SINGLE_CARTON: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 7, width: 6, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 10, width: 10, height: 10 },
  pallet: { length: 30, width: 30, height: 25 },
};

/**
 * 1 x 2 x 4 product, no leeway or walls: counts (8,2,1), (4,4,1) and (4,2,2) all make an
 * 8 x 4 x 4 carton of 16 boxes, packed differently inside but identical from outside.
 */
const SAME_OUTSIDE: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 1, width: 2, height: 4 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 8, width: 4, height: 4 },
  pallet: { length: 16, width: 8, height: 13 },
};

function allLayouts(i: Inputs): Layout[] {
  const cache = new Map();
  return generateCartonCandidates(i).flatMap((c) => buildLayouts(c, i, cache));
}

function outsideKey(l: Layout): string {
  const o = [l.carton.outer.L, l.carton.outer.W, l.carton.outer.H].sort((a, b) => b - a);
  return `${o.join('x')}/${l.carton.boxesPerCarton}`;
}

function expectWellFormed(r: RankedLayout[]): void {
  expect(r.map((x) => x.rank)).toEqual(r.map((_, k) => k + 1));
  for (let k = 1; k < r.length; k++) {
    expect(compareRanked(r[k - 1] as RankedLayout, r[k] as RankedLayout)).toBeLessThan(0);
  }
  expect(new Set(r.map((x) => externalSignature(x.layout))).size).toBe(r.length);
  for (const x of r) expect(x.explanation).not.toBe('');
}

describe('externalSignature', () => {
  it('collapses a square-footprint rotated / unrotated pair', () => {
    // buildLayouts no longer emits the turned twin of a square footprint, so build it by hand.
    const ones = allLayouts(CUBES).filter((l) => l.carton.boxesPerCarton === 1);
    const flags = (l: Layout) => l.layers.flatMap((layer) => layer.blocks.map((b) => b.rotated));
    const plain = ones.find((l) => flags(l).every((f) => !f));
    expect(plain).toBeDefined();
    if (!plain) return;
    const turnedLayers = plain.layers.map((layer) => ({
      ...layer,
      blocks: layer.blocks.map((b) => ({ ...b, rotated: true })),
    }));
    const turned: Layout = { ...plain, layers: turnedLayers };
    turned.id = layoutSignature(turned);
    expect(flags(turned).every((f) => f)).toBe(true);
    expect(plain.id).not.toBe(turned.id);
    expect(externalSignature(plain)).toBe(externalSignature(turned));
    expect(rankLayouts([plain, turned], CUBES)).toHaveLength(1);
  });

  it('matches a hand-rotated copy of any square-footprint block', () => {
    // The 4-box carton is 20 x 20 x 10; standing on its 10-inch side its footprint is 20 x 20.
    const square = (x: Layout) =>
      x.layers.every((layer) => {
        const [fa, fb] = footprintAxes(layer.vertical);
        return x.carton.outer[fa] === x.carton.outer[fb];
      });
    const l = allLayouts(CUBES).find((x) => x.carton.boxesPerCarton === 4 && square(x)) as Layout;
    const copy: Layout = {
      ...l,
      id: 'copy',
      layers: l.layers.map((layer) => ({
        ...layer,
        blocks: [...layer.blocks].reverse().map((b) => ({ ...b, x: b.x + 1, rotated: !b.rotated })),
      })),
    };
    expect(l).toBeDefined();
    expect(externalSignature(copy)).toBe(externalSignature(l));
  });

  it('tells apart layouts that differ from outside', () => {
    const sigs = allLayouts(DEFAULT_INPUTS).map(externalSignature);
    const byCarton = new Set(allLayouts(DEFAULT_INPUTS).map((l) => cartonKey(l.carton)));
    expect(new Set(sigs).size).toBeGreaterThanOrEqual(byCarton.size);
  });

  it('identifies cartons packed differently inside but identical outside', () => {
    const layouts = allLayouts(SAME_OUTSIDE);
    const keys = new Set(
      layouts.filter((l) => outsideKey(l) === '8x4x4/16').map((l) => cartonKey(l.carton)),
    );
    expect(keys).toEqual(new Set(['8x2x1', '4x4x1', '4x2x2']));
    const sigs = layouts.filter((l) => outsideKey(l) === '8x4x4/16').map(externalSignature);
    expect(new Set(sigs).size).toBeLessThan(sigs.length);
  });
});

describe('rankLayouts', () => {
  it('never lists two layouts that look the same from outside', () => {
    const r = rankLayouts(allLayouts(SAME_OUTSIDE), SAME_OUTSIDE);
    expectWellFormed(r);
    expect(r.length).toBeGreaterThan(1);
    expect(r.filter((x) => outsideKey(x.layout) === '8x4x4/16').length).toBeLessThanOrEqual(2);
  });

  it('ranks the default layouts with at most 2 per physical carton', () => {
    const r = rankLayouts(allLayouts(DEFAULT_INPUTS), DEFAULT_INPUTS);
    expect(r).toHaveLength(5);
    expectWellFormed(r);
    const counts = new Map<string, number>();
    for (const x of r)
      counts.set(outsideKey(x.layout), (counts.get(outsideKey(x.layout)) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(r[0]?.score.quantity).toBeCloseTo(100, 9);
  });

  it('fills from the per-carton overflow when fewer than the limit remain', () => {
    const layouts = allLayouts(SINGLE_CARTON);
    const distinct = new Set(layouts.map(externalSignature)).size;
    expect(distinct).toBeGreaterThan(2);
    const r = rankLayouts(layouts, SINGLE_CARTON);
    expect(r).toHaveLength(Math.min(5, distinct));
    expectWellFormed(r);
  });

  it('respects the limit and handles an empty list', () => {
    expect(rankLayouts(allLayouts(DEFAULT_INPUTS), DEFAULT_INPUTS, 2)).toHaveLength(2);
    expect(rankLayouts([], DEFAULT_INPUTS)).toEqual([]);
  });

  it('explains each row against the next and the last as the lowest-ranked', () => {
    const r = rankLayouts(allLayouts(DEFAULT_INPUTS), DEFAULT_INPUTS);
    expect(r[4]?.explanation).toBe('Layout #5 is the lowest-ranked of the 5 layouts shown.');
    expect(r[0]?.explanation.startsWith('Layout #1 ranked above Layout #2 because')).toBe(true);
    const one = rankLayouts(allLayouts(DEFAULT_INPUTS), DEFAULT_INPUTS, 1);
    expect(one[0]?.explanation).toBe('Layout #1 is the only distinct layout found.');
  });

  it('rates every layout it ranks, and prefers a better rating at the same products', () => {
    const layouts = allLayouts(DEFAULT_INPUTS);
    const r = rankLayouts(layouts, DEFAULT_INPUTS, 30);
    for (const x of r)
      expect(x.layout.stability).toEqual(assessStability(x.layout, DEFAULT_INPUTS));
    expectWellFormed(r);
    const order = { good: 0, fair: 1, poor: 2 } as const;
    for (let k = 1; k < r.length; k++) {
      const [p, q] = [r[k - 1]!.layout, r[k]!.layout];
      if (p.totalProducts === q.totalProducts) {
        expect(order[p.stability!.rating]).toBeLessThanOrEqual(order[q.stability!.rating]);
      }
    }
  });

  it('keeps a rating it is given', () => {
    const [l] = allLayouts(DEFAULT_INPUTS);
    const given = { ...l!, stability: { rating: 'poor' as const, warnings: [] } };
    expect(rankLayouts([given], DEFAULT_INPUTS)[0]!.layout.stability).toEqual(given.stability);
  });
});
