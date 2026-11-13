/**
 * Stability rating (spec 7.1): four checks on a layout, each giving no warning, a caution or
 * a serious warning against the thresholds in stabilityThresholds.ts. Advice only: crush
 * strength is not checked.
 *
 * A layout placed by hand (layers of kind 'manual') is checked more closely, because its
 * cartons may stand apart from each other and off the pallet: the stack height check is made
 * on each free-standing group of the bottom layer, and a fifth check ('deck') measures how
 * much of each bottom carton rests on the pallet. Calculated layouts are rated by the four
 * checks exactly as before.
 *
 * Layers are compared as placed: each layer is centred in the usable footprint by its own
 * bounding box, so two layers line up by their centres whatever the footprint (no inputs
 * needed). Cartons of a block tile the block's rectangle exactly, so areas are worked out on
 * block rectangles, which keeps every check cheap on layers of thousands of cartons.
 */
import { EPS } from '../../domain/constants';
import { STABILITY } from '../../domain/stabilityThresholds';
import type {
  Block,
  CartonCandidate,
  Inputs,
  Layer,
  Layout,
  Stability,
  StabilityRating,
  StabilityWarning,
} from '../../domain/types';
import type { Rect } from '../packing/geometry';
import { blocksBounds, footprintAxes } from '../packing/stacking';
import { formatNumber } from '../units/units';

/** Values this close to a threshold count as on it (thresholds are strict). */
const TOLERANCE = 1e-9;

/** What the checks measured on a layout. */
export interface StabilityMeasures {
  /**
   * Stack height (pallet deck excluded) ÷ the shorter side of the bottom layer's extent. For a
   * layout placed by hand: the worst such ratio over the free-standing groups of the bottom
   * layer, each by its own extent (the same number while the layer is one group).
   */
  stackHeightRatio: number;
  /**
   * Only on a layout placed by hand: how many free-standing groups its bottom layer is in
   * (cartons joined edge to edge). Above 1, `stackHeightRatio` is that of the worst group.
   */
  freeStandingGroups?: number;
  /**
   * Only on a layout placed by hand and measured with its inputs: the least share (0..1) of a
   * bottom carton's base that rests on the pallet deck, and how many bottom cartons have less
   * than the caution share on it.
   */
  deck?: { share: number; cartons: number };
  /** The tallest carton height ÷ shorter base side over the layers, and its layer (from 1). */
  cartonHeight: { ratio: number; layer: number } | null;
  /** The least supported layer above the first, and its number; null with one layer. */
  support: { share: number; layer: number } | null;
  /** The longest run of consecutive layers with identical carton rectangles. */
  columns: { layers: number; from: number } | null;
}

/** The carton footprint of a layer: `a` along x and `b` along y for an unrotated block. */
function footprintOf(layer: Layer, c: CartonCandidate): [number, number] {
  const [fa, fb] = footprintAxes(layer.vertical);
  return [c.outer[fa], c.outer[fb]];
}

/**
 * Moves a layer's frame so its bounding box is centred on the origin (as placed). A layer
 * placed by hand stays in the usable footprint's frame, where its cartons really are: every
 * layer of a manual layout is manual, so its layers still share one frame.
 */
function centring(layer: Layer, a: number, b: number): { x: number; y: number } {
  if (layer.kind === 'manual') return { x: 0, y: 0 };
  const { min, size } = blocksBounds(layer.blocks, a, b);
  return { x: -min.x - size.x / 2, y: -min.y - size.y / 2 };
}

/** The rectangle each block covers, centred as placed. */
function blockRects(layer: Layer, c: CartonCandidate): Rect[] {
  const [a, b] = footprintOf(layer, c);
  const off = centring(layer, a, b);
  return layer.blocks.map((blk) => {
    const w = blk.cols * (blk.rotated ? b : a);
    const h = blk.rows * (blk.rotated ? a : b);
    return { x: blk.x + off.x, y: blk.y + off.y, w, h };
  });
}

