import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, SCORE_WEIGHTS } from '../../domain/constants';
import type { Inputs, Layout } from '../../domain/types';
import { generateCartonCandidates } from '../packing/cartons';
import { buildLayouts } from '../packing/stacking';
import { compareRanked, scoreLayout } from './score';

/** Case I: 10-inch cube, no leeway or walls, max carton 20 x 20 x 10, pallet 40 x 40 x 25. */
const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

function allLayouts(i: Inputs): Layout[] {
  const cache = new Map();
  return generateCartonCandidates(i).flatMap((c) => buildLayouts(c, i, cache));
}

describe('scoreLayout', () => {
  it('scores every case I layout at 100 with contributions 60/25/15', () => {
    for (const l of allLayouts(CUBES)) {
      const s = scoreLayout(l, CUBES, 32);
      expect(s.quantity).toBeCloseTo(100, 9);
      expect(s.utilization).toBeCloseTo(100, 9);
      expect(s.space).toBeCloseTo(100, 9);
      expect(s.quantityContribution).toBeCloseTo(60, 9);
      expect(s.utilizationContribution).toBeCloseTo(25, 9);
      expect(s.spaceContribution).toBeCloseTo(15, 9);
      expect(s.total).toBeCloseTo(100, 9);
    }
  });

  it('makes the contributions component x weight and sums them into the total', () => {
    const layouts = allLayouts(DEFAULT_INPUTS);
    const max = Math.max(...layouts.map((l) => l.totalProducts));
    for (const l of layouts) {
      const s = scoreLayout(l, DEFAULT_INPUTS, max);
      expect(s.quantity).toBeCloseTo((l.totalProducts / max) * 100, 9);
      expect(s.quantityContribution).toBeCloseTo(s.quantity * SCORE_WEIGHTS.quantity, 9);
      expect(s.utilizationContribution).toBeCloseTo(s.utilization * SCORE_WEIGHTS.utilization, 9);
      expect(s.spaceContribution).toBeCloseTo(s.space * SCORE_WEIGHTS.space, 9);
      expect(s.total).toBeCloseTo(
        s.quantityContribution + s.utilizationContribution + s.spaceContribution,
        9,
      );
      for (const v of [s.quantity, s.utilization, s.space]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
  });

  it('gives quantity 0 rather than NaN when the maximum is 0', () => {
    const l = allLayouts(CUBES)[0] as Layout;
    expect(scoreLayout(l, CUBES, 0).quantity).toBe(0);
  });
});

describe('compareRanked', () => {
  const layouts = allLayouts(DEFAULT_INPUTS);
  const max = Math.max(...layouts.map((l) => l.totalProducts));
  const more = layouts.find((l) => l.totalProducts === max) as Layout;
  const fewer = layouts.find((l) => l.totalProducts < max) as Layout;
  const scoreOf = (l: Layout) => scoreLayout(l, DEFAULT_INPUTS, max);

  it('puts more products first even when a fabricated rival has higher utilization and space', () => {
    const a = { layout: more, score: scoreOf(more) };
    const rival = {
      layout: fewer,
      score: { ...scoreOf(fewer), utilization: 100, space: 100, total: a.score.total + 10 },
    };
    expect(compareRanked(a, rival)).toBeLessThan(0);
    expect(compareRanked(rival, a)).toBeGreaterThan(0);
    expect([rival, a].sort(compareRanked)[0]).toBe(a);
  });

  it('breaks product ties by score, then fewer cartons, then id', () => {
    const base = { layout: more, score: scoreOf(more) };
    const higher = {
      layout: { ...more, id: 'z' },
      score: { ...base.score, total: base.score.total + 1 },
    };
    expect(compareRanked(higher, base)).toBeLessThan(0);

    const nearlySame = {
      layout: { ...more, id: 'a', totalCartons: more.totalCartons + 1 },
      score: { ...base.score, total: base.score.total + 1e-12 },
    };
    expect(compareRanked(base, nearlySame)).toBeLessThan(0); // score difference ignored, fewer cartons wins

    const sameButId = { layout: { ...more, id: more.id + '~' }, score: base.score };
    expect(compareRanked(base, sameButId)).toBeLessThan(0);
    expect(compareRanked(base, base)).toBe(0);
  });
});
