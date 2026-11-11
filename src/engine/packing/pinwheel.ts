import { EPS } from '../../domain/constants';
import type { Block } from '../../domain/types';
import type { Rect } from './geometry';
import { fitsCount, fitsWithin } from './tolerance';

/**
 * Most loop iterations one pinwheel search may take. Past it the search stops and returns the
 * best pinwheel found so far, marked capped. Realistic cartons on a pallet take a few thousand.
 */
export const MAX_PINWHEEL_WORK = 2_000_000;

/**
 * Pinwheel work one optimize() call may spend over all its layer searches. Counted in work
 * units, not time, so a result never depends on the machine's speed. A pinwheel that wins
 * on a realistic pallet costs a few thousand units, the most seen in testing about 130,000
 * (one unit is about 0.1 microsecond). Small products, with hundreds of footprints and many
 * cartons per layer, spend the rest, mostly without gaining; this keeps them within a few
 * percent of the time they took before pinwheels.
 */
export const PINWHEEL_WORK_PER_OPTIMIZE = 500_000;

/** Work units a series of pinwheel searches may still spend between them; searches take from it. */
export interface PinwheelAllowance {
  remaining: number;
}

export interface PinwheelOptions {
  /** Only a pinwheel of more than this many cartons is wanted; null when none is found. */
  beat?: number;
  /** Checked every PINWHEEL_STOP_CHECK work units: once true, the best found so far is returned. */
  shouldStop?: () => boolean;
  /** Shared work allowance: the search spends no more than what remains, and takes what it uses. */
  allowance?: PinwheelAllowance;
}

/** How many work units pass between two shouldStop checks. */
export const PINWHEEL_STOP_CHECK = 4096;

export interface PinwheelResult {
  count: number;
  /** Four blocks: bottom-left, bottom-right (turned), top-right, top-left (turned). */
  blocks: Block[];
  /**
   * True when the search was cut short (the work cap, the allowance or shouldStop), so a
   * better pinwheel may exist.
   */
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

  private nextStopCheck: number;

  constructor(
    private readonly rectX: number,
    private readonly rectY: number,
    private readonly a: number,
    private readonly b: number,
    /** Work already spent by an earlier search of the same call. */
    spent: number,
    /** Most work this search and the earlier ones of the same call may spend. */
    private readonly maxWork: number,
    /** Only pinwheels of more than this many cartons are worth keeping. */
    private readonly beat: number,
    private readonly shouldStop?: () => boolean,
  ) {
    this.work = spent;
    this.nextStopCheck = spent + PINWHEEL_STOP_CHECK;
    // No layer holds more cartons than this: once a pinwheel reaches it, stop.
    this.bound = layerCountBound(rectX, rectY, a, b);
  }

  /** Counts one iteration; false (and capped) once the work cap is reached or stop is asked. */
  private tick(): boolean {
    if (++this.work > this.maxWork) this.capped = true;
    if (!this.capped && this.work >= this.nextStopCheck) {
      this.nextStopCheck = this.work + PINWHEEL_STOP_CHECK;
      if (this.shouldStop?.()) this.capped = true;
    }
    return !this.capped;
  }

  /** The count a new pinwheel must exceed: the best so far, or the count to beat. */
  private floor(): number {
    return Math.max(this.beat, this.best?.count ?? 0);
  }

