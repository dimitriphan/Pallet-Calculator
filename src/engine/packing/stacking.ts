import type {
  Block,
  CartonCandidate,
  Inputs,
  Layer,
  LayerPattern,
  LayerPatternKind,
  LayerPatternPref,
  Layout,
  ProductAxis,
} from '../../domain/types';
import { cartonKey } from './cartons';
import { usableFootprint, usableHeight } from './geometry';
import { gridLayer, searchLayer, type LayerSearchResult } from './layerSearch';
import {
  layerCountBound,
  pinwheelLayer,
  type PinwheelAllowance,
  type PinwheelOptions,
  type PinwheelResult,
} from './pinwheel';
import { allowedVerticalAxes } from './rotation';
import { fitsCount, fitsWithin } from './tolerance';
import { maxCartonsByWeight } from './weightLimit';

/**
 * Best layer patterns keyed by footprint `${a}|${b}`. The layer search depends only on the
 * footprint sizes and the usable area, so one cache serves every candidate of one set of inputs.
 * When a pinwheel is best, the straight-cut layer is kept beside it under `${a}|${b}|straight`.
 * Under the layer pattern settings Prefer pinwheel and Pinwheel only, the pinwheel wanted for
 * the footprint (or null) is kept under `${a}|${b}|pinwheel`, and under Pinwheel only the one
 * of at most n cartons under `${a}|${b}|pinwheel|n`; one cache serves one setting.
 */
export type LayerCache = Map<string, LayerPattern | null>;

function straightKey(key: string): string {
  return `${key}|straight`;
}

function pinwheelKey(key: string): string {
  return `${key}|pinwheel`;
}

/**
 * The time the further pinwheel searches of one optimize() call may take between them (those
 * Auto does not run: see PINWHEEL_EXTRA_TIME_SHARE in optimize).
 */
export interface PinwheelSearchTime {
  now: () => number;
  /** Most milliseconds the searches may take in all. */
  limitMs: number;
  /** Milliseconds they have taken so far. */
  spentMs: number;
  /**
   * Set once a search was stopped before its end, or not run because no time was left, so a
   * pinwheel may have been missed. Never set to false.
   */
  cut?: boolean;
}

/**
 * A layer pattern setting other than Auto, with the time its further pinwheel searches may
 * take between them (unlimited when absent).
 */
export interface PinwheelPreference {
  pref: Exclude<LayerPatternPref, 'auto'>;
  time?: PinwheelSearchTime;
  /**
   * Pinwheel only: the pinwheel work its own best-layer searches may spend between them, for
   * the cartons whose best layer the caller has not already searched (see pinwheelOnlyLayouts).
   */
  ownWork?: PinwheelAllowance;
  /**
   * Prefer pinwheel: buildLayouts adds here every layout it returns that Auto would not have
   * built, so the caller can tell what Auto alone would give.
   */
  beyondAuto?: WeakSet<Layout>;
}

/** Footprint axes for a vertical axis: the other two product axes in L, W, H order. */
export function footprintAxes(vertical: ProductAxis): [ProductAxis, ProductAxis] {
  switch (vertical) {
    case 'L':
      return ['W', 'H'];
    case 'W':
      return ['L', 'H'];
    case 'H':
      return ['L', 'W'];
  }
}

function footprintSizes(c: CartonCandidate, vertical: ProductAxis): [number, number] {
  const [fa, fb] = footprintAxes(vertical);
  return [c.outer[fa], c.outer[fb]];
}

/**
 * Bounding box of the blocks of a layer: minimum corner and size on each axis.
 * Shared by the layer extent and the placement centring so they can never disagree.
 */
export function blocksBounds(
  blocks: Block[],
  a: number,
  b: number,
): { min: { x: number; y: number }; size: { x: number; y: number } } {
  if (blocks.length === 0) return { min: { x: 0, y: 0 }, size: { x: 0, y: 0 } };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const blk of blocks) {
    const dx = blk.rotated ? b : a;
    const dy = blk.rotated ? a : b;
    minX = Math.min(minX, blk.x);
    minY = Math.min(minY, blk.y);
    maxX = Math.max(maxX, blk.x + blk.cols * dx);
    maxY = Math.max(maxY, blk.y + blk.rows * dy);
  }
  return { min: { x: minX, y: minY }, size: { x: maxX - minX, y: maxY - minY } };
}

