import { SCORE_WEIGHTS } from '../../domain/constants';
import type { Inputs, Layout, ScoreBreakdown } from '../../domain/types';
import { layoutMetrics } from '../packing/metrics';

/** Score differences at or below this are treated as ties. */
const SCORE_TIE = 1e-9;

function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/**
 * Spec 6.1: quantity against the most products of any layout, carton volume against the
 * available volume and against the load's bounding box; each 0..100, weighted and summed.
 */
export function scoreLayout(l: Layout, i: Inputs, maxProducts: number): ScoreBreakdown {
  const m = layoutMetrics(l, i);
  const quantity = percent(l.totalProducts, maxProducts);
  const utilization = percent(m.cartonVolume, m.availableVolume);
  const space = percent(m.cartonVolume, m.loadBoundingVolume);
  const quantityContribution = quantity * SCORE_WEIGHTS.quantity;
  const utilizationContribution = utilization * SCORE_WEIGHTS.utilization;
  const spaceContribution = space * SCORE_WEIGHTS.space;
  return {
    quantity,
    utilization,
    space,
    quantityContribution,
    utilizationContribution,
    spaceContribution,
    total: quantityContribution + utilizationContribution + spaceContribution,
  };
}

interface Scored {
  layout: Layout;
  score: ScoreBreakdown;
}

/** Spec 6.2: products descending, score descending, cartons ascending, then id ascending. */
export function compareRanked(a: Scored, b: Scored): number {
  if (a.layout.totalProducts !== b.layout.totalProducts) {
    return b.layout.totalProducts - a.layout.totalProducts;
  }
  const scoreDiff = b.score.total - a.score.total;
  if (Math.abs(scoreDiff) > SCORE_TIE) return scoreDiff;
  if (a.layout.totalCartons !== b.layout.totalCartons) {
    return a.layout.totalCartons - b.layout.totalCartons;
  }
  return a.layout.id < b.layout.id ? -1 : a.layout.id > b.layout.id ? 1 : 0;
}
