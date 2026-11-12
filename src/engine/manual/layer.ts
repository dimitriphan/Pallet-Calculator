/**
 * A layer placed by hand (spec 6.2b, 7): where each carton sits, and the rules for changing
 * that. Cartons are positions in the frame of the usable footprint (pallet plus allowed
 * overhang): x along the pallet's length, y along its width, origin at the footprint's minimum
 * corner, inches. The front of the pallet, as the 3D view first shows it and at the bottom of
 * the build sheet's top view, is the edge at the greatest y; the left is x = 0.
 *
 * Two cartons may touch but never overlap (by more than the engine's tolerance). A carton may
 * lie outside the usable footprint: that is flagged, not refused. Every function here is pure
 * and returns a new list, so an editor can keep the old one for undo.
 */
import { EPS } from '../../domain/constants';
import type { Block, CartonCandidate, Inputs, LayerPattern, ProductAxis } from '../../domain/types';
import { usableFootprint, type Rect } from '../packing/geometry';
import { layerOffset } from '../packing/positions';
import { blocksBounds, footprintAxes } from '../packing/stacking';

/** One carton of a manual layer: its minimum corner and whether it is turned 90° flat. */
export interface ManualCarton {
  x: number;
  y: number;
  rotated: boolean;
}

/**
 * The carton's base on the pallet: an unturned carton lays `a` along x and `b` along y, a
 * turned one `b` along x and `a` along y (the convention of every layer's blocks).
 */
