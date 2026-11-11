import type {
  Block,
  CartonCandidate,
  Inputs,
  Layer,
  LayerPattern,
  LayerPatternKind,
  Layout,
  ProductAxis,
} from '../../domain/types';
import { cartonKey } from './cartons';
import { usableFootprint, usableHeight } from './geometry';
import { gridLayer, searchLayer, type LayerSearchResult } from './layerSearch';
import { layerCountBound, pinwheelLayer, type PinwheelAllowance } from './pinwheel';
import { allowedVerticalAxes } from './rotation';
import { fitsCount, fitsWithin } from './tolerance';

/**
 * Best layer patterns keyed by footprint `${a}|${b}`. The layer search depends only on the
 * footprint sizes and the usable area, so one cache serves every candidate of one set of inputs.
 * When a pinwheel is best, the straight-cut layer is kept beside it under `${a}|${b}|straight`.
 */
export type LayerCache = Map<string, LayerPattern | null>;

function straightKey(key: string): string {
  return `${key}|straight`;
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
): Layout[] {
  const h = usableHeight(i);
  const candidates: Layout[] = [];
  // 1. single-type stacks of the best layer
  for (const t of types) candidates.push(makeLayout(c, repeat(t, fitsCount(h, t.height))));
  // 2. single-type stacks of each plain grid that differs from the best layer
  for (const t of types) {
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
 */
export function buildLayouts(
  c: CartonCandidate,
  i: Inputs,
  cache: LayerCache,
  shouldStop?: () => boolean,
  allowance?: PinwheelAllowance,
): Layout[] {
  const types: LayerPattern[] = [];
  const straight: LayerPattern[] = [];
  for (const [k, v] of usableVerticalAxes(c, i).entries()) {
    if (k > 0 && shouldStop?.()) break;
    const layer = bestLayer(c, v, i, cache, shouldStop, allowance);
    if (!layer) continue;
    types.push(layer);
    straight.push(layer.kind === 'pinwheel' ? straightCutLayer(c, v, i, cache) : layer);
  }

  const candidates = layoutsFromTypes(c, i, types, shouldStop);
  if (straight.some((t, k) => t !== types[k])) {
    candidates.push(...layoutsFromTypes(c, i, straight, shouldStop));
  }

  const seen = new Set<string>();
  return candidates.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}