  /**
   * Whether a pinwheel can still exceed floor() when at least `waste` of the rectangle's
   * area is certainly left empty (every carton covers a x b of what remains).
   */
  private canBeat(waste: number): boolean {
    const most = Math.floor((this.rectX * this.rectY - waste) / (this.a * this.b) + 1e-6);
    return Math.min(most, this.bound) > this.floor();
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
    if (count <= this.floor()) return;
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
    // Four strips are certainly empty, one on each side, between the two blocks on that side
    // (no other block can reach into them, and they do not meet):
    // - left, above B1: B4 is a whole number of rows of `a`, so at least the remainder of
    //   (rectY - B1's height) over `a`, as wide as the narrower of B1 and one turned carton;
    // - bottom, between B1 and B2, as high as the lower of them;
    // - right, between B2 and B3, as wide as the narrower of them;
    // - top, left of B3: B4 is a whole number of columns of `b`, so at least the remainder of
    //   (rectX - B3's width) over `b`, as high as the lower of B3 and one turned carton.
    // A branch whose empty area already leaves no room to beat floor() is skipped.
    const p = this.placed;
    const remainder = (space: number, size: number) =>
      Math.max(0, space - fitsCount(space, size) * size);
    for (let c1 = 1; c1 <= maxC1; c1++) {
      for (let r1 = 1; r1 <= maxR1; r1++) {
        if (!this.tick()) return;
        this.place(0, B1, c1, r1);
        const [w1, h1] = [p[2] as number, p[3] as number];
        const left = remainder(rectY - h1, a) * Math.min(w1, b);
        if (!this.canBeat(left)) continue;
        for (let r2 = 1; r2 <= maxR2; r2++) {
          if (!this.tick()) return;
          const c2 = this.largestCols(B2, r2, 1);
          // A taller block only meets more of the placed ones: no wider one can follow.
          if (c2 === 0) break;
          this.place(1, B2, c2, r2);
          const [w2, h2] = [p[6] as number, p[7] as number];
          const bottom = Math.max(0, rectX - w1 - w2) * Math.min(h1, h2);
          // As r2 grows, B2 gets taller (min(h1, h2) cannot shrink) and c2 cannot grow (see
          // above), so B2 is never wider and the gap beside B1 never narrower: the bottom
          // strip never shrinks, and once it rules out beating floor() every taller B2 does too.
          if (!this.canBeat(left + bottom)) break;
          for (let r3 = 1; r3 <= maxR3; r3++) {
            if (!this.tick()) return;
            const c3 = this.largestCols(B3, r3, 2);
            if (c3 === 0) break;
            this.place(2, B3, c3, r3);
            const [w3, h3] = [p[10] as number, p[11] as number];
            const right = Math.max(0, rectY - h2 - h3) * Math.min(w2, w3);
            const top = remainder(rectX - w3, b) * Math.min(h3, a);
            if (!this.canBeat(left + bottom + right + top)) continue;
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

/**
 * Best four-block pinwheel of a×b cartons in a rectX×rectY rectangle, or null if none has 4
 * non-empty blocks (or none has more than `opts.beat` cartons).
 */
export function pinwheelLayer(
  rectX: number,
  rectY: number,
  a: number,
  b: number,
  opts: PinwheelOptions = {},
): PinwheelResult | null {
  const valid = [rectX, rectY, a, b].every((v) => Number.isFinite(v) && v > 0);
  if (!valid) return null;
  // A square footprint looks the same turned: a pinwheel of it is a plain grid at best.
  if (fitsWithin(a, b) && fitsWithin(b, a)) return null;
  const beat = opts.beat ?? 0;
  const maxWork = Math.max(0, Math.min(MAX_PINWHEEL_WORK, opts.allowance?.remaining ?? Infinity));
  // The corner order fixes which way the pinwheel turns, and the greedy block sizes are not
  // symmetric: search with B1 unturned, then with B1 turned (the footprint given the other way
  // round, blocks turned back), sharing one work cap. The second must beat the first.
  const first = new PinwheelSearch(rectX, rectY, a, b, 0, maxWork, beat, opts.shouldStop);
  first.run();
  const second = new PinwheelSearch(
    rectX,
    rectY,
    b,
    a,
    first.work,
    maxWork,
    Math.max(beat, first.best?.count ?? 0),
    opts.shouldStop,
  );
  if (!first.capped && !first.reachedBound()) second.run();
  if (opts.allowance)
    opts.allowance.remaining = Math.max(0, opts.allowance.remaining - second.work);
  const capped = first.capped || second.capped;
  const best = second.best
    ? {
        count: second.best.count,
        blocks: second.best.blocks.map((blk) => ({ ...blk, rotated: !blk.rotated })),
      }
    : first.best;
  if (best === null) return null;
  return { count: best.count, blocks: compact(best.blocks, a, b), capped };
}
