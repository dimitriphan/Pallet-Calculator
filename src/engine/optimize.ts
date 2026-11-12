import type {
  Inputs,
  LayerPatternPref,
  Layout,
  MinStability,
  OptimizeResult,
} from '../domain/types';
import {
  anyCartonFits,
  generateCartonCandidatesWithInfo,
  nearestAchievableCounts,
} from './packing/cartons';
import { availableVolume, usableHeight, volumeOf } from './packing/geometry';
import {
  PINWHEEL_EXTRA_WORK_PER_OPTIMIZE,
  PINWHEEL_WORK_PER_OPTIMIZE,
  type PinwheelAllowance,
} from './packing/pinwheel';
import {
  buildLayouts,
  cartonFitsPallet,
  type LayerCache,
  type PinwheelPreference,
} from './packing/stacking';
import { fitsCount } from './packing/tolerance';
import { rankLayouts, rankWithMinimum } from './ranking/rank';
import { trimToWeight } from './analytics/weight';
import { assessStability } from './analytics/stability';
import { interlockLayers } from './packing/interlock';
import { maxCartonsByWeight, weightBound, weightLimited, withinMax } from './packing/weightLimit';

export const TIME_BUDGET_MS = 4000;

/**
 * Past this, the search stops even before it has a layout to show (only absurd inputs, such
 * as a product of a hundredth of an inch, get here); the result is marked truncated.
 */
export const HARD_LIMIT_MS = 6000;

/**
 * With a minimum stability, the ranking rates layouts until enough meet it. That walk stops at
 * the time budget, but always gets this long, even after a search that used the whole budget.
 */