function overlapArea(p: Rect, q: Rect): number {
  const w = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const h = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function sameFootprint(p: Layer, q: Layer, c: CartonCandidate): boolean {
  const [pa, pb] = footprintOf(p, c);
  const [qa, qb] = footprintOf(q, c);
  return pa === qa && pb === qb;
}

/**
 * Share (0..1) of `upper`'s carton base area that rests on cartons of `lower`, both layers of
 * `l` centred as placed. Cartons within a layer never overlap, so the area is a sum over
 * pairs of block rectangles.
 */
export function supportShare(upper: Layer, lower: Layer, l: Layout): number {
  if (upper.blocks === lower.blocks && sameFootprint(upper, lower, l.carton)) return 1;
  // A layer placed by hand has one block per carton, and a stack of them alternates between
  // two block lists: each pair is worked out once.
  const manual = upper.kind === 'manual' && lower.kind === 'manual';
  const sizes = manual
    ? [...footprintOf(upper, l.carton), ...footprintOf(lower, l.carton)].join('|')
    : '';
  if (manual) {
    const hit = manualShares.get(upper.blocks)?.get(lower.blocks);
    if (hit && hit.sizes === sizes) return hit.share;
  }
  const ups = blockRects(upper, l.carton);
  const downs = blockRects(lower, l.carton);
  let area = 0;
  let covered = 0;
  for (const u of ups) {
    area += u.w * u.h;
    for (const d of downs) covered += overlapArea(u, d);
  }
  const share = area > 0 ? Math.min(1, covered / area) : 1;
  if (manual) {
    let byLower = manualShares.get(upper.blocks);
    if (!byLower) manualShares.set(upper.blocks, (byLower = new WeakMap()));
    byLower.set(lower.blocks, { sizes, share });
  }
  return share;
}

/** Support shares of pairs of hand-placed block lists, with the carton footprints they hold for. */
const manualShares = new WeakMap<
  readonly Block[],
  WeakMap<readonly Block[], { sizes: string; share: number }>
>();

/** Rounded to a millionth of an inch, so equal positions give equal integers. */
const units = (v: number) => Math.round(v * 1e6);

/**
 * Every carton rectangle of a layer, centred as placed, as one canonical key that does not
 * depend on how the cartons are split into blocks: each block row is a run of equal cartons
 * along x; runs on the same line with the same carton size that touch are merged. The key has
 * one entry per merged run, not per carton, so it stays small on layers of thousands of
 * cartons. Cached per block list (layers of one pattern share their list).
 */
const rectKeys = new WeakMap<readonly Block[], { a: number; b: number; key: string }>();
function cartonRectsKey(layer: Layer, c: CartonCandidate): string {
  const [a, b] = footprintOf(layer, c);
  const hit = rectKeys.get(layer.blocks);
  if (hit && hit.a === a && hit.b === b) return hit.key;
  const off = centring(layer, a, b);
  // [y, w, h, x0, n]: n cartons of w x h side by side from x0 at height y.
  const runs: [number, number, number, number, number][] = [];
  for (const blk of layer.blocks) {
    const w = blk.rotated ? b : a;
    const h = blk.rotated ? a : b;
    for (let row = 0; row < blk.rows; row++) {
      runs.push([
        units(blk.y + off.y + row * h),
        units(w),
        units(h),
        units(blk.x + off.x),
        blk.cols,
      ]);
    }
  }
  runs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  const merged: typeof runs = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last[0] === r[0] &&
      last[1] === r[1] &&
      last[2] === r[2] &&
      Math.abs(last[3] + last[4] * last[1] - r[3]) <= last[4] + 1
    ) {
      last[4] += r[4];
    } else {
      merged.push([...r]);
    }
  }
  const key = merged.map((r) => r.join(',')).join(';');
  rectKeys.set(layer.blocks, { a, b, key });
  return key;
}

