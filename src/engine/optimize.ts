import type { Inputs, Layout, OptimizeResult } from '../domain/types';
import { achievableCounts, generateCartonCandidatesWithInfo } from './packing/cartons';
import { availableVolume, usableHeight, volumeOf } from './packing/geometry';
import { buildLayouts, type LayerCache } from './packing/stacking';
import { fitsCount } from './packing/tolerance';
import { rankLayouts } from './ranking/rank';

export const TIME_BUDGET_MS = 4000;

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
  const empty = (emptyReason: OptimizeResult['emptyReason']): OptimizeResult => ({
    layouts: [],
    candidatesEvaluated: 0,
    emptyReason,
    truncated: capped,
  });
  if (candidates.length === 0) return noCandidates(i, empty);
  if (!(usableHeight(i) > 0)) return empty('CARTON_EXCEEDS_PALLET');

  const available = availableVolume(i);
  const ordered = candidates
    .map((c) => ({ c, bound: c.boxesPerCarton * fitsCount(available, volumeOf(c.outer)) }))
    .sort((p, q) => q.bound - p.bound);

  const cache: LayerCache = new Map();
  const layouts: Layout[] = [];
  const best: number[] = []; // product counts of the best KEEP_BEST layouts, descending
  let evaluated = 0;
  let timedOut = false;
  // Stop at the budget, but only once there is something to show.
  const overBudget = () => {
    if (!timedOut && layouts.length > 0 && now() - start >= budgetMs) timedOut = true;
    return timedOut;
  };
  for (const { c, bound } of ordered) {
    // Bounds are descending, so once one falls short every later one does too.
    if (best.length >= KEEP_BEST && bound < (best[KEEP_BEST - 1] as number)) break;
    if (overBudget()) break;
    evaluated++;
    // The same check runs between this carton's layer searches.
    for (const l of buildLayouts(c, i, cache, overBudget)) {
      layouts.push(l);
      insertDescending(best, l.totalProducts);
    }
    if (timedOut) break;
  }

  if (layouts.length === 0) {
    return { ...empty('CARTON_EXCEEDS_PALLET'), candidatesEvaluated: evaluated };
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
): OptimizeResult {
  const n = i.boxesPerCarton;
  if (n === null) return empty('NO_CARTON_FITS');
  const counts = achievableCounts(i);
  if (counts.length === 0) return empty('NO_CARTON_FITS');
  const below = counts.filter((c) => c < n);
  const above = counts.filter((c) => c > n);
  return {
    ...empty('NO_CARTON_WITH_COUNT'),
    nearestCounts: { below: below.at(-1) ?? null, above: above[0] ?? null },
  };
}

/** Inserts `v` into the descending list, keeping at most KEEP_BEST entries. */
function insertDescending(list: number[], v: number): void {
  if (list.length >= KEEP_BEST && v <= (list[list.length - 1] as number)) return;
  let k = list.length;
  while (k > 0 && (list[k - 1] as number) < v) k--;
  list.splice(k, 0, v);
  if (list.length > KEEP_BEST) list.pop();
}