export interface CartonBase {
  a: number;
  b: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Inches: a dragged carton's edge this close to another edge snaps to it. */
export const SNAP_THRESHOLD = 0.5;

/** The base of `carton` when it stands with `vertical` up. */
export function cartonBase(carton: CartonCandidate, vertical: ProductAxis): CartonBase {
  const [fa, fb] = footprintAxes(vertical);
  return { a: carton.outer[fa], b: carton.outer[fb] };
}

/** The rectangle a carton covers. */
export function cartonRect(c: ManualCarton, base: CartonBase): Rect {
  return { x: c.x, y: c.y, w: c.rotated ? base.b : base.a, h: c.rotated ? base.a : base.b };
}

/** The pallet itself in the usable footprint's frame: inset by half the overhang on each side. */
export function palletRect(inputs: Inputs): Rect {
  const inset = inputs.overhang / 2;
  return { x: inset, y: inset, w: inputs.pallet.length, h: inputs.pallet.width };
}

function overlaps(p: Rect, q: Rect): boolean {
  return (
    Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > EPS &&
    Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > EPS
  );
}

/**
 * The manual layer of a list of cartons, as the layer type everything else reads: kind
 * 'manual', one block of one carton per carton, in the order given.
 */
export function manualPattern(
  cartons: readonly ManualCarton[],
  carton: CartonCandidate,
  vertical: ProductAxis,
): LayerPattern {
  const { a, b } = cartonBase(carton, vertical);
  const blocks: Block[] = cartons.map((c) => ({
    x: c.x,
    y: c.y,
    cols: 1,
    rows: 1,
    rotated: c.rotated,
  }));
  return {
    vertical,
    height: carton.outer[vertical],
    cartonCount: blocks.length,
    blocks,
    extent: blocksBounds(blocks, a, b).size,
    kind: 'manual',
  };
}

/**
 * Every carton of any layer pattern (straight cuts, pinwheel or manual) as a manual carton,
 * block by block and row by row, standing exactly where the pattern is placed on the pallet:
 * a calculated layer is centred in the usable footprint, and so are its cartons here.
 */
export function explodePattern(
  pattern: LayerPattern,
  carton: CartonCandidate,
  inputs: Inputs,
): ManualCarton[] {
  const { a, b } = cartonBase(carton, pattern.vertical);
  const offset = layerOffset(pattern, a, b, usableFootprint(inputs));
  const out: ManualCarton[] = [];
  for (const blk of pattern.blocks) {
    const w = blk.rotated ? b : a;
    const h = blk.rotated ? a : b;
    for (let row = 0; row < blk.rows; row++) {
      for (let col = 0; col < blk.cols; col++) {
        out.push({
          x: offset.x + blk.x + col * w,
          y: offset.y + blk.y + row * h,
          rotated: blk.rotated,
        });
      }
    }
  }
  return out;
}

/** Any layer pattern as a manual layer: `manualPattern` of `explodePattern`. */
export function fromPattern(
  pattern: LayerPattern,
  carton: CartonCandidate,
  inputs: Inputs,
): LayerPattern {
  return manualPattern(explodePattern(pattern, carton, inputs), carton, pattern.vertical);
}

/** The cartons of a manual layer (a layer with one single-carton block per carton). */
export function cartonsOf(pattern: LayerPattern): ManualCarton[] {
  return pattern.blocks.map((blk) => ({ x: blk.x, y: blk.y, rotated: blk.rotated }));
}

/**
 * Whether `candidate` overlaps none of `cartons`. `ignore` is the index of a carton to leave
 * out (the one being moved or turned). Touching is allowed; so is lying outside the footprint.
 */
export function canPlace(
  cartons: readonly ManualCarton[],
  candidate: ManualCarton,
  base: CartonBase,
  ignore?: number,
): boolean {
  const rect = cartonRect(candidate, base);
  return cartons.every((c, k) => k === ignore || !overlaps(rect, cartonRect(c, base)));
}

/** The number of pairs of cartons that overlap: 0 for every layer these functions build. */
export function overlapCount(cartons: readonly ManualCarton[], base: CartonBase): number {
  const rects = cartons.map((c) => cartonRect(c, base)).sort((p, q) => p.x - q.x);
  let pairs = 0;
  rects.forEach((p, i) => {
    for (let j = i + 1; j < rects.length; j++) {
      const q = rects[j] as Rect;
      if (q.x >= p.x + p.w - EPS) break;
      if (overlaps(p, q)) pairs++;
    }
  });
  return pairs;
}

/**
 * The layer with carton `index` moved to `to` (its minimum corner), or null when it would
 * overlap another carton there or there is no such carton: the move is refused.
 */
export function moveCarton(
  cartons: readonly ManualCarton[],
  index: number,
  to: Point,
  base: CartonBase,
): ManualCarton[] | null {
  const current = cartons[index];
  if (!current || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return null;
  const moved = { ...current, x: to.x, y: to.y };
  if (!canPlace(cartons, moved, base, index)) return null;
  return cartons.map((c, k) => (k === index ? moved : c));
}

function inside(r: Rect, usable: Point): boolean {
  return r.x >= -EPS && r.y >= -EPS && r.x + r.w <= usable.x + EPS && r.y + r.h <= usable.y + EPS;
}

/**
 * The layer with carton `index` turned 90° flat, or null when the turned carton would overlap
 * wherever it is put (the turn is refused). A turned carton cannot cover the same rectangle,
 * so it is tried with each of its corners kept where it was (minimum corner first) and then
 * with its centre kept; the first place inside the usable footprint that overlaps nothing is
 * taken, else the first that overlaps nothing at all (the carton then overhangs, and is
 * flagged). A square carton is turned where it stands.
 */
export function turnCarton(
  cartons: readonly ManualCarton[],
  index: number,
  base: CartonBase,
  usable: Point,
): ManualCarton[] | null {
  const current = cartons[index];
  if (!current) return null;
  const { x, y, w, h } = cartonRect(current, base);
  // Turned, the carton is h wide and w deep.
  const places: Point[] = [
    { x, y },
    { x: x + w - h, y },
    { x, y: y + h - w },
    { x: x + w - h, y: y + h - w },
    { x: x + (w - h) / 2, y: y + (h - w) / 2 },
  ];
  const free = places
    .map((p): ManualCarton => ({ x: p.x, y: p.y, rotated: !current.rotated }))
    .filter((c) => canPlace(cartons, c, base, index));
  const turned = free.find((c) => inside(cartonRect(c, base), usable)) ?? free[0];
  if (!turned) return null;
  return cartons.map((c, k) => (k === index ? turned : c));
}

/**
 * The first free spot for one more carton lying `rotated` or not: wholly inside the usable
 * footprint and overlapping nothing, scanning from the front-left corner (nearest the front
 * first, then furthest left). Null when there is no such spot.
 *
 * The spots tried are those where the carton is pushed against the front edge or the back of
 * another carton, and against the left edge or the right side of another carton. If the carton
 * fits anywhere inside the footprint it fits at one of those (slide it forward, then left,
 * until it stops), so null means there is truly no room.
 */
export function firstFreeSpot(
  cartons: readonly ManualCarton[],
  rotated: boolean,
  base: CartonBase,
  usable: Point,
): Point | null {
  const { w, h } = cartonRect({ x: 0, y: 0, rotated }, base);
  if (w > usable.x + EPS || h > usable.y + EPS) return null;
  const rects = cartons.map((c) => cartonRect(c, base));
  // Front first: the carton's front edge on the footprint's front edge, or on a carton's back.
  const ys = distinct([usable.y - h, ...rects.map((r) => r.y - h)])
    .filter((y) => y >= -EPS && y + h <= usable.y + EPS)
    .sort((p, q) => q - p);
  for (const y of ys) {
    // Only cartons in this band of y can be in the way.
    const band = rects.filter((r) => Math.min(r.y + r.h, y + h) - Math.max(r.y, y) > EPS);
    const xs = distinct([0, ...band.map((r) => r.x + r.w)])
      .filter((x) => x >= -EPS && x + w <= usable.x + EPS)
      .sort((p, q) => p - q);
    for (const x of xs) {
      const spot = { x, y, w, h };
      if (band.every((r) => !overlaps(spot, r))) return { x, y };
    }
  }
  return null;
}

function distinct(values: number[]): number[] {
  return [...new Set(values)];
}

/**
 * The layer with one more carton at the first free spot (see `firstFreeSpot`) and the new
 * carton's index, or null when there is no room inside the usable footprint: nothing is added.
 */
export function addCarton(
  cartons: readonly ManualCarton[],
  rotated: boolean,
  base: CartonBase,
  usable: Point,
): { cartons: ManualCarton[]; index: number } | null {
  const spot = firstFreeSpot(cartons, rotated, base, usable);
  if (!spot) return null;
  return { cartons: [...cartons, { ...spot, rotated }], index: cartons.length };
}

/** The layer without carton `index` (unchanged, as a new list, when there is no such carton). */
export function removeCarton(cartons: readonly ManualCarton[], index: number): ManualCarton[] {
  return cartons.filter((_, k) => k !== index);
}

/** Where a dragged carton may snap to: the things whose edges attract it. */
export interface SnapTargets {
  /** The usable footprint (pallet plus allowed overhang), at the origin. */
  usable: Point;
  /** The pallet in the same frame (see `palletRect`). */
  pallet: Rect;
  /** The other cartons' rectangles (not the dragged one). */
  others: readonly Rect[];
}

/** The snap targets for dragging carton `index` (or a new carton, with no index). */
export function snapTargets(
  cartons: readonly ManualCarton[],
  base: CartonBase,
  inputs: Inputs,
  index?: number,
): SnapTargets {
  return {
    usable: usableFootprint(inputs),
    pallet: palletRect(inputs),
    others: cartons.filter((_, k) => k !== index).map((c) => cartonRect(c, base)),
  };
}

/** `v` moved so that `v` or `v + size` lies on the nearest edge within the threshold. */
function snapAxis(v: number, size: number, edges: number[], threshold: number): number {
  let best = v;
  let bestGap = Infinity;
  for (const edge of edges) {
    // The near side on the edge, then the far side on it; the earlier edge wins a tie.
    for (const to of [edge, edge - size]) {
      const gap = Math.abs(to - v);
      if (gap <= threshold && gap < bestGap) {
        best = to;
        bestGap = gap;
      }
    }
  }
  return best;
}

/**
 * A dragged position snapped: on each axis, when one of the carton's two edges is within
 * `threshold` of an edge of the usable footprint, the pallet or another carton, the carton is
 * moved so that edge lies exactly on it (the nearest such edge; the footprint's, then the
 * pallet's, then a carton's on a tie). The axes snap independently. A `threshold` of null or 0
 * switches snapping off: the position comes back unchanged. Snapping does not check overlap;
 * `moveCarton` does.
 */
export function snap(
  position: Point,
  size: { w: number; h: number },
  targets: SnapTargets,
  threshold: number | null = SNAP_THRESHOLD,
): Point {
  if (threshold === null || !(threshold > 0)) return { x: position.x, y: position.y };
  const { usable, pallet, others } = targets;
  const xs = [0, usable.x, pallet.x, pallet.x + pallet.w];
  const ys = [0, usable.y, pallet.y, pallet.y + pallet.h];
  for (const r of others) {
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  }
  return {
    x: snapAxis(position.x, size.w, xs, threshold),
    y: snapAxis(position.y, size.h, ys, threshold),
  };
}

/** How many cartons lie outside the usable footprint, and the furthest any reaches outside. */
export interface Overhang {
  cartons: number;
  /** Inches: the largest distance a carton's edge lies beyond the footprint's edge; 0 if none. */
  by: number;
}

/** The cartons outside the usable footprint (by more than the engine's tolerance). */
export function overhangOf(
  cartons: readonly ManualCarton[],
  base: CartonBase,
  usable: Point,
): Overhang {
  let count = 0;
  let by = 0;
  for (const c of cartons) {
    const r = cartonRect(c, base);
    const out = Math.max(-r.x, -r.y, r.x + r.w - usable.x, r.y + r.h - usable.y);
    if (out > EPS) {
      count++;
      by = Math.max(by, out);
    }
  }
  return { cartons: count, by };
}
