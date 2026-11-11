import { EPS } from '../../domain/constants';
import type { Block } from '../../domain/types';
import type { Rect } from './geometry';
import { fitsCount, fitsWithin } from './tolerance';

/**
 * Most loop iterations one pinwheel search may take. Past it the search stops and returns the
 * best pinwheel found so far, marked capped. Realistic cartons on a pallet take a few thousand.
 */
export const MAX_PINWHEEL_WORK = 2_000_000;

export interface PinwheelResult {
  count: number;
  /** Four blocks: bottom-left, bottom-right (turned), top-right, top-left (turned). */
  blocks: Block[];
  /** True when the search stopped at MAX_PINWHEEL_WORK, so a better pinwheel may exist. */
  capped: boolean;
}

/** Longest total of whole a and b lengths (any mix) that fits within `limit`. */
function longestRun(limit: number, a: number, b: number): number {
  const [big, small] = a >= b ? [a, b] : [b, a];
  let best = 0;
  for (let i = 0; fitsWithin(i * big, limit) && best < limit; i++) {
    best = Math.max(best, i * big + fitsCount(limit - i * big, small) * small);
  }
  return Math.min(best, limit);
}

/**
 * Most a x b cartons any layer of a rectX x rectY rectangle can hold, by area: every line
 * across the layer meets cartons whose sizes total no more than the longest run of a and b
 * lengths that fits, so the covered area is at most that run times the other side.
 */
export function layerCountBound(rectX: number, rectY: number, a: number, b: number): number {
  const area = Math.min(longestRun(rectX, a, b) * rectY, rectX * longestRun(rectY, a, b));
  return Math.floor(area / (a * b) + 1e-6);
}

/** Which edge of the rectangle a block is pushed against on one axis. */
type Anchor = 'min' | 'max';

/** Whether two rectangles overlap by more than EPS on both axes (touching is clear). */
function overlaps(p: Rect, q: Rect): boolean {
  return spans(p.x, p.x + p.w, q.x, q.w) && spans(p.y, p.y + p.h, q.y, q.h);
}

/** Whether the ranges [lo, hi) and [p, p + d) overlap by more than EPS. */
function spans(lo: number, hi: number, p: number, d: number): boolean {
  return Math.min(hi, p + d) - Math.max(lo, p) > EPS;
}

interface Corner {
  ax: Anchor;
  ay: Anchor;
  rotated: boolean;
}

// Going round the rectangle: B1 bottom-left, B2 bottom-right, B3 top-right, B4 top-left.
const B1: Corner = { ax: 'min', ay: 'min', rotated: false };
const B2: Corner = { ax: 'max', ay: 'min', rotated: true };
const B3: Corner = { ax: 'max', ay: 'max', rotated: false };
const B4: Corner = { ax: 'min', ay: 'max', rotated: true };

/**
 * Searches four-block pinwheels in a rectX x rectY rectangle. Each block sits in its corner;
 * the counts of one block's cartons along an axis are chosen as the brief describes, and every
 * candidate is checked against the blocks already placed with the EPS rectangle test.
 * The placed rectangles live in one typed array (x, y, w, h per block) so the inner loops
 * allocate nothing.
 */
class PinwheelSearch {
  work = 0;
  capped = false;
  best: { count: number; blocks: Block[] } | null = null;
  private readonly bound: number;
  /** x, y, w, h of B1, B2, B3 (the blocks placed before the one being sized). */
  private readonly placed = new Float64Array(12);

  constructor(
    private readonly rectX: number,
    private readonly rectY: number,
    private readonly a: number,
    private readonly b: number,
    /** Work already spent by an earlier search of the same call. */
    spent: number,
  ) {
    this.work = spent;
    // No layer holds more cartons than this: once a pinwheel reaches it, stop.
    this.bound = layerCountBound(rectX, rectY, a, b);
  }

  /** Counts one iteration; false (and capped) once the work cap is reached. */
  private tick(): boolean {
    if (++this.work > MAX_PINWHEEL_WORK) this.capped = true;
    return !this.capped;
  }

  /** Whether no better pinwheel can exist: one already holds the most any layer can. */
  reachedBound(): boolean {
    return this.best !== null && this.best.count >= this.bound;
  }

  private done(): boolean {
    return this.capped || this.reachedBound();
  }

  private dx(c: Corner): number {
    return c.rotated ? this.b : this.a;
  }

  private dy(c: Corner): number {
    return c.rotated ? this.a : this.b;
  }

  private x0(c: Corner, w: number): number {
    return c.ax === 'min' ? 0 : this.rectX - w;
  }

  private y0(c: Corner, h: number): number {
    return c.ay === 'min' ? 0 : this.rectY - h;
  }

