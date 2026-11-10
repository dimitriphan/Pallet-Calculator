import type {
  Block,
  CartonCandidate,
  Inputs,
  Layer,
  LayerPattern,
  Layout,
  ProductAxis,
} from '../../domain/types';
import { cartonKey } from './cartons';
import { usableFootprint, usableHeight } from './geometry';
import { gridLayer, searchLayer, type LayerSearchResult } from './layerSearch';
import { allowedVerticalAxes } from './rotation';
import { fitsCount, fitsWithin } from './tolerance';

/**
 * Best layer patterns keyed by footprint `${a}|${b}`. The layer search depends only on the
 * footprint sizes and the usable area, so one cache serves every candidate of one set of inputs.
 */
export type LayerCache = Map<string, LayerPattern | null>;

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
): LayerPattern {
  // On a square footprint a turned block is the same block; store it unrotated.
  const blocks = isSquare(a, b)
    ? result.blocks.map((blk) => (blk.rotated ? { ...blk, rotated: false } : blk))
    : result.blocks;
  return {
    vertical,
    height,
    cartonCount: result.count,
    blocks,
    extent: blocksBounds(blocks, a, b).size,
  };
}

/** Whether the carton may stand with `vertical` up: allowed by rotation rules and not too tall. */
function usableVerticalAxes(c: CartonCandidate, i: Inputs): ProductAxis[] {
  const h = usableHeight(i);
  return allowedVerticalAxes(i).filter((v) => fitsWithin(c.outer[v], h));
}

/** Best guillotine layer for the carton standing on `vertical`, or null if no carton fits. */
export function bestLayer(
  c: CartonCandidate,
  vertical: ProductAxis,
  i: Inputs,
  cache: LayerCache,
): LayerPattern | null {
  const [a, b] = footprintSizes(c, vertical);
  const key = `${a}|${b}`;
  let pattern = cache.get(key);
  if (pattern === undefined) {
    const { x, y } = usableFootprint(i);
    const result = searchLayer(x, y, a, b);
    pattern = result.count > 0 ? toPattern(result, vertical, c.outer[vertical], a, b) : null;
    cache.set(key, pattern);
  }
  if (pattern === null) return null;
  // The cached pattern may come from another vertical axis or carton with the same footprint.
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

/** Identity of a layout: carton key, then each layer's vertical axis, count and sorted blocks. */
export function layoutSignature(l: Layout): string {
  const layers = l.layers
    .map((layer) => `${layer.vertical}:${layer.cartonCount}:${blocksSignature(layer.blocks)}`)
    .join('/');
  return `${cartonKey(l.carton)}|${layers}`;
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

/**
 * All distinct layouts for one carton; [] if it cannot be placed. `shouldStop` is checked
 * before every layer search after the first: once it returns true the remaining vertical
 * axes are skipped, so the result covers only the axes searched so far.
 */
export function buildLayouts(
  c: CartonCandidate,
  i: Inputs,
  cache: LayerCache,
  shouldStop?: () => boolean,
): Layout[] {
  const h = usableHeight(i);
  const types: LayerPattern[] = [];
  for (const [k, v] of usableVerticalAxes(c, i).entries()) {
    if (k > 0 && shouldStop?.()) break;
    const layer = bestLayer(c, v, i, cache);
    if (layer) types.push(layer);
  }

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

  const seen = new Set<string>();
  return candidates.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}
