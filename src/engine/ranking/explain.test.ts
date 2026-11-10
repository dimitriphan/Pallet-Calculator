import { describe, expect, it } from 'vitest';
import type { RankedLayout } from '../../domain/types';
import { explainRanking } from './explain';

/** Hand-built fixture: only rank, products, cartons, utilization and total matter to the explanation. */
function ranked(
  rank: number,
  totalProducts: number,
  utilization: number,
  total: number,
  totalCartons = 10,
): RankedLayout {
  return {
    rank,
    layout: {
      id: `L${rank}`,
      carton: {
        counts: { L: 1, W: 1, H: 1 },
        inner: { L: 1, W: 1, H: 1 },
        outer: { L: 1, W: 1, H: 1 },
        boxesPerCarton: 1,
        utilization: 1,
        emptyVolume: 0,
      },
      layers: [],
      totalCartons,
      totalProducts,
    },
    score: {
      quantity: 0,
      utilization,
      space: 0,
      quantityContribution: 0,
      utilizationContribution: 0,
      spaceContribution: 0,
      total,
    },
    explanation: '',
  };
}

describe('explainRanking', () => {
  it('explains more products with similar utilization', () => {
    expect(explainRanking(ranked(1, 100, 80.5, 90), ranked(2, 52, 80, 70), 5)).toBe(
      'Layout #1 ranked above Layout #2 because it fits 48 additional units while maintaining similar utilization.',
    );
  });

  it('explains one more product with higher utilization (U exactly 1)', () => {
    expect(explainRanking(ranked(2, 53, 81, 90), ranked(3, 52, 80, 70), 5)).toBe(
      'Layout #2 ranked above Layout #3 because it fits 1 additional unit with higher utilization.',
    );
  });

  it('explains more products despite lower utilization (U exactly -1)', () => {
    expect(explainRanking(ranked(3, 60, 79, 90), ranked(4, 52, 80, 70), 5)).toBe(
      'Layout #3 ranked above Layout #4 because it fits 8 additional units despite lower utilization.',
    );
  });

  it('explains a higher score at the same quantity, with scores to 2 decimals', () => {
    expect(explainRanking(ranked(1, 52, 80, 85.126), ranked(2, 52, 80, 80.1), 5)).toBe(
      'Layout #1 ranked above Layout #2 because it has a higher overall score (85.13 vs 80.10) at the same quantity.',
    );
  });

  it('explains fewer cartons when products and score are the same', () => {
    expect(explainRanking(ranked(4, 52, 80, 80, 13), ranked(5, 52, 80, 80, 26), 5)).toBe(
      'Layout #4 ranked above Layout #5 because it uses fewer cartons for the same result.',
    );
  });

  it('calls a full tie equivalent instead of claiming fewer cartons', () => {
    expect(explainRanking(ranked(1, 420, 100, 100, 420), ranked(2, 420, 100, 100, 420), 5)).toBe(
      'Layout #1 and Layout #2 are equivalent in quantity, score, and carton count; they differ only in carton size or arrangement.',
    );
  });

  it('describes the last of several layouts', () => {
    expect(explainRanking(ranked(5, 52, 80, 80), null, 5)).toBe(
      'Layout #5 is the lowest-ranked of the 5 layouts shown.',
    );
  });

  it('describes the only layout', () => {
    expect(explainRanking(ranked(1, 52, 80, 80), null, 1)).toBe(
      'Layout #1 is the only distinct layout found.',
    );
  });
});
