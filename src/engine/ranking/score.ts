import { SCORE_WEIGHTS } from '../../domain/constants';
import type { Inputs, Layout, ScoreBreakdown, StabilityRating } from '../../domain/types';
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

/** Ratings from best to worst. */
export const RATING_ORDER: Record<StabilityRating, number> = { good: 0, fair: 1, poor: 2 };

/**
 * Where a layout's stability rating sorts: good, fair, poor. A layout without a rating (only
 * outside the optimizer: rankLayouts rates every layout) sorts as good.
 */
export function ratingOrder(l: Layout): number {
  return l.stability ? RATING_ORDER[l.stability.rating] : 0;
}

/** Whether the layout counts as a pinwheel layout: any of its layers is a pinwheel. */
export function isPinwheelLayout(l: Layout): boolean {
  return l.layers.some((layer) => layer.kind === 'pinwheel');
}

/** Whether the inputs ask for pinwheel layouts first among equal box counts. */
export function prefersPinwheel(i: Inputs): boolean {
  // Inputs from before the setting existed have none: Auto.
  return (i as Partial<Inputs>).layerPattern === 'preferPinwheel';
}

/**
 * Round 5 spec 5, Prefer pinwheel: products descending, then pinwheel layouts before
 * straight-cut ones, then as compareRanked (rating, score, cartons, id).
 */
export function comparePinwheelFirst(a: Scored, b: Scored): number {
  if (a.layout.totalProducts !== b.layout.totalProducts) {
    return b.layout.totalProducts - a.layout.totalProducts;
  }
  const pinwheelDiff = Number(isPinwheelLayout(b.layout)) - Number(isPinwheelLayout(a.layout));
  return pinwheelDiff !== 0 ? pinwheelDiff : compareRanked(a, b);
}

/** The ranking order the inputs ask for. */
export function comparatorFor(i: Inputs): (a: Scored, b: Scored) => number {
  return prefersPinwheel(i) ? comparePinwheelFirst : compareRanked;
}

/**
 * Spec 6.2 and 7.2: products descending, stability rating (good, fair, poor), score
 * descending, cartons ascending, then id ascending.
 */
export function compareRanked(a: Scored, b: Scored): number {
  if (a.layout.totalProducts !== b.layout.totalProducts) {
    return b.layout.totalProducts - a.layout.totalProducts;
  }
  const ratingDiff = ratingOrder(a.layout) - ratingOrder(b.layout);
  if (ratingDiff !== 0) return ratingDiff;
  const scoreDiff = b.score.total - a.score.total;
  if (Math.abs(scoreDiff) > SCORE_TIE) return scoreDiff;
  if (a.layout.totalCartons !== b.layout.totalCartons) {
    return a.layout.totalCartons - b.layout.totalCartons;
  }
  return a.layout.id < b.layout.id ? -1 : a.layout.id > b.layout.id ? 1 : 0;
}
