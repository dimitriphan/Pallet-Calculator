import type { Inputs, Layout, OptimizeResult } from '../domain/types';
import {
  anyCartonFits,
  generateCartonCandidatesWithInfo,
  nearestAchievableCounts,
} from './packing/cartons';
import { availableVolume, usableHeight, volumeOf } from './packing/geometry';
import { buildLayouts, type LayerCache } from './packing/stacking';
import { fitsCount } from './packing/tolerance';
import { rankLayouts } from './ranking/rank';
import { trimToWeight } from './analytics/weight';
import { maxCartonsByWeight, weightBound, weightLimited, withinMax } from './packing/weightLimit';

export const TIME_BUDGET_MS = 4000;

/**
 * Past this, the search stops even before it has a layout to show (only absurd inputs, such
 * as a product of a hundredth of an inch, get here); the result is marked truncated.
 */
export const HARD_LIMIT_MS = 6000;

/** A candidate is skipped when its upper bound cannot reach the product count of this many layouts. */
const KEEP_BEST = 30;

/**
 * Evaluates every carton candidate (best possible total first, within the time budget)
 * and returns the ranked top layouts. Deterministic unless the budget truncates the run.
 */
export function optimize(
  i: Inputs,
  opts: { now?: () => number; budgetMs?: number } = {},
): OptimizeResult {
  const now = opts.now ?? (() => performance.now());
  const budgetMs = opts.budgetMs ?? TIME_BUDGET_MS;
  const start = now();

  const { candidates, truncated: capped } = generateCartonCandidatesWithInfo(i);
  let timedOut = false;
  const empty = (emptyReason: OptimizeResult['emptyReason']): OptimizeResult => ({
    layouts: [],
    candidatesEvaluated: 0,
    emptyReason,
    truncated: capped || timedOut,
  });
  if (candidates.length === 0) {
    const pastHardLimit = () => (timedOut ||= now() - start >= HARD_LIMIT_MS);
    return noCandidates(i, empty, pastHardLimit);
  }
  if (!(usableHeight(i) > 0)) return empty('CARTON_EXCEEDS_PALLET');

  const available = availableVolume(i);
  const ordered = candidates
    .map((c) => ({
      c,
      bound: Math.min(
        c.boxesPerCarton * fitsCount(available, volumeOf(c.outer)),
        weightBound(c, i),
      ),
    }))
    .sort((p, q) => q.bound - p.bound);

  const cache: LayerCache = new Map();
  const layouts: Layout[] = [];
  // With a weight limit, layouts that trim to the same layers are kept once, by id. Without
  // one, nothing is trimmed and buildLayouts already gives distinct layouts.
  const limited = weightLimited(i);
  const indexById = new Map<string, number>();
  // Layouts built and cartons skipped that the weight limit then ruled out entirely.
  let built = 0;
  let tooHeavy = 0;
  const best: number[] = []; // product counts of the best KEEP_BEST layouts, descending
  let evaluated = 0;
  // Stop at the budget once there is something to show, or at the hard limit regardless.
  // The first carton's first layer search always runs.
  const overBudget = () => {
    if (!timedOut) {
      const elapsed = now() - start;
      if (elapsed >= budgetMs && (layouts.length > 0 || elapsed >= HARD_LIMIT_MS)) timedOut = true;
    }
    return timedOut;
  };
  for (const { c, bound } of ordered) {
    // Bounds are descending, so once one falls short every later one does too.
    if (best.length >= KEEP_BEST && bound < (best[KEEP_BEST - 1] as number)) break;
    if (evaluated > 0 && overBudget()) break;
    evaluated++;
    // The pallet and one full carton already over the maximum: no layer of it can fit.
    if (maxCartonsByWeight(c, i) === 0) {
      tooHeavy++;
      continue;
    }
    // The same check runs between this carton's layer searches.
    for (const full of buildLayouts(c, i, cache, overBudget)) {
      built++;
      // Trimmed to the weight limit before anything counts it: the keep-best list above
      // (and so every later skip) and the ranking only ever see what can really be loaded.
      const l = trimToWeight(full, i);
      if (l === null) continue;
      if (limited) {
        if (!isNewOrFewerRemoved(l, layouts, indexById)) continue;
        indexById.set(l.id, layouts.length);
      }
      layouts.push(l);
      insertDescending(best, l.totalProducts);
    }
    if (timedOut) break;
  }

  if (layouts.length === 0) {
    const reason =
      built + tooHeavy === 0 ? 'CARTON_EXCEEDS_PALLET' : overWeightReason(i, capped || timedOut);
    return { ...empty(reason), candidatesEvaluated: evaluated };
  }
  return {
    layouts: rankLayouts(layouts, i),
    candidatesEvaluated: evaluated,
    emptyReason: null,
    truncated: capped || timedOut,
  };
}

/**
 * The empty result when no carton was generated. With a desired boxes per carton N, cartons
 * of other counts may still fit: then report the nearest achievable counts on each side.
 */
function noCandidates(
  i: Inputs,
  empty: (reason: OptimizeResult['emptyReason']) => OptimizeResult,
  shouldStop: () => boolean,
): OptimizeResult {
  const n = i.boxesPerCarton;
  if (n === null || !anyCartonFits(i)) return empty('NO_CARTON_FITS');
  const nearestCounts = nearestAchievableCounts(i, n, shouldStop);
  // Stopped: say no carton of N fits, but name no counts that might not be the nearest.
  if (nearestCounts === null) return empty('NO_CARTON_WITH_COUNT');
  return { ...empty('NO_CARTON_WITH_COUNT'), nearestCounts };
}

/**
 * Why nothing was left once the weight limit removed every layout. OVER_WEIGHT only when that
 * is certain: the search covered every carton, or even one box in one carton on the pallet is
 * over the maximum. A capped or stopped search may have missed a lighter carton.
 */
function overWeightReason(i: Inputs, searchLimited: boolean): OptimizeResult['emptyReason'] {
  const { productBox, maxPallet, emptyCarton, pallet } = i.weights;
  const lightest = pallet + emptyCarton + (productBox ?? 0);
  const proven = maxPallet !== null && !withinMax(lightest, maxPallet);
  return !searchLimited || proven ? 'OVER_WEIGHT' : 'WEIGHT_SEARCH_LIMITED';
}

/**
 * Whether a layout is new by id. A layout with the same id already kept (the same carton and
 * layers, reached by trimming) is replaced in place when this one had fewer layers removed,
 * so it says the least about trimming; either way only one is kept.
 */
function isNewOrFewerRemoved(
  l: Layout,
  layouts: Layout[],
  indexById: Map<string, number>,
): boolean {
  const at = indexById.get(l.id);
  if (at === undefined) return true;
  const kept = layouts[at] as Layout;
  if ((l.weightTrim?.layersRemoved ?? 0) < (kept.weightTrim?.layersRemoved ?? 0)) {
    layouts[at] = l;
  }
  return false;
}

/** Inserts `v` into the descending list, keeping at most KEEP_BEST entries. */
function insertDescending(list: number[], v: number): void {
  if (list.length >= KEEP_BEST && v <= (list[list.length - 1] as number)) return;
  let k = list.length;
  while (k > 0 && (list[k - 1] as number) < v) k--;
  list.splice(k, 0, v);
  if (list.length > KEEP_BEST) list.pop();
}
