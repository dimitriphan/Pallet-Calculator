/**
 * Test-only overlap verifier for layers: every carton rectangle of a block list must lie
 * inside the layer's rectangle and no two may overlap by more than EPS. Not used by
 * application code; the rectangle convention itself lives in geometry.ts.
 */
import { EPS } from '../../domain/constants';
import type { Block } from '../../domain/types';
import { blockCartonRects, type Rect } from './geometry';

/** The carton rectangles of a layer's blocks (the convention the placements use). */
export function cartonRects(blocks: Block[], a: number, b: number): Rect[] {
  return blockCartonRects(blocks, a, b);
}

function overlaps(p: Rect, q: Rect): boolean {
  return (
    Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > EPS &&
    Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > EPS
  );
}

function show(r: Rect): string {
  return `(${r.x}, ${r.y}) ${r.w} x ${r.h}`;
}

/**
 * Throws, naming the offending carton (or pair), when a carton of the blocks lies outside
 * the rectX x rectY rectangle at the origin or two cartons overlap. EPS tolerant: touching
 * cartons pass.
 */
export function assertNoOverlapWithin(
  blocks: Block[],
  a: number,
  b: number,
  rectX: number,
  rectY: number,
): void {
  const rects = cartonRects(blocks, a, b);
  rects.forEach((r, k) => {
    if (r.x < -EPS || r.y < -EPS || r.x + r.w > rectX + EPS || r.y + r.h > rectY + EPS) {
      throw new Error(`carton ${k} ${show(r)} lies outside the ${rectX} x ${rectY} rectangle`);
    }
  });
  // Sweep along x: each rectangle is compared only with later ones that start before its end.
  const order = rects.map((_, k) => k).sort((p, q) => (rects[p] as Rect).x - (rects[q] as Rect).x);
  for (let i = 0; i < order.length; i++) {
    const pk = order[i] as number;
    const p = rects[pk] as Rect;
    for (let j = i + 1; j < order.length; j++) {
      const qk = order[j] as number;
      const q = rects[qk] as Rect;
      if (q.x >= p.x + p.w - EPS) break;
      if (overlaps(p, q)) {
        throw new Error(`cartons ${pk} ${show(p)} and ${qk} ${show(q)} overlap`);
      }
    }
  }
}

/**
 * A straight line right across the layer that passes through no carton, or null when every
 * such line meets one: the check a true pinwheel must pass. Works on the carton rectangles
 * alone (never on blocks), so it can judge the engine's own block-based check. A line counts
 * only strictly inside the cartons' bounding box; `axis` 'x' is the line x = at.
 */
export function lineMissingEveryCarton(
  blocks: Block[],
  a: number,
  b: number,
): { axis: 'x' | 'y'; at: number } | null {
  return lineMissingEveryRect(cartonRects(blocks, a, b));
}

/** The same for any list of rectangles. */
export function lineMissingEveryRect(rects: Rect[]): { axis: 'x' | 'y'; at: number } | null {
  for (const axis of ['x', 'y'] as const) {
    const spans = rects.map((r) => (axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.h]));
    const lo = Math.min(...spans.map((s) => s[0] as number));
    const hi = Math.max(...spans.map((s) => s[1] as number));
    // Only a line along some carton's edge can miss them all.
    // (Each distinct edge once: a layer of thousands of cartons has only a few dozen.)
    const edges = [...new Set(spans.flat().map((v) => Math.round(v / EPS) * EPS))];
    for (const at of edges) {
      if (at <= lo + EPS || at >= hi - EPS) continue;
      const met = spans.some((s) => (s[0] as number) < at - EPS && (s[1] as number) > at + EPS);
      if (!met) return { axis, at };
    }
  }
  return null;
}
