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

/** Bounding size of the blocks (max minus min corner on each axis). */
function blocksExtent(blocks: Block[], a: number, b: number): { x: number; y: number } {
  if (blocks.length === 0) return { x: 0, y: 0 };
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
  return { x: maxX - minX, y: maxY - minY };
}

function toPattern(
  result: LayerSearchResult,
  vertical: ProductAxis,
  height: number,
  a: number,
  b: number,
): LayerPattern {
  return {
    vertical,
    height,
    cartonCount: result.count,
    blocks: result.blocks,
    extent: blocksExtent(result.blocks, a, b),
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

/** The plain single-grid layers (unrotated, then rotated) that hold at least one carton. */
export function plainLayers(c: CartonCandidate, vertical: ProductAxis, i: Inputs): LayerPattern[] {
  const [a, b] = footprintSizes(c, vertical);
  const { x, y } = usableFootprint(i);
  const out: LayerPattern[] = [];
  for (const rotated of [false, true]) {
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
 */
function bestMix(types: LayerPattern[], usable: number): MixedChoice | null {
  let best: MixedChoice | null = null;
  const counts = types.map(() => 0);
  const visit = (k: number, height: number): void => {
    if (k === types.length) {
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
    for (let n = 0; n <= max; n++) {
      counts[k] = n;
      visit(k + 1, height + n * t.height);
    }
    counts[k] = 0;
  };
  visit(0, 0);
  return best;
}

/** All distinct layouts for one carton; [] if it cannot be placed. */
export function buildLayouts(c: CartonCandidate, i: Inputs, cache: LayerCache): Layout[] {
  const h = usableHeight(i);
  const types: LayerPattern[] = [];
  for (const v of usableVerticalAxes(c, i)) {
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
    const mix = bestMix(types, h);
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