/** Whether a x b is square within tolerance: turning such a carton 90 degrees changes nothing. */
function isSquare(a: number, b: number): boolean {
  return fitsWithin(a, b) && fitsWithin(b, a);
}

function toPattern(
  result: LayerSearchResult,
  vertical: ProductAxis,
  height: number,
  a: number,
  b: number,
  kind?: LayerPatternKind,
): LayerPattern {
  // On a square footprint a turned block is the same block; store it unrotated.
  const blocks = isSquare(a, b)
    ? result.blocks.map((blk) => (blk.rotated ? { ...blk, rotated: false } : blk))
    : result.blocks;
  const pattern: LayerPattern = {
    vertical,
    height,
    cartonCount: result.count,
    blocks,
    extent: blocksBounds(blocks, a, b).size,
  };
  // Straight-cut layers carry no kind, exactly as before pinwheels existed.
  if (kind === 'pinwheel') pattern.kind = kind;
  return pattern;
}

/**
 * The best layer of a x b cartons in the usable rectangle: the straight-cut layer, or the
 * pinwheel when it holds strictly more cartons (with equal counts straight cuts are easier
 * to build). The pinwheel is not searched once `shouldStop` says so, nor on a square
 * footprint, nor when the straight-cut layer already holds as many cartons as any layer can,
 * nor once the allowance is spent. A search under way checks `shouldStop` as it goes and
 * spends from the allowance.
 */
function searchBestLayer(
  x: number,
  y: number,
  a: number,
  b: number,
  shouldStop?: () => boolean,
  allowance?: PinwheelAllowance,
): { result: LayerSearchResult; straight: LayerSearchResult | null } {
  const result = searchLayer(x, y, a, b);
  if (
    result.count === 0 ||
    isSquare(a, b) ||
    result.count >= layerCountBound(x, y, a, b) ||
    (allowance !== undefined && allowance.remaining <= 0) ||
    shouldStop?.()
  ) {
    return { result, straight: null };
  }
  const pinwheel = pinwheelLayer(x, y, a, b, { beat: result.count, shouldStop, allowance });
  if (pinwheel && pinwheel.count > result.count) {
    return { result: { count: pinwheel.count, blocks: pinwheel.blocks }, straight: result };
  }
  return { result, straight: null };
}

/** Whether the carton may stand with `vertical` up: allowed by rotation rules and not too tall. */
function usableVerticalAxes(c: CartonCandidate, i: Inputs): ProductAxis[] {
  const h = usableHeight(i);
  return allowedVerticalAxes(i).filter((v) => fitsWithin(c.outer[v], h));
}

/**
 * Whether one carton can stand on the pallet at all: some allowed vertical axis within the
 * usable height and its footprint, either way round, within the usable footprint.
 */
export function cartonFitsPallet(c: CartonCandidate, i: Inputs): boolean {
  const { x, y } = usableFootprint(i);
  return usableVerticalAxes(c, i).some((v) => {
    const [a, b] = footprintSizes(c, v);
    return (fitsWithin(a, x) && fitsWithin(b, y)) || (fitsWithin(b, x) && fitsWithin(a, y));
  });
}

/**
 * Best layer for the carton standing on `vertical` (straight cuts, or a pinwheel that holds
 * more), or null if no carton fits. Both searches run once per footprint: the cache keeps
 * the winner. `shouldStop` is checked before and during the pinwheel search; `allowance`, when
 * given, is the pinwheel work all searches sharing it may still spend (see optimize).
 */