export const MIN_RATING_WALK_MS = 500;

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
  // Shared by every pinwheel search of this call (deterministic: counted, not timed).
  const pinwheelWork: PinwheelAllowance = { remaining: PINWHEEL_WORK_PER_OPTIMIZE };
  // Inputs from before the setting existed have no layer pattern: Auto.
  const pref: LayerPatternPref = (i as Partial<Inputs>).layerPattern ?? 'auto';
  const only = pref === 'pinwheelOnly';
  // What the pinwheels Auto does not look for may cost (counted too, so just as repeatable).
  const extraWork: PinwheelAllowance = { remaining: PINWHEEL_EXTRA_WORK_PER_OPTIMIZE };
  const pattern: PinwheelPreference | undefined =
    pref === 'auto' ? undefined : { pref, allowance: extraWork };
  const layouts: Layout[] = [];
  // Pinwheel only: the layouts listed, built beside the ones Auto builds. Auto's own are still
  // built, exactly as under Auto, to say what Auto would give and to show when no pinwheel
  // exists.
  const pinwheelLayouts: Layout[] = [];
  const pinwheelIndexById = new Map<string, number>();
  const bestPinwheel: number[] = [];
  // With a weight limit, layouts that trim to the same layers are kept once, by id. Without
  // one, nothing is trimmed and buildLayouts already gives distinct layouts.
  const limited = weightLimited(i);
  const indexById = new Map<string, number>();
  // Layouts built, and cartons skipped as too heavy that would otherwise fit the pallet: the
  // weight limit ruled them out. A carton that could never fit counts toward neither.
  let built = 0;
  let tooHeavy = 0;
  const best: number[] = []; // product counts of the best KEEP_BEST layouts, descending
  let evaluated = 0;
  let autoEvaluated = 0; // cartons Auto would have evaluated (all of them unless Pinwheel only)
  const keep = (full: Layout, into: Layout[], index: Map<string, number>, counts: number[]) => {
    // Trimmed to the weight limit before anything counts it: the keep-best list
    // (and so every later skip) and the ranking only ever see what can really be loaded.
    const l = trimToWeight(full, i);
    if (l === null) return;
    if (limited) {
      if (!isNewOrFewerRemoved(l, into, index)) return;
      index.set(l.id, into.length);
    }
    into.push(l);
    insertDescending(counts, l.totalProducts);
  };
  const cannotReach = (counts: number[], bound: number) =>
    counts.length >= KEEP_BEST && bound < (counts[KEEP_BEST - 1] as number);
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
    const autoDone = cannotReach(best, bound);
    // Pinwheel only goes on past where Auto stops, until no carton can reach the pinwheel
    // layouts already kept: a carton Auto has no use for may still hold the best pinwheel.
    if (autoDone && (!only || cannotReach(bestPinwheel, bound))) break;
    if (evaluated > 0 && overBudget()) break;
    evaluated++;
    if (!autoDone) autoEvaluated++;
    // The pallet and one full carton already over the maximum: no layer of it can fit.
    if (maxCartonsByWeight(c, i) === 0) {
      if (!autoDone && cartonFitsPallet(c, i)) tooHeavy++;
      continue;
    }
    // The same check runs between this carton's layer searches.
    if (!autoDone) {
      for (const full of buildLayouts(
        c,
        i,
        cache,
        overBudget,
        pinwheelWork,
        only ? undefined : pattern,
      )) {
        built++;
        keep(full, layouts, indexById, best);
      }
    }
    if (only && pattern) {
      for (const full of buildLayouts(c, i, cache, overBudget, undefined, pattern)) {
        keep(full, pinwheelLayouts, pinwheelIndexById, bestPinwheel);
      }
    }
    if (timedOut) break;
  }

  if (layouts.length === 0) {
    const reason =
      built + tooHeavy === 0 ? 'CARTON_EXCEEDS_PALLET' : overWeightReason(i, capped || timedOut);
    return { ...empty(reason), candidatesEvaluated: evaluated };
  }
  // Then, for every layout the ranking reaches: alternate identical layers turned where that
  // is free (same boxes; nothing above changes, since product counts and weights stay as they
  // are), and the result rated. Better-rated layouts win ties on products.
  const prepare = (l: Layout): Layout => {
    const interlocked = interlockLayers(l, i);
    return { ...interlocked, stability: assessStability(interlocked, i) };
  };
  // Pinwheel only lists its own layouts; with none, the layouts Auto gives, marked as such.
  const patternFallback = only && pinwheelLayouts.length === 0;
  const listed = only && !patternFallback ? pinwheelLayouts : layouts;
  // The allowance of the further pinwheel searches ran out: a pinwheel may have been missed.
  const searchLimited = capped || timedOut || (pattern !== undefined && extraWork.capped === true);
  // What Auto would put first, to compare with the first layout listed.
  let autoBest = best[0];
  let truncated = searchLimited;
  let ranked: OptimizeResult['layouts'];
  let belowMinimum = false;
  // Inputs from before the setting existed have no minimum: Auto.
  const minimum: MinStability = (i as Partial<Inputs>).minStability ?? 'auto';
  if (minimum === 'auto') {
    ranked = rankLayouts(listed, i, undefined, prepare);
  } else {
    // Layouts below the minimum are left out, so the ranking rates further down the list.
    // It works on the layouts the layer pattern setting left: the minimum applies after it.
    const walkStart = now();
    const shouldStop = () => {
      const t = now();
      return t - start >= budgetMs && t - walkStart >= MIN_RATING_WALK_MS;
    };
    const ranking = rankWithMinimum(listed, i, minimum, { prepare, shouldStop });
    ranked = ranking.layouts;
    truncated ||= ranking.truncated;
    belowMinimum = ranking.belowMinimum;
    if (ranking.autoBestProducts !== undefined) {
      autoBest = Math.max(autoBest ?? 0, ranking.autoBestProducts);
    }
  }
  const shown = ranked[0]?.layout.totalProducts;
  const settingsApplied = minimum !== 'auto' || only;
  const costs =
    settingsApplied && autoBest !== undefined && shown !== undefined && shown < autoBest;
  return {
    layouts: ranked,
    // The fallback is the Auto result: it counts the cartons Auto evaluates.
    candidatesEvaluated: patternFallback ? autoEvaluated : evaluated,
    emptyReason: null,
    truncated,
    ...(belowMinimum ? { belowMinimum: true } : {}),
    ...(costs ? { autoBestProducts: autoBest } : {}),
    ...(patternFallback ? { patternFallback: true } : {}),
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