  /** Stores block k (0-based) as placed, sized `cols` x `rows`. */
  private place(k: number, c: Corner, cols: number, rows: number): void {
    const w = cols * this.dx(c);
    const h = rows * this.dy(c);
    const p = this.placed;
    p[4 * k] = this.x0(c, w);
    p[4 * k + 1] = this.y0(c, h);
    p[4 * k + 2] = w;
    p[4 * k + 3] = h;
  }

  /** Whether the rectangle overlaps none of the first `n` placed blocks by more than EPS. */
  private clear(x: number, y: number, w: number, h: number, n: number): boolean {
    const p = this.placed;
    for (let k = 0; k < n; k++) {
      const px = p[4 * k] as number;
      const py = p[4 * k + 1] as number;
      if (
        spans(x, x + w, px, p[4 * k + 2] as number) &&
        spans(y, y + h, py, p[4 * k + 3] as number)
      ) {
        return false;
      }
    }
    return true;
  }

  /** Most columns block `c` can have with `rows` rows and clear the first `n` placed blocks. */
  private largestCols(c: Corner, rows: number, n: number): number {
    const dx = this.dx(c);
    const h = rows * this.dy(c);
    const y = this.y0(c, h);
    const p = this.placed;
    let space = this.rectX;
    for (let k = 0; k < n; k++) {
      if (!spans(y, y + h, p[4 * k + 1] as number, p[4 * k + 3] as number)) continue;
      const px = p[4 * k] as number;
      space = Math.min(space, c.ax === 'min' ? px : this.rectX - (px + (p[4 * k + 2] as number)));
    }
    let cols = fitsCount(space, dx);
    // One unit of work per check: the closed-form count above almost always clears at once.
    for (; cols > 0; cols--) {
      this.work++;
      if (this.clear(this.x0(c, cols * dx), y, cols * dx, h, n)) break;
    }
    return cols;
  }

  /** Most rows block `c` can have with `cols` columns and clear the first `n` placed blocks. */
  private largestRows(c: Corner, cols: number, n: number): number {
    const dy = this.dy(c);
    const w = cols * this.dx(c);
    const x = this.x0(c, w);
    const p = this.placed;
    let space = this.rectY;
    for (let k = 0; k < n; k++) {
      if (!spans(x, x + w, p[4 * k] as number, p[4 * k + 2] as number)) continue;
      const py = p[4 * k + 1] as number;
      space = Math.min(space, c.ay === 'min' ? py : this.rectY - (py + (p[4 * k + 3] as number)));
    }
    let rows = fitsCount(space, dy);
    for (; rows > 0; rows--) {
      this.work++;
      if (this.clear(x, this.y0(c, rows * dy), w, rows * dy, n)) break;
    }
    return rows;
  }

  private consider(sizes: readonly number[]): void {
    let count = 0;
    for (let k = 0; k < 4; k++) count += (sizes[2 * k] as number) * (sizes[2 * k + 1] as number);
    if (this.best !== null && count <= this.best.count) return;
    this.best = {
      count,
      blocks: [B1, B2, B3, B4].map((c, k) => {
        const cols = sizes[2 * k] as number;
        const rows = sizes[2 * k + 1] as number;
        return {
          x: this.x0(c, cols * this.dx(c)),
          y: this.y0(c, rows * this.dy(c)),
          cols,
          rows,
          rotated: c.rotated,
        };
      }),
    };
  }

  /** B4, the last block: most rows then most columns, and most columns then most rows. */
  private placeLast(c1: number, r1: number, c2: number, r2: number, c3: number, r3: number): void {
    const rowsFirst = this.largestRows(B4, 1, 3);
    const colsA = rowsFirst > 0 ? this.largestCols(B4, rowsFirst, 3) : 0;
    const colsFirst = this.largestCols(B4, 1, 3);
    const rowsB = colsFirst > 0 ? this.largestRows(B4, colsFirst, 3) : 0;
    const [c4, r4] =
      colsA * rowsFirst >= colsFirst * rowsB ? [colsA, rowsFirst] : [colsFirst, rowsB];
    if (c4 > 0 && r4 > 0) this.consider([c1, r1, c2, r2, c3, r3, c4, r4]);
  }