/** Sums of the carton centres' x and y, centred as placed: equal for equal carton sets. */
function centreSums(layer: Layer, c: CartonCandidate): { x: number; y: number } {
  const [a, b] = footprintOf(layer, c);
  const off = centring(layer, a, b);
  let x = 0;
  let y = 0;
  for (const blk of layer.blocks) {
    const w = blk.rotated ? b : a;
    const h = blk.rotated ? a : b;
    x += blk.rows * blk.cols * (blk.x + off.x + (blk.cols * w) / 2);
    y += blk.rows * blk.cols * (blk.y + off.y + (blk.rows * h) / 2);
  }
  return { x, y };
}

/** The blocks as centred rectangles with their grids, sorted: equal for equal block sets. */
function blocksKey(layer: Layer, c: CartonCandidate): string {
  const [a, b] = footprintOf(layer, c);
  const off = centring(layer, a, b);
  return layer.blocks
    .map(
      (blk) =>
        `${units(blk.x + off.x)},${units(blk.y + off.y)},${blk.cols}x${blk.rows}${blk.rotated ? 'r' : 'u'}`,
    )
    .sort()
    .join(';');
}

/** Whether two layers of the carton `c` put cartons in exactly the same places (as placed). */
export function sameCartonRects(p: Layer, q: Layer, c: CartonCandidate): boolean {
  if (p.cartonCount !== q.cartonCount) return false;
  const [pa, pb] = footprintOf(p, c);
  const [qa, qb] = footprintOf(q, c);
  if (Math.min(pa, pb) !== Math.min(qa, qb) || Math.max(pa, pb) !== Math.max(qa, qb)) return false;
  if (p.blocks === q.blocks && pa === qa) return true;
  // Cheap answers first: different centres of the cartons, or the very same blocks.
  const ps = centreSums(p, c);
  const qs = centreSums(q, c);
  const slack = 1e-6 * p.cartonCount;
  if (Math.abs(ps.x - qs.x) > slack || Math.abs(ps.y - qs.y) > slack) return false;
  if (p.blocks.length === q.blocks.length && blocksKey(p, c) === blocksKey(q, c)) return true;
  return cartonRectsKey(p, c) === cartonRectsKey(q, c);
}

/** Whether a layout was placed by hand: every layer of one is of kind 'manual'. */
function isManual(l: Layout): boolean {
  return l.layers[0]?.kind === 'manual';
}

/** Each carton of a layer placed by hand (one single-carton block per carton), as placed. */
function manualRects(layer: Layer, c: CartonCandidate): Rect[] {
  const [a, b] = footprintOf(layer, c);
  return layer.blocks.map((blk) => ({
    x: blk.x,
    y: blk.y,
    w: blk.rotated ? b : a,
    h: blk.rotated ? a : b,
  }));
}

/**
 * Whether two cartons stand together: their facing edges are at most `STABILITY.joinGap`
 * apart (or meet, or, in data changed by hand, overlap) and run alongside each other for a
 * stretch longer than the engine's tolerance. Facing at a corner only does not count: a
 * corner holds nothing up.
 */
function joined(p: Rect, q: Rect): boolean {
  const gap = STABILITY.joinGap + EPS;
  const alongX = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const alongY = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  return (alongX >= -gap && alongY > EPS) || (alongY >= -gap && alongX > EPS);
}

/**
 * The free-standing groups of a set of cartons: the bounding box of each set of cartons
 * standing together (see `joined`), directly or through others (connected components).
 */
export function freeStandingGroups(rects: readonly Rect[]): Rect[] {
  const parent = rects.map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]!]!;
      k = parent[k]!;
    }
    return k;
  };
  // Left to right, so a carton is only compared with those that start before it ends.
  const order = rects.map((_, k) => k).sort((p, q) => rects[p]!.x - rects[q]!.x);
  for (let n = 0; n < order.length; n++) {
    const p = rects[order[n]!]!;
    for (let m = n + 1; m < order.length; m++) {
      const q = rects[order[m]!]!;
      if (q.x > p.x + p.w + STABILITY.joinGap + EPS) break;
      if (joined(p, q)) parent[find(order[m]!)] = find(order[n]!);
    }
  }
  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  rects.forEach((r, k) => {
    const root = find(k);
    const box = boxes.get(root);
    if (!box) {
      boxes.set(root, { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
    } else {
      box.x0 = Math.min(box.x0, r.x);
      box.y0 = Math.min(box.y0, r.y);
      box.x1 = Math.max(box.x1, r.x + r.w);
      box.y1 = Math.max(box.y1, r.y + r.h);
    }
  });
  return [...boxes.values()].map((b) => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }));
}

