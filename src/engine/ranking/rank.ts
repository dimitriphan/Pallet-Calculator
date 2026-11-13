import type {
  Inputs,
  Layout,
  MinStability,
  RankedLayout,
  ScoreBreakdown,
  StabilityRating,
} from '../../domain/types';
import { assessStability } from '../analytics/stability';
import { footprintAxes } from '../packing/stacking';
import { explainRanking } from './explain';
import { comparatorFor, prefersPinwheel, RATING_ORDER, scoreLayout } from './score';

/** Layouts kept per physical carton before the overflow is used. */
const PER_CARTON = 2;

function size6(v: number): string {
  return v.toFixed(6);
}

/** The carton as seen from outside: outer sizes, largest first, and boxes per carton. */
function outsideCartonKey(l: Layout): string {
  const { L, W, H } = l.carton.outer;
  const sorted = [L, W, H].sort((p, q) => q - p).map(size6);
  return `${sorted.join('x')}/${l.carton.boxesPerCarton}`;
}

/**
 * How the layout looks from outside, as laid (or, with `transposed`, turned 90° so x and y
 * swap), ignoring how products sit inside the cartons and where blocks sit within a layer.
 * Each block is the physical rectangle it covers (width along x, depth along y) with its
 * columns and rows, so a square footprint gives the same block whether or not it is flagged
 * as rotated.
 */
export function orientedSignature(l: Layout, transposed = false): string {
  const layers = l.layers.map((layer) => {
    const [fa, fb] = footprintAxes(layer.vertical);
    const a = l.carton.outer[fa];
    const b = l.carton.outer[fb];
    const blocks = layer.blocks
      .map((blk) => {
        const dx = size6(blk.cols * (blk.rotated ? b : a));
        const dy = size6(blk.rows * (blk.rotated ? a : b));
        return transposed
          ? `${dy}x${dx}:${blk.rows}x${blk.cols}`
          : `${dx}x${dy}:${blk.cols}x${blk.rows}`;
      })
      .sort()
      .join(',');
    return `${size6(layer.height)}:${layer.cartonCount}:${blocks}`;
  });
  return `${outsideCartonKey(l)}|${layers.join('/')}`;
}

/**
 * How the layout looks from outside, the same for a layout and its twin with every layer
 * turned 90° (same carton, same heights, x and y swapped): the comparison lists such a pair
 * once, keeping the one that sorts first. Both orientations fit the usable footprint equally
 * whenever both were generated, so nothing better is lost.
 */
export function externalSignature(l: Layout): string {
  const asLaid = orientedSignature(l);
  const turned = orientedSignature(l, true);
  return asLaid < turned ? asLaid : turned;
}

interface Scored {
  layout: Layout;
  score: ScoreBreakdown;
}

/** Layouts by product count, and the counts from the most down. */
function byProducts(layouts: Layout[]): { groups: Map<number, Layout[]>; order: number[] } {
  const groups = new Map<number, Layout[]>();
  for (const l of layouts) {
    const group = groups.get(l.totalProducts);
    if (group) group.push(l);
    else groups.set(l.totalProducts, [l]);
  }
  return { groups, order: [...groups.keys()].sort((p, q) => q - p) };
}

/**
 * Picks up to `limit` layouts from groups given best first, each group already in ranking
 * order: drops layouts that look the same from outside (a 90° turned twin included), keeps at
 * most two per physical carton (topping up from the extras if fewer than `limit` remain), then
 * ranks and explains the selection. A group is only asked for while the list is not full.
 * The inputs give the ranking order (pinwheel layouts first under Prefer pinwheel).
 */
function select(groups: Iterable<Scored[]>, limit: number, i: Inputs): RankedLayout[] {
  const compare = comparatorFor(i);
  const taken = new Set<string>();
  const perCarton = new Map<string, number>();
  const selected: Scored[] = [];
  const overflow: Scored[] = [];
  const next = groups[Symbol.iterator]();
  while (selected.length < limit) {
    const group = next.next();
    if (group.done) break;
    for (const s of group.value) {
      if (selected.length >= limit) break;
      const sig = externalSignature(s.layout);
      if (taken.has(sig)) continue;
      const key = outsideCartonKey(s.layout);
      const n = perCarton.get(key) ?? 0;
      if (n >= PER_CARTON) {
        overflow.push(s);
        continue;
      }
      perCarton.set(key, n + 1);
      taken.add(sig);
      selected.push(s);
    }
  }
  for (const s of overflow) {
    if (selected.length >= limit) break;
    const sig = externalSignature(s.layout);
    if (taken.has(sig)) continue;
    taken.add(sig);
    selected.push(s);
  }
  // Overflow entries may outrank later picks; keep the list in ranking order.
  selected.sort(compare);

  const ranked: RankedLayout[] = selected.map((s, k) => ({ ...s, rank: k + 1, explanation: '' }));
  ranked.forEach((r, k) => {
    r.explanation = explainRanking(r, ranked[k + 1] ?? null, ranked.length, prefersPinwheel(i));
  });
  return ranked;
}