  run(): void {
    const { rectX, rectY, a, b } = this;
    // Each block shares an edge with the next one round, so it must leave room for at least
    // one carton of it: B1 for B2 (b wide) beside it and B4 (a tall) above it, B2 for B3.
    const maxC1 = fitsCount(rectX - b, a);
    const maxR1 = fitsCount(rectY - a, b);
    const maxR2 = fitsCount(rectY - b, a);
    const maxR3 = fitsCount(rectY, b);
    for (let c1 = 1; c1 <= maxC1; c1++) {
      for (let r1 = 1; r1 <= maxR1; r1++) {
        this.place(0, B1, c1, r1);
        for (let r2 = 1; r2 <= maxR2; r2++) {
          if (!this.tick()) return;
          const c2 = this.largestCols(B2, r2, 1);
          // A taller block only meets more of the placed ones: no wider one can follow.
          if (c2 === 0) break;
          this.place(1, B2, c2, r2);
          for (let r3 = 1; r3 <= maxR3; r3++) {
            if (!this.tick()) return;
            const c3 = this.largestCols(B3, r3, 2);
            if (c3 === 0) break;
            this.place(2, B3, c3, r3);
            this.placeLast(c1, r1, c2, r2, c3, r3);
            if (this.done()) return;
          }
        }
      }
    }
  }
}

/**
 * Pushes the right-hand blocks left, then the top blocks down, as far as they stay clear, so
 * the layer takes no more room than it needs (the placements centre it in the footprint).
 */
function compact(blocks: Block[], a: number, b: number): Block[] {
  // A block's whole rectangle, in the convention of blockCartonRects.
  const extent = (blk: Block): Rect => ({
    x: blk.x,
    y: blk.y,
    w: blk.cols * (blk.rotated ? b : a),
    h: blk.rows * (blk.rotated ? a : b),
  });
  const [b1, b2, b3, b4] = blocks as [Block, Block, Block, Block];
  // x: B2 and B3 move left by the smallest gap to a left block they share a row band with.
  let r = [b1, b2, b3, b4].map(extent) as [Rect, Rect, Rect, Rect];
  let slackX = Math.min(r[1].x, r[2].x);
  for (const left of [r[0], r[3]]) {
    for (const right of [r[1], r[2]]) {
      if (spans(left.y, left.y + left.h, right.y, right.h)) {
        slackX = Math.min(slackX, right.x - (left.x + left.w));
      }
    }
  }
  slackX = Math.max(0, slackX);
  const shiftedX = [b1, { ...b2, x: b2.x - slackX }, { ...b3, x: b3.x - slackX }, b4];
  r = shiftedX.map(extent) as [Rect, Rect, Rect, Rect];
  // y: B3 and B4 move down by the smallest gap to a bottom block they share a column band with.
  let slackY = Math.min(r[2].y, r[3].y);
  for (const bottom of [r[0], r[1]]) {
    for (const top of [r[2], r[3]]) {
      if (spans(bottom.x, bottom.x + bottom.w, top.x, top.w)) {
        slackY = Math.min(slackY, top.y - (bottom.y + bottom.h));
      }
    }
  }
  slackY = Math.max(0, slackY);
  const out = shiftedX.map((blk, k) => (k >= 2 ? { ...blk, y: blk.y - slackY } : blk));
  // Belt and braces: never return a compacted layer that is not clear.
  const rects = out.map(extent);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i] as Rect, rects[j] as Rect)) return blocks;
    }
  }
  return out;
}

/** Best four-block pinwheel of a×b cartons in a rectX×rectY rectangle, or null if none has 4 non-empty blocks. */
export function pinwheelLayer(
  rectX: number,
  rectY: number,
  a: number,
  b: number,
): PinwheelResult | null {
  const valid = [rectX, rectY, a, b].every((v) => Number.isFinite(v) && v > 0);
  if (!valid) return null;
  // A square footprint looks the same turned: a pinwheel of it is a plain grid at best.
  if (fitsWithin(a, b) && fitsWithin(b, a)) return null;
  // The corner order fixes which way the pinwheel turns, and the greedy block sizes are not
  // symmetric: search with B1 unturned, then with B1 turned (the footprint given the other way
  // round, blocks turned back), sharing one work cap. The first wins ties.
  const first = new PinwheelSearch(rectX, rectY, a, b, 0);
  first.run();
  const second = new PinwheelSearch(rectX, rectY, b, a, first.work);
  if (!first.capped && !first.reachedBound()) second.run();
  const capped = first.capped || second.capped;
  const candidates = [
    first.best && { count: first.best.count, blocks: first.best.blocks },
    second.best && {
      count: second.best.count,
      blocks: second.best.blocks.map((blk) => ({ ...blk, rotated: !blk.rotated })),
    },
  ];
  let best: { count: number; blocks: Block[] } | null = null;
  for (const c of candidates) if (c && (best === null || c.count > best.count)) best = c;
  if (best === null) return null;
  return { count: best.count, blocks: compact(best.blocks, a, b), capped };
}