export function bestLayer(
  c: CartonCandidate,
  vertical: ProductAxis,
  i: Inputs,
  cache: LayerCache,
  shouldStop?: () => boolean,
  allowance?: PinwheelAllowance,
): LayerPattern | null {
  const [a, b] = footprintSizes(c, vertical);
  const key = `${a}|${b}`;
  let pattern = cache.get(key);
  if (pattern === undefined) {
    const { x, y } = usableFootprint(i);
    const { result, straight } = searchBestLayer(x, y, a, b, shouldStop, allowance);
    const height = c.outer[vertical];
    pattern =
      result.count > 0
        ? toPattern(result, vertical, height, a, b, straight ? 'pinwheel' : undefined)
        : null;
    cache.set(key, pattern);
    if (straight) cache.set(straightKey(key), toPattern(straight, vertical, height, a, b));
  }
  if (pattern === null) return null;
  // The cached pattern may come from another vertical axis or carton with the same footprint.
  return { ...pattern, vertical, height: c.outer[vertical] };
}

/**
 * The best straight-cut layer for the carton standing on `vertical`: the best layer itself
 * unless that is a pinwheel, then the straight-cut layer bestLayer kept beside it.
 * Call after bestLayer for the same carton and axis returned a layer.
 */
export function straightCutLayer(
  c: CartonCandidate,
  vertical: ProductAxis,
  i: Inputs,
  cache: LayerCache,
): LayerPattern {
  const best = bestLayer(c, vertical, i, cache);
  if (best === null) throw new Error('straightCutLayer: no layer fits');
  if (best.kind !== 'pinwheel') return best;
  const [a, b] = footprintSizes(c, vertical);
  const pattern = cache.get(straightKey(`${a}|${b}`));
  if (!pattern) throw new Error('straightCutLayer: the straight-cut layer was not kept');
  return { ...pattern, vertical, height: c.outer[vertical] };
}

/**
 * One of the further pinwheel searches (a true pinwheel: PinwheelOptions.strict), within the
 * time left to them. It is bounded by time alone, not by a count of work, so it is cut short
 * only when the time really is spent; `time.cut` then says so. Null when nothing was found.
 */
function furtherPinwheel(
  x: number,
  y: number,
  a: number,
  b: number,
  opts: Pick<PinwheelOptions, 'beat' | 'atMost'>,
  time: PinwheelSearchTime | undefined,
  shouldStop?: () => boolean,
): PinwheelResult | null {
  if (shouldStop?.()) return null;
  const search = (stop?: () => boolean): { found: PinwheelResult | null; cut: boolean } => {
    const allowance: PinwheelAllowance = { remaining: Infinity };
    const found = pinwheelLayer(x, y, a, b, {
      ...opts,
      strict: true,
      maxWork: Infinity,
      shouldStop: stop,
      allowance,
    });
    return { found, cut: allowance.capped === true };
  };
  if (!time) return search(shouldStop).found;
  const left = time.limitMs - time.spentMs;
  if (!(left > 0)) {
    time.cut = true;
    return null;
  }
  const started = time.now();
  const { found, cut } = search(() => shouldStop?.() === true || time.now() - started >= left);
  time.spentMs += Math.max(0, time.now() - started);
  if (cut) time.cut = true;
  return found;
}

/** The fewest cartons a pinwheel holds: one in each of its four blocks. */
const SMALLEST_PINWHEEL = 4;

/**
 * The pinwheel layer wanted for the carton standing on `vertical` under a layer pattern
 * setting, or null when there is none:
 * - the best layer itself when that is a pinwheel (it holds more than straight cuts);
 * - Prefer pinwheel: otherwise a true pinwheel of at least as many cartons as the straight-cut
 *   layer. Call after bestLayer for the same carton and axis, which gives that count;
 * - Pinwheel only: otherwise the true pinwheel of the most cartons, however few. And when a
 *   maximum pallet weight allows fewer cartons than that pinwheel holds in its one layer, the
 *   true pinwheel of the most cartons the weight allows, if there is one (if not, the heavier
 *   one is returned, and its layouts are then left out as over the weight).
 * "True" is PinwheelOptions.strict: no straight line right across passes through no carton.
 * The best layer, when it is a pinwheel, is used exactly as Auto lays it: it holds more than
 * any straight-cut layer, though a line may still divide a strip of it from the rest.
 * The searches take their time from `pattern.time`, not from the allowance bestLayer uses, so
 * the best layers stay exactly those found under Auto.
 */