/**
 * Spec 6.3 and 7.2: prepares and rates the layouts, scores and orders them, drops layouts that
 * look the same from outside (a 90° turned twin included), keeps at most two per physical carton (topping up from the
 * extras if fewer than `limit` remain), then ranks and explains the selection.
 *
 * `prepare` runs on a layout before it is rated (the optimizer turns layers to interlock
 * there); a layout it returns without a rating is rated here. Layouts are taken in groups of
 * equal product count, most first, and only the groups the selection reaches are prepared,
 * rated and scored: the order puts more products first, so a group below the last one reached
 * could never be picked. The result is the same as preparing every layout first.
 */
export function rankLayouts(
  layouts: Layout[],
  i: Inputs,
  limit = 5,
  prepare: (l: Layout) => Layout = (l) => l,
): RankedLayout[] {
  const maxProducts = layouts.reduce((m, l) => Math.max(m, l.totalProducts), 0);
  const { groups, order } = byProducts(layouts);
  const rated = (l: Layout): Layout => {
    const p = prepare(l);
    return p.stability ? p : { ...p, stability: assessStability(p, i) };
  };
  function* scoredGroups(): Generator<Scored[]> {
    for (const products of order) {
      yield (groups.get(products) as Layout[])
        .map(rated)
        .map((layout) => ({ layout, score: scoreLayout(layout, i, maxProducts) }))
        .sort(comparatorFor(i));
    }
  }
  return select(scoredGroups(), limit, i);
}

/** A minimum stability that leaves layouts out: every setting but Auto. */
export type StabilityMinimum = Exclude<MinStability, 'auto'>;

/** Whether a rating is at or above the minimum: Fair or better, or Good only. */
export function meetsMinimum(rating: StabilityRating, minimum: StabilityMinimum): boolean {
  return RATING_ORDER[rating] <= RATING_ORDER[minimum];
}

export interface MinimumRanking {
  layouts: RankedLayout[];
  /** The walk was stopped before every layout it needed had been rated. */
  truncated: boolean;
  /** No layout rated met the minimum; `layouts` are those with the best rating found. */
  belowMinimum: boolean;
  /** The most products of any layout, when the first layout listed holds fewer. */
  autoBestProducts?: number;
}

type Rated = Layout & { stability: NonNullable<Layout['stability']> };

/**
 * Round 5 spec 4.2 and 4.3: ranks only the layouts whose rating meets `minimum`. Groups of
 * equal product count are prepared and rated from the most products down until the list is
 * full, the layouts run out, or `shouldStop` says so (asked before each layout after the first
 * group, which is always rated in full; the result is then `truncated`).
 *
 * The layouts that meet the minimum go through the same selection as rankLayouts, scored
 * against the best of them, so the list is the one rankLayouts gives for those layouts alone:
 * the order, the per-carton rule and the scores of a search that never found the others.
 *
 * When none meets it, the layouts with the best rating found are ranked instead and the
 * result is marked `belowMinimum`.
 */
export function rankWithMinimum(
  layouts: Layout[],
  i: Inputs,
  minimum: StabilityMinimum,
  opts: { limit?: number; prepare?: (l: Layout) => Layout; shouldStop?: () => boolean } = {},
): MinimumRanking {
  const { limit = 5, prepare = (l: Layout) => l, shouldStop = () => false } = opts;
  const { groups, order } = byProducts(layouts);
  const rate = (l: Layout): Rated => {
    const p = prepare(l);
    return { ...p, stability: p.stability ?? assessStability(p, i) };
  };

  const seen: Rated[] = [];
  let truncated = false;
  let found = false;
  function* qualifyingGroups(): Generator<Scored[]> {
    let maxProducts = 0;
    for (const [k, products] of order.entries()) {
      const qualifying: Rated[] = [];
      for (const l of groups.get(products) as Layout[]) {
        if (k > 0 && shouldStop()) {
          truncated = true;
          break;
        }
        const r = rate(l);
        seen.push(r);
        if (meetsMinimum(r.stability.rating, minimum)) qualifying.push(r);
      }
      if (qualifying.length > 0) {
        // Groups come most products first, so the first that qualifies holds the most.
        if (!found) maxProducts = products;
        found = true;
        yield qualifying
          .map((layout) => ({ layout, score: scoreLayout(layout, i, maxProducts) }))
          .sort(comparatorFor(i));
      }
      if (truncated) return;
    }
  }
  let ranked = select(qualifyingGroups(), limit, i);

  const belowMinimum = seen.length > 0 && !found;
  if (belowMinimum) {
    const best = Math.min(...seen.map((l) => RATING_ORDER[l.stability.rating]));
    ranked = rankLayouts(
      seen.filter((l) => RATING_ORDER[l.stability.rating] === best),
      i,
      limit,
    );
  }
  const top = order[0];
  const shown = ranked[0]?.layout.totalProducts;
  return {
    layouts: ranked,
    truncated,
    belowMinimum,
    ...(top !== undefined && shown !== undefined && shown < top ? { autoBestProducts: top } : {}),
  };
}
