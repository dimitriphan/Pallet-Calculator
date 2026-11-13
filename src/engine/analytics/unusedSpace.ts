/**
 * The unused space of a layout inside the available envelope (the usable footprint times the
 * usable height, as `availableVolume` measures it): the headroom above the stack and, in every
 * layer, the parts of the usable footprint its cartons leave free. The two volumes add up to
 * the analytics' remaining volume; the boxes are what the 3D view draws.
 */
import { EPS } from '../../domain/constants';
import type { Block, Inputs, Layer, Layout, ProductAxis } from '../../domain/types';
import type { Rect } from '../packing/geometry';
import { usableFootprint, usableHeight } from '../packing/geometry';
import { layerOffset } from '../packing/positions';
import { footprintAxes } from '../packing/stacking';

/** An axis-aligned box in inches, in the engine frame cartonPlacements uses. */
export interface SpaceBox {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface UnusedSpace {
  /** The usable footprint from the top of the stack to the usable height; null under MIN_GAP. */
  headroom: SpaceBox | null;
  /** Free parts of each layer at least MIN_GAP on both sides, bottom layer first. */
  gaps: SpaceBox[];
  headroomVolume: number;
  /** Every free part of every layer, the ones too thin to draw included. */
  gapVolume: number;
}

/** Inches: free space thinner than this is counted but not drawn. */
export const MIN_GAP = 0.25;

/** Edges this close together are one edge, so float noise makes no sliver cells. */
const SNAP = 1e-9;

/** Sorted distinct values, any within SNAP of the previous kept one dropped. */
function snappedEdges(values: number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((p, q) => p - q)) {
    const last = out[out.length - 1];
    if (last === undefined || v - last > SNAP) out.push(v);
  }
  return out;
}

/** Index of the edge `v` snapped to (the last edge not above v + SNAP). */
function edgeIndex(edges: number[], v: number): number {
  let lo = 0;
  let hi = edges.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((edges[mid] as number) <= v + SNAP) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The parts of the width x depth rectangle at the origin that no rectangle of `covered`
 * touches, as non-overlapping rectangles: the plane is cut on every rectangle edge, free
 * cells are merged along x into runs, and runs with the same ends in consecutive bands are
 * merged along y. Sorted by y, then x.
 */
export function freeRects(width: number, depth: number, covered: readonly Rect[]): Rect[] {
  const clip = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const rects = covered.map((r) => ({
    x0: clip(r.x, width),
    x1: clip(r.x + r.w, width),
    y0: clip(r.y, depth),
    y1: clip(r.y + r.h, depth),
  }));
  const xs = snappedEdges([0, width, ...rects.flatMap((r) => [r.x0, r.x1])]);
  const ys = snappedEdges([0, depth, ...rects.flatMap((r) => [r.y0, r.y1])]);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const used = new Uint8Array(Math.max(0, nx * ny));
  for (const r of rects) {
    const i0 = edgeIndex(xs, r.x0);
    const i1 = edgeIndex(xs, r.x1);
    const j0 = edgeIndex(ys, r.y0);
    const j1 = edgeIndex(ys, r.y1);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) used[j * nx + i] = 1;
  }

  const done: Rect[] = [];
  // Rectangles still growing along y, keyed by their run's first and last cell.
  let open = new Map<string, Rect>();
  for (let j = 0; j < ny; j++) {
    const y0 = ys[j] as number;
    const h = (ys[j + 1] as number) - y0;
    const next = new Map<string, Rect>();
    for (let i = 0; i < nx;) {
      if (used[j * nx + i]) {
        i++;
        continue;
      }
      let end = i;
      while (end < nx && !used[j * nx + end]) end++;
      const key = `${i}:${end}`;
      const x0 = xs[i] as number;
      const grown = open.get(key);
      if (grown) {
        grown.h += h;
        open.delete(key);
        next.set(key, grown);
      } else {
        next.set(key, { x: x0, y: y0, w: (xs[end] as number) - x0, h });
      }
      i = end;
    }
    done.push(...open.values());
    open = next;
  }
  done.push(...open.values());
  return done.sort((p, q) => p.y - q.y || p.x - q.x);
}

/** The rectangle each block of the layer covers, placed as cartonPlacements places it. */
function placedBlockRects(layer: Layer, l: Layout, usable: { x: number; y: number }): Rect[] {
  const [fa, fb] = footprintAxes(layer.vertical);
  const a = l.carton.outer[fa];
  const b = l.carton.outer[fb];
  const offset = layerOffset(layer, a, b, usable);
  return layer.blocks.map((blk) => ({
    x: offset.x + blk.x,
    y: offset.y + blk.y,
    w: blk.cols * (blk.rotated ? b : a),
    h: blk.rows * (blk.rotated ? a : b),
  }));
}

/** The parts of the usable footprint the layer's cartons leave free, as placed. */
export function layerFreeRects(layer: Layer, l: Layout, usable: { x: number; y: number }): Rect[] {
  return freeRects(usable.x, usable.y, placedBlockRects(layer, l, usable));
}

const drawable = (size: number) => size >= MIN_GAP - SNAP;

/**
 * The unused space inside the envelope. Cartons may lie partly or wholly outside it (a layer
 * placed by hand may overhang, or stand taller than the usable height): only what is inside
 * counts, so no volume is ever negative and the two volumes never exceed the envelope.
 */
export function unusedSpace(l: Layout, i: Inputs): UnusedSpace {
  const usable = usableFootprint(i);
  const height = usableHeight(i);
  const gaps: SpaceBox[] = [];
  let gapVolume = 0;
  let top = 0;
  // Layers of one pattern share their block list: its free parts are worked out once.
  const freeOf = new Map<readonly Block[], { vertical: ProductAxis; free: Rect[] }>();
  for (const layer of l.layers) {
    const layerTop = layer.z + layer.height;
    top = Math.max(top, layerTop);
    // The part of the layer inside the envelope: all of it, unless it stands above the limit.
    const dz = layerTop > height + EPS ? Math.max(0, height - layer.z) : layer.height;
    if (dz <= 0) continue;
    const known = freeOf.get(layer.blocks);
    const free = known?.vertical === layer.vertical ? known.free : layerFreeRects(layer, l, usable);
    freeOf.set(layer.blocks, { vertical: layer.vertical, free });
    for (const r of free) {
      gapVolume += r.w * r.h * dz;
      if (drawable(r.w) && drawable(r.h)) {
        gaps.push({ x: r.x, y: r.y, z: layer.z, dx: r.w, dy: r.h, dz });
      }
    }
  }
  const above = Math.max(0, height - top);
  return {
    headroom: drawable(above)
      ? { x: 0, y: 0, z: top, dx: usable.x, dy: usable.y, dz: above }
      : null,
    gaps,
    headroomVolume: usable.x * usable.y * above,
    gapVolume,
  };
}