export function preferredPinwheel(
  c: CartonCandidate,
  vertical: ProductAxis,
  i: Inputs,
  cache: LayerCache,
  pattern: PinwheelPreference,
  shouldStop?: () => boolean,
): LayerPattern | null {
  const [a, b] = footprintSizes(c, vertical);
  const key = `${a}|${b}`;
  const height = c.outer[vertical];
  const only = pattern.pref === 'pinwheelOnly';
  const { x, y } = usableFootprint(i);
  let found = cache.get(pinwheelKey(key));
  if (found === undefined) {
    const best = cache.get(key);
    found = null;
    if (best?.kind === 'pinwheel') {
      found = best;
    } else if (!only && !best) {
      // No layer at all (or bestLayer was not asked): nothing to tie.
    } else if (!isSquare(a, b)) {
      const beat = !only && best ? best.cartonCount - 1 : 0;
      const pinwheel = furtherPinwheel(x, y, a, b, { beat }, pattern.time, shouldStop);
      if (pinwheel) found = toPattern(pinwheel, vertical, height, a, b, 'pinwheel');
    }
    cache.set(pinwheelKey(key), found);
  }
  if (found === null) return null;
  const most = only ? maxCartonsByWeight(c, i) : Infinity;
  if (found.cartonCount > most && most >= SMALLEST_PINWHEEL) {
    const lighterKey = `${pinwheelKey(key)}|${most}`;
    let lighter = cache.get(lighterKey);
    if (lighter === undefined) {
      const pinwheel = furtherPinwheel(x, y, a, b, { atMost: most }, pattern.time, shouldStop);
      lighter = pinwheel ? toPattern(pinwheel, vertical, height, a, b, 'pinwheel') : null;
      cache.set(lighterKey, lighter);
    }
    if (lighter) found = lighter;
  }
  return { ...found, vertical, height };
}

/**
 * The plain single-grid layers (unrotated, then rotated) that hold at least one carton.
 * On a square footprint the rotated grid is the unrotated one turned, so it is omitted.
 */
export function plainLayers(c: CartonCandidate, vertical: ProductAxis, i: Inputs): LayerPattern[] {
  const [a, b] = footprintSizes(c, vertical);
  const { x, y } = usableFootprint(i);
  const out: LayerPattern[] = [];
  for (const rotated of isSquare(a, b) ? [false] : [false, true]) {
    const grid = gridLayer(x, y, a, b, rotated);
    if (grid.count > 0) out.push(toPattern(grid, vertical, c.outer[vertical], a, b));
  }
  return out;
}

function blocksSignature(blocks: Block[]): string {
  return blocks
    .map((blk) => `${blk.cols}x${blk.rows}${blk.rotated ? 'r' : 'u'}`)
    .sort()
    .join(',');
}

/**
 * Identity of a layout: carton key, then each layer's vertical axis, count and sorted blocks,
 * and ":t" after a layer turned half a turn (so an interlocked layout never shares the id of
 * the same layers unturned; unturned layouts keep the ids they always had).
 */
export function layoutSignature(l: Layout): string {
  const layers = l.layers
    .map(
      (layer) =>
        `${layer.vertical}:${layer.cartonCount}:${blocksSignature(layer.blocks)}${layer.turned ? ':t' : ''}`,
    )
    .join('/');
  return `${cartonKey(l.carton)}|${layers}`;
}

/**
 * The layout with only `layers` (a prefix of its own, bottom first): totals and id recomputed,
 * every other field kept. Used to remove whole layers from the top.
 */
export function withLayers(l: Layout, layers: Layer[]): Layout {
  const totalCartons = layers.reduce((s, layer) => s + layer.cartonCount, 0);
  const next: Layout = {
    ...l,
    layers,
    totalCartons,
    totalProducts: totalCartons * l.carton.boxesPerCarton,
  };
  next.id = layoutSignature(next);
  return next;
}

/** Orders layers (most cartons, then tallest, at the bottom), assigns z and totals. */
function makeLayout(c: CartonCandidate, patterns: LayerPattern[]): Layout {
  const sorted = [...patterns].sort((p, q) => q.cartonCount - p.cartonCount || q.height - p.height);
  let z = 0;
  const layers: Layer[] = sorted.map((p) => {
    const layer = { ...p, z };
    z += p.height;
    return layer;
  });
  const totalCartons = layers.reduce((s, layer) => s + layer.cartonCount, 0);
  const layout: Layout = {
    id: '',
    carton: c,
    layers,
    totalCartons,
    totalProducts: totalCartons * c.boxesPerCarton,
  };
  layout.id = layoutSignature(layout);
  return layout;
}

