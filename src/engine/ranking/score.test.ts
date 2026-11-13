import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, SCORE_WEIGHTS } from '../../domain/constants';
import type { Inputs, Layout, ScoreBreakdown, StabilityRating } from '../../domain/types';
import { generateCartonCandidates } from '../packing/cartons';
import { buildLayouts } from '../packing/stacking';
import {
  comparatorFor,
  comparePinwheelFirst,
  compareRanked,
  isPinwheelLayout,
  scoreLayout,
} from './score';

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

  describe('stability rating', () => {
    const rated = (l: Layout, rating: StabilityRating, total: number) => ({
      layout: { ...l, stability: { rating, warnings: [] } },
      score: { ...scoreOf(l), total },
    });

    it('puts a better rating first at the same products, even with a lower score', () => {
      const good = rated(more, 'good', 50);
      const fair = rated(more, 'fair', 90);
      const poor = rated(more, 'poor', 95);
      expect(compareRanked(good, fair)).toBeLessThan(0);
      expect(compareRanked(fair, poor)).toBeLessThan(0);
      expect(compareRanked(poor, good)).toBeGreaterThan(0);
      expect([poor, fair, good].sort(compareRanked)).toEqual([good, fair, poor]);
    });

    it('never puts a better rating above more products', () => {
      const poorMore = rated(more, 'poor', 10);
      const goodFewer = rated(fewer, 'good', 99);
      expect(compareRanked(poorMore, goodFewer)).toBeLessThan(0);
      expect([goodFewer, poorMore].sort(compareRanked)[0]).toBe(poorMore);
    });

    it('keeps the score order between equal ratings', () => {
      const high = rated(more, 'fair', 80);
      const low = rated(more, 'fair', 70);
      expect(compareRanked(high, low)).toBeLessThan(0);
      expect(compareRanked(low, high)).toBeGreaterThan(0);
    });
  });
});

describe('comparePinwheelFirst (Prefer pinwheel)', () => {
  const score = { total: 50 } as ScoreBreakdown;
  const layout = (id: string, totalProducts: number, pinwheel: boolean, rating: StabilityRating) =>
    ({
      layout: {
        id,
        totalProducts,
        totalCartons: 10,
        layers: [{ kind: pinwheel ? 'pinwheel' : undefined }],
        stability: { rating, warnings: [] },
      } as unknown as Layout,
      score,
    }) as const;

  it('puts boxes first, then pinwheel layouts, then the rating', () => {
    const more = layout('a', 12, false, 'poor');
    const pinFair = layout('b', 10, true, 'fair');
    const pinGood = layout('c', 10, true, 'good');
    const straightGood = layout('d', 10, false, 'good');
    const sorted = [straightGood, pinFair, more, pinGood].sort(comparePinwheelFirst);
    expect(sorted.map((s) => s.layout.id)).toEqual(['a', 'c', 'b', 'd']);
    // Without the setting the rating decides among equal box counts.
    expect([straightGood, pinFair].sort(compareRanked)[0]).toBe(straightGood);
  });

  it('is chosen by the inputs, and inputs without the setting rank as before', () => {
    expect(comparatorFor({ ...DEFAULT_INPUTS, layerPattern: 'preferPinwheel' })).toBe(
      comparePinwheelFirst,
    );
    for (const layerPattern of ['auto', 'pinwheelOnly'] as const)
      expect(comparatorFor({ ...DEFAULT_INPUTS, layerPattern })).toBe(compareRanked);
    const { layerPattern: _unused, ...old } = DEFAULT_INPUTS;
    void _unused;
    expect(comparatorFor(old as Inputs)).toBe(compareRanked);
    expect(isPinwheelLayout(pinLayout)).toBe(true);
  });
  const pinLayout = { layers: [{}, { kind: 'pinwheel' }] } as unknown as Layout;
});
