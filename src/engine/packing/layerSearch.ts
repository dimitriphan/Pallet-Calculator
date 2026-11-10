import type { Block } from '../../domain/types';
import { fitsCount, fitsWithin } from './tolerance';

/** Above this many (normalX x normalY) rectangle sizes, the full search is replaced by a single-cut fallback. */
export const MAX_LAYER_STATES = 40000;

export interface LayerSearchResult {
  count: number;
  blocks: Block[];
}

/** Plain single-grid fill. rotated=false puts `a` along x. Returns count 0 and no blocks if nothing fits. */
export function gridLayer(
  rectX: number,
  rectY: number,
  a: number,
  b: number,
  rotated: boolean,
): LayerSearchResult {
  const cols = fitsCount(rectX, rotated ? b : a);
  const rows = fitsCount(rectY, rotated ? a : b);
  if (cols <= 0 || rows <= 0) return { count: 0, blocks: [] };
  return { count: cols * rows, blocks: [{ x: 0, y: 0, cols, rows, rotated }] };
}

/**
 * Sorted distinct values i*a + j*b (i, j >= 0, not both 0) that fit within `limit`.
 * Values closer than EPS to the previous kept value are treated as the same value.
 */
function normalPatterns(limit: number, a: number, b: number): number[] {
  const raw: number[] = [];
  for (let i = 0; fitsWithin(i * a, limit); i++) {
    for (let j = 0; fitsWithin(i * a + j * b, limit); j++) {
      if (i > 0 || j > 0) raw.push(i * a + j * b);
    }
  }
  raw.sort((p, q) => p - q);
  const out: number[] = [];
  for (const v of raw) {
    const last = out[out.length - 1];
    if (last === undefined || !fitsWithin(v, last)) out.push(v);
  }
  return out;
}

/** Index of the largest normal value <= v + EPS, or -1 (meaning size 0) if none. */
function snapIndex(v: number, normals: number[]): number {
  let lo = 0;
  let hi = normals.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fitsWithin(normals[mid] as number, v)) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function betterGrid(w: number, h: number, a: number, b: number): LayerSearchResult {
  const plain = gridLayer(w, h, a, b, false);
  const rotated = gridLayer(w, h, a, b, true);
  return rotated.count > plain.count ? rotated : plain;
}

function offsetBlocks(blocks: Block[], dx: number, dy: number): Block[] {
  return blocks.map((blk) => ({ ...blk, x: blk.x + dx, y: blk.y + dy }));
}

const GRID_PLAIN = 0;
const GRID_ROTATED = 1;
const CUT_X = 2;
const CUT_Y = 3;

/** Best guillotine arrangement of a x b rectangles (either flat rotation) in a rectX x rectY rectangle. */
export function searchLayer(rectX: number, rectY: number, a: number, b: number): LayerSearchResult {
  const valid = [rectX, rectY, a, b].every((v) => Number.isFinite(v) && v > 0);
  if (!valid) return { count: 0, blocks: [] };

  const normalX = normalPatterns(rectX, a, b);
  const normalY = normalPatterns(rectY, a, b);
  const nx = normalX.length;
  const ny = normalY.length;
  if (nx === 0 || ny === 0) return { count: 0, blocks: [] };

  if (nx * ny > MAX_LAYER_STATES) return singleCutFallback(normalX, normalY, a, b);

  // Bottom-up dynamic programming over every snapped size (normalX[ix], normalY[iy]).
  // Every sub-rectangle of a cut has a strictly smaller index on the cut axis, so
  // ascending (ix, iy) order sees each dependency before it is needed. No recursion.
  const count = new Int32Array(nx * ny);
  const choice = new Uint8Array(nx * ny);
  const cutAt = new Int32Array(nx * ny); // index of the cut position in normalX / normalY
  const at = (ix: number, iy: number): number =>
    ix < 0 || iy < 0 ? 0 : (count[ix * ny + iy] as number);

  for (let ix = 0; ix < nx; ix++) {
    const w = normalX[ix] as number;
    for (let iy = 0; iy < ny; iy++) {
      const h = normalY[iy] as number;
      let best = gridLayer(w, h, a, b, false).count;
      let kind = GRID_PLAIN;
      let cut = -1;
      const rotated = gridLayer(w, h, a, b, true).count;
      if (rotated > best) {
        best = rotated;
        kind = GRID_ROTATED;
      }
      for (let k = 0; k < ix && fitsWithin(normalX[k] as number, w / 2); k++) {
        const total = at(k, iy) + at(snapIndex(w - (normalX[k] as number), normalX), iy);
        if (total > best) {
          best = total;
          kind = CUT_X;
          cut = k;
        }
      }
      for (let k = 0; k < iy && fitsWithin(normalY[k] as number, h / 2); k++) {
        const total = at(ix, k) + at(ix, snapIndex(h - (normalY[k] as number), normalY));
        if (total > best) {
          best = total;
          kind = CUT_Y;
          cut = k;
        }
      }
      const s = ix * ny + iy;
      count[s] = best;
      choice[s] = kind;
      cutAt[s] = cut;
    }
  }

  // Reconstruct blocks by walking the chosen cuts with an explicit stack, carrying the offset.
  const blocks: Block[] = [];
  const stack: Array<[ix: number, iy: number, ox: number, oy: number]> = [[nx - 1, ny - 1, 0, 0]];
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const [ix, iy, ox, oy] = item;
    if (ix < 0 || iy < 0) continue;
    const s = ix * ny + iy;
    if (count[s] === 0) continue;
    const w = normalX[ix] as number;
    const h = normalY[iy] as number;
    const kind = choice[s];
    const k = cutAt[s] as number;
    if (kind === CUT_X) {
      const p = normalX[k] as number;
      // Push the far side first so the near side's blocks come out first.
      stack.push([snapIndex(w - p, normalX), iy, ox + p, oy]);
      stack.push([k, iy, ox, oy]);
    } else if (kind === CUT_Y) {
      const q = normalY[k] as number;
      stack.push([ix, snapIndex(h - q, normalY), ox, oy + q]);
      stack.push([ix, k, ox, oy]);
    } else {
      blocks.push(...offsetBlocks(gridLayer(w, h, a, b, kind === GRID_ROTATED).blocks, ox, oy));
    }
  }
  return { count: count[(nx - 1) * ny + (ny - 1)] as number, blocks };
}

/** Best of both plain grids and every single cut with each side filled by its better plain grid. */
function singleCutFallback(
  normalX: number[],
  normalY: number[],
  a: number,
  b: number,
): LayerSearchResult {
  const w = normalX[normalX.length - 1] as number;
  const h = normalY[normalY.length - 1] as number;
  let best = betterGrid(w, h, a, b);
  for (const p of normalX) {
    if (fitsWithin(w, p)) break; // p >= w: nothing left on the far side
    const near = betterGrid(p, h, a, b);
    const far = betterGrid(w - p, h, a, b);
    if (near.count + far.count > best.count) {
      best = {
        count: near.count + far.count,
        blocks: [...near.blocks, ...offsetBlocks(far.blocks, p, 0)],
      };
    }
  }
  for (const q of normalY) {
    if (fitsWithin(h, q)) break;
    const near = betterGrid(w, q, a, b);
    const far = betterGrid(w, h - q, a, b);
    if (near.count + far.count > best.count) {
      best = {
        count: near.count + far.count,
        blocks: [...near.blocks, ...offsetBlocks(far.blocks, 0, q)],
      };
    }
  }
  return best;
}