function repeat(pattern: LayerPattern, n: number): LayerPattern[] {
  return Array.from({ length: n }, () => pattern);
}

interface MixedChoice {
  counts: number[]; // layers per entry of `types`
  cartons: number;
  axes: number; // distinct vertical axes used
  height: number;
}

/** Whether `p` beats `q`: more cartons, then fewer axes, then lower height, then more layers of earlier axes. */
function betterMix(p: MixedChoice, q: MixedChoice): boolean {
  if (p.cartons !== q.cartons) return p.cartons > q.cartons;
  if (p.axes !== q.axes) return p.axes < q.axes;
  if (p.height !== q.height) return p.height < q.height;
  for (let k = 0; k < p.counts.length; k++) {
    const pk = p.counts[k] as number;
    const qk = q.counts[k] as number;
    if (pk !== qk) return pk > qk;
  }
  return false;
}

/**
 * Exhaustive search over non-negative layer counts per layer type (at most three, one per
 * vertical axis) whose total height fits the usable height, maximizing total cartons.
 * The last type always takes as many layers as still fit: any fewer gives fewer cartons, so
 * such a choice can never be the best. Returns null if `shouldStop` returns true (checked
 * every thousand or so choices).
 */
function bestMix(
  types: LayerPattern[],
  usable: number,
  shouldStop?: () => boolean,
): MixedChoice | null {
  let best: MixedChoice | null = null;
  let stopped = false;
  let visits = 0;
  const counts = types.map(() => 0);
  const last = types.length - 1;
  const visit = (k: number, height: number): void => {
    if (k === types.length) {
      if ((++visits & 0x3ff) === 0 && shouldStop?.()) stopped = true;
      if (!fitsWithin(height, usable)) return;
      const cartons = types.reduce((s, t, idx) => s + t.cartonCount * (counts[idx] as number), 0);
      if (cartons === 0) return;
      const choice: MixedChoice = {
        counts: [...counts],
        cartons,
        axes: counts.filter((n) => n > 0).length,
        height,
      };
      if (best === null || betterMix(choice, best)) best = choice;
      return;
    }
    const t = types[k] as LayerPattern;
    const max = fitsCount(usable - height, t.height);
    // The last type: only the most layers whose total height really fits.
    let from = 0;
    if (k === last) {
      from = max;
      while (from > 0 && !fitsWithin(height + from * t.height, usable)) from--;
    }
    for (let n = Math.max(0, from); n <= max && !stopped; n++) {
      counts[k] = n;
      visit(k + 1, height + n * t.height);
    }
    counts[k] = 0;
  };
  visit(0, 0);
  return stopped ? null : best;
}

/** Candidate layouts for one carton from one best layer per vertical axis (may repeat). */
function layoutsFromTypes(
  c: CartonCandidate,
  i: Inputs,
  types: LayerPattern[],
  shouldStop?: () => boolean,
  plainGrids = true,
): Layout[] {
  const h = usableHeight(i);
  const candidates: Layout[] = [];
  // 1. single-type stacks of the best layer
  for (const t of types) candidates.push(makeLayout(c, repeat(t, fitsCount(h, t.height))));
  // 2. single-type stacks of each plain grid that differs from the best layer
  for (const t of plainGrids ? types : []) {
    const bestSig = blocksSignature(t.blocks);
    for (const p of plainLayers(c, t.vertical, i)) {
      if (p.cartonCount < t.cartonCount || blocksSignature(p.blocks) !== bestSig) {
        candidates.push(makeLayout(c, repeat(p, fitsCount(h, p.height))));
      }
    }
  }
  // 3. the mixed stack, only when it really mixes vertical axes
  if (!i.keepCartonsUpright && types.length > 1) {
    const mix = bestMix(types, h, shouldStop);
    if (mix && mix.axes > 1) {
      candidates.push(
        makeLayout(
          c,
          types.flatMap((t, k) => repeat(t, mix.counts[k] as number)),
        ),
      );
    }
  }
  return candidates;
}