/**
 * The pallet deck in the frame a layer placed by hand is in. That frame is the usable
 * footprint's (pallet plus allowed overhang, origin at its minimum corner), in which the
 * pallet is inset by half the allowed overhang on every side.
 */
function deckRect(i: Inputs): Rect {
  const inset = i.overhang / 2;
  return { x: inset, y: inset, w: i.pallet.length, h: i.pallet.width };
}

/**
 * The share of each carton's base on the deck: the least of them, and how many are under the
 * caution share. Null for no cartons.
 */
function deckShare(rects: readonly Rect[], deck: Rect): StabilityMeasures['deck'] | null {
  let share = Infinity;
  let cartons = 0;
  for (const r of rects) {
    const area = r.w * r.h;
    const s = area > 0 ? Math.min(1, overlapArea(r, deck) / area) : 1;
    if (s < share) share = s;
    if (s < STABILITY.deckShare.caution - TOLERANCE) cartons++;
  }
  return rects.length > 0 ? { share, cartons } : null;
}

/**
 * What the checks measure on `l`. Pure, and cheap enough to run on every candidate. The
 * inputs are only read for a layout placed by hand, to find the pallet deck under it: without
 * them the deck check is not made.
 */
export function measureStability(l: Layout, i?: Inputs): StabilityMeasures {
  const { layers, carton } = l;
  const bottom = layers[0];
  const stackHeight = layers.reduce((s, layer) => s + layer.height, 0);
  let base = bottom ? Math.min(bottom.extent.x, bottom.extent.y) : 0;
  const manual: Pick<StabilityMeasures, 'freeStandingGroups' | 'deck'> = {};
  if (bottom && isManual(l)) {
    const rects = manualRects(bottom, carton);
    const groups = freeStandingGroups(rects);
    manual.freeStandingGroups = groups.length;
    // One group is the whole layer: its extent, as for any layout. Several: the narrowest.
    if (groups.length > 1) base = Math.min(...groups.map((g) => Math.min(g.w, g.h)));
    const deck = i ? deckShare(rects, deckRect(i)) : null;
    if (deck) manual.deck = deck;
  }

  let cartonHeight: StabilityMeasures['cartonHeight'] = null;
  let support: StabilityMeasures['support'] = null;
  let columns: StabilityMeasures['columns'] = null;
  let run = 0;
  layers.forEach((layer, k) => {
    const [a, b] = footprintOf(layer, carton);
    const ratio = layer.height / Math.min(a, b);
    if (cartonHeight === null || ratio > cartonHeight.ratio) cartonHeight = { ratio, layer: k + 1 };
    const below = layers[k - 1];
    if (below) {
      const share = supportShare(layer, below, l);
      if (support === null || share < support.share) support = { share, layer: k + 1 };
    }
    run = below && sameCartonRects(layer, below, carton) ? run + 1 : 1;
    if (columns === null || run > columns.layers) columns = { layers: run, from: k + 2 - run };
  });
  return {
    stackHeightRatio: base > 0 ? stackHeight / base : 0,
    cartonHeight,
    support,
    columns,
    ...manual,
  };
}

/** Caution or serious when a ratio is strictly above its thresholds, else null. */
function above(value: number, t: { caution: number; serious: number }) {
  if (value > t.serious + TOLERANCE) return 'serious';
  if (value > t.caution + TOLERANCE) return 'caution';
  return null;
}

/** Caution or serious when a share is strictly below its thresholds, else null. */
function below(value: number, t: { caution: number; serious: number }) {
  if (value < t.serious - TOLERANCE) return 'serious';
  if (value < t.caution - TOLERANCE) return 'caution';
  return null;
}