/**
 * All distinct layouts for one carton; [] if it cannot be placed. `shouldStop` is checked
 * before every layer search after the first: once it returns true the remaining vertical
 * axes are skipped, so the result covers only the axes searched so far.
 *
 * When a pinwheel is the best layer on some axis, the layouts built from the straight-cut
 * layers follow those built from the best layers, so every layout offered before pinwheels
 * existed is still offered: staff may prefer a simpler build that is a box or two short, and
 * under a weight limit a layer with more cartons can be too heavy where the straight-cut
 * layer is not. `allowance` is passed on to bestLayer.
 *
 * `pattern` is the layer pattern setting when it is not Auto. Prefer pinwheel adds, ahead of
 * the layouts above, those built with a pinwheel on every axis that has one tying the
 * straight-cut count. Pinwheel only builds from pinwheel layers alone and nothing else.
 */
export function buildLayouts(
  c: CartonCandidate,
  i: Inputs,
  cache: LayerCache,
  shouldStop?: () => boolean,
  allowance?: PinwheelAllowance,
  pattern?: PinwheelPreference,
): Layout[] {
  if (pattern?.pref === 'pinwheelOnly')
    return pinwheelOnlyLayouts(c, i, cache, pattern, shouldStop);
  const types: LayerPattern[] = [];
  const straight: LayerPattern[] = [];
  // Prefer pinwheel: a pinwheel that ties the straight-cut count takes the layer's place.
  const preferred: LayerPattern[] = [];
  for (const [k, v] of usableVerticalAxes(c, i).entries()) {
    if (k > 0 && shouldStop?.()) break;
    const layer = bestLayer(c, v, i, cache, shouldStop, allowance);
    if (!layer) continue;
    types.push(layer);
    straight.push(layer.kind === 'pinwheel' ? straightCutLayer(c, v, i, cache) : layer);
    if (pattern) preferred.push(preferredPinwheel(c, v, i, cache, pattern, shouldStop) ?? layer);
  }

  // Under Prefer pinwheel the layouts of the tying pinwheels come first; every layout Auto
  // builds follows, so nothing Auto offers is lost and the straight-cut alternative stays.
  const further: Layout[] = [];
  if (preferred.some((t, k) => t.kind !== types[k]?.kind)) {
    further.push(...layoutsFromTypes(c, i, preferred, shouldStop));
  }
  const auto = layoutsFromTypes(c, i, types, shouldStop);
  if (straight.some((t, k) => t !== types[k])) {
    auto.push(...layoutsFromTypes(c, i, straight, shouldStop));
  }
  const all = distinct([...further, ...auto]);
  if (pattern?.beyondAuto && further.length > 0) {
    const autoIds = new Set(auto.map((l) => l.id));
    for (const l of all) if (!autoIds.has(l.id)) pattern.beyondAuto.add(l);
  }
  return all;
}

/**
 * Pinwheel only: the layouts of one carton built from its pinwheel layers alone (one per
 * vertical axis that has one), with no plain grid and no straight-cut alternative.
 */
function pinwheelOnlyLayouts(
  c: CartonCandidate,
  i: Inputs,
  cache: LayerCache,
  pattern: PinwheelPreference,
  shouldStop?: () => boolean,
): Layout[] {
  const types: LayerPattern[] = [];
  for (const [k, v] of usableVerticalAxes(c, i).entries()) {
    if (k > 0 && shouldStop?.()) break;
    // The best layer first, as Auto searches it (a no-op when Auto has searched this
    // footprint): a best layer that is a pinwheel is the one listed, so the layouts do not
    // depend on whether the caller built Auto's layouts for this carton too.
    bestLayer(c, v, i, cache, shouldStop, pattern.ownWork);
    const layer = preferredPinwheel(c, v, i, cache, pattern, shouldStop);
    if (layer) types.push(layer);
  }
  return types.length === 0 ? [] : distinct(layoutsFromTypes(c, i, types, shouldStop, false));
}

function distinct(candidates: Layout[]): Layout[] {
  const seen = new Set<string>();
  return candidates.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}