/** The warnings of the measured checks, in check order. */
export function stabilityWarnings(m: StabilityMeasures): StabilityWarning[] {
  const out: StabilityWarning[] = [];
  const stack = above(m.stackHeightRatio, STABILITY.stackHeightRatio);
  if (stack) {
    out.push({
      check: 'stackHeight',
      level: stack,
      value: m.stackHeightRatio,
      ...((m.freeStandingGroups ?? 1) > 1 ? { freeStanding: true as const } : {}),
    });
  }
  if (m.cartonHeight) {
    const level = above(m.cartonHeight.ratio, STABILITY.cartonHeightRatio);
    if (level) {
      out.push({
        check: 'cartonHeight',
        level,
        value: m.cartonHeight.ratio,
        layer: m.cartonHeight.layer,
      });
    }
  }
  if (m.support) {
    const level = below(m.support.share, STABILITY.supportShare);
    if (level) {
      out.push({ check: 'support', level, value: m.support.share, layer: m.support.layer });
    }
  }
  if (m.columns && m.columns.layers >= STABILITY.columnLayers) {
    out.push({
      check: 'columns',
      level: 'caution',
      value: m.columns.layers,
      layer: m.columns.from,
    });
  }
  if (m.deck) {
    const level = below(m.deck.share, STABILITY.deckShare);
    if (level) out.push({ check: 'deck', level, value: m.deck.share, cartons: m.deck.cartons });
  }
  return out;
}

/** Good with no warnings, fair with cautions only, poor with any serious warning. */
export function ratingOf(warnings: readonly StabilityWarning[]): StabilityRating {
  if (warnings.some((w) => w.level === 'serious')) return 'poor';
  return warnings.length > 0 ? 'fair' : 'good';
}

/**
 * The layout's stability rating and warnings. The checks of a calculated layout work from the
 * layout alone (layers line up by their centres). A layout placed by hand needs the inputs
 * for the deck check: the pallet under it, and the allowed overhang its positions start from.
 */
export function assessStability(l: Layout, i?: Inputs): Stability {
  const warnings = stabilityWarnings(measureStability(l, i));
  return { rating: ratingOf(warnings), warnings };
}

/**
 * A ratio to one decimal, with more decimals (up to three) while the rounded value would not
 * show it is above the threshold it is over: 1.52 over 1.5 prints "1.52", not "1.5".
 */
function ratioText(value: number, threshold: number): string {
  let digits = 1;
  while (digits < 3 && Number(formatNumber(value, digits)) <= threshold) digits++;
  return formatNumber(value, digits);
}

/** A share as a whole percentage rounded down, so 0.8999 is "89", never the 90 it is under. */
function shareText(share: number): string {
  return String(Math.floor(share * 100 + TOLERANCE));
}

/** A warning as one plain sentence. */
export function describeWarning(w: StabilityWarning): string {
  switch (w.check) {
    case 'stackHeight': {
      const times = ratioText(w.value, STABILITY.stackHeightRatio[w.level]);
      return w.freeStanding
        ? `A free-standing column of the load is tall for its base (${times} times its shorter side).`
        : `Stack is tall for its base (${times} times its shorter side).`;
    }
    case 'cartonHeight':
      return `Cartons in layer ${w.layer ?? 1} stand on a narrow face (${ratioText(w.value, STABILITY.cartonHeightRatio[w.level])} times taller than their shorter side).`;
    case 'support':
      return `Layer ${w.layer ?? 2} is only ${shareText(w.value)}% supported by the layer below.`;
    case 'columns':
      return 'Layers are stacked in straight columns with no interlocking.';
    case 'deck': {
      const n = w.cartons ?? 1;
      if (w.value <= TOLERANCE) {
        return n === 1
          ? '1 carton in the bottom layer does not rest on the pallet at all.'
          : `${n} cartons in the bottom layer hang off the pallet; the worst does not rest on it at all.`;
      }
      return n === 1
        ? `1 carton in the bottom layer rests only ${shareText(w.value)}% on the pallet.`
        : `${n} cartons in the bottom layer hang off the pallet; the worst rests only ${shareText(w.value)}% on it.`;
    }
  }
}
