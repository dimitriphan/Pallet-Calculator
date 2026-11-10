import { describe, expect, it } from 'vitest';
import { EPS } from '../../domain/constants';
import { gridLayer, MAX_LAYER_STATES, searchLayer, type LayerSearchResult } from './layerSearch';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Every carton of a result as an absolute rectangle. */
function expandBlocks(result: LayerSearchResult, a: number, b: number): Rect[] {
  const rects: Rect[] = [];
  for (const blk of result.blocks) {
    const dx = blk.rotated ? b : a;
    const dy = blk.rotated ? a : b;
    for (let i = 0; i < blk.cols; i++) {
      for (let j = 0; j < blk.rows; j++) {
        const x0 = blk.x + i * dx;
        const y0 = blk.y + j * dy;
        rects.push({ x0, y0, x1: x0 + dx, y1: y0 + dy });
      }
    }
  }
  return rects;
}

/** Each block's whole footprint as one rectangle (cheap check for very large results). */
function blockRects(result: LayerSearchResult, a: number, b: number): Rect[] {
  return result.blocks.map((blk) => {
    const dx = blk.rotated ? b : a;
    const dy = blk.rotated ? a : b;
    return { x0: blk.x, y0: blk.y, x1: blk.x + blk.cols * dx, y1: blk.y + blk.rows * dy };
  });
}

/** Number of rectangle pairs overlapping by more than EPS in both axes (sweep along x). */
function overlappingPairs(rects: Rect[]): number {
  const sorted = [...rects].sort((p, q) => p.x0 - q.x0 || p.y0 - q.y0);
  let pairs = 0;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as Rect;
    for (let k = i + 1; k < sorted.length; k++) {
      const q = sorted[k] as Rect;
      if (q.x0 >= p.x1 - EPS) break;
      const overlapX = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
      const overlapY = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
      if (overlapX > EPS && overlapY > EPS) pairs++;
    }
  }
  return pairs;
}

function outsideCount(rects: Rect[], rectX: number, rectY: number): number {
  return rects.filter((r) => r.x0 < -EPS || r.y0 < -EPS || r.x1 > rectX + EPS || r.y1 > rectY + EPS)
    .length;
}

function expectValid(
  result: LayerSearchResult,
  rectX: number,
  rectY: number,
  a: number,
  b: number,
  cartonLevel = true,
): void {
  const sum = result.blocks.reduce((s, blk) => s + blk.cols * blk.rows, 0);
  expect(sum).toBe(result.count);
  for (const blk of result.blocks) {
    expect(Number.isInteger(blk.cols) && blk.cols > 0).toBe(true);
    expect(Number.isInteger(blk.rows) && blk.rows > 0).toBe(true);
  }
  const rects = cartonLevel ? expandBlocks(result, a, b) : blockRects(result, a, b);
  expect(outsideCount(rects, rectX, rectY)).toBe(0);
  expect(overlappingPairs(rects)).toBe(0);
  expect(result.count).toBeGreaterThanOrEqual(gridLayer(rectX, rectY, a, b, false).count);
  expect(result.count).toBeGreaterThanOrEqual(gridLayer(rectX, rectY, a, b, true).count);
}

/**
 * Reference guillotine optimum for integer sizes: dynamic programming over every
 * integer rectangle, trying every integer cut position (no snapping, no normal patterns).
 */
function bruteForceTable(maxX: number, maxY: number, a: number, b: number): number[][] {
  const t: number[][] = [];
  for (let w = 0; w <= maxX; w++) {
    const row: number[] = [];
    t.push(row);
    for (let h = 0; h <= maxY; h++) {
      let best = Math.max(
        Math.floor(w / a) * Math.floor(h / b),
        Math.floor(w / b) * Math.floor(h / a),
      );
      for (let x = 1; x < w; x++) best = Math.max(best, (t[x]?.[h] ?? 0) + (t[w - x]?.[h] ?? 0));
      for (let y = 1; y < h; y++) best = Math.max(best, (row[y] ?? 0) + (row[h - y] ?? 0));
      row.push(best);
    }
  }
  return t;
}

describe('gridLayer', () => {
  it('fills a single grid in the requested rotation', () => {
    expect(gridLayer(10, 7, 5, 2, false).count).toBe(6);
    expect(gridLayer(10, 7, 5, 2, true).count).toBe(5);
    expect(gridLayer(10, 7, 5, 2, false).blocks).toEqual([
      { x: 0, y: 0, cols: 2, rows: 3, rotated: false },
    ]);
    expect(gridLayer(10, 7, 5, 2, true).blocks).toEqual([
      { x: 0, y: 0, cols: 5, rows: 1, rotated: true },
    ]);
  });
  it('returns nothing when no carton fits', () => {
    expect(gridLayer(4, 4, 5, 5, false)).toEqual({ count: 0, blocks: [] });
    expect(gridLayer(10, 4, 5, 5, true)).toEqual({ count: 0, blocks: [] });
  });
});

describe('searchLayer', () => {
  it('exposes the state limit', () => {
    expect(MAX_LAYER_STATES).toBe(40000);
  });

  it('finds the known optima', () => {
    expect(searchLayer(10, 10, 5, 5).count).toBe(4);
    expect(searchLayer(10, 7, 5, 2).count).toBe(7); // area bound 70/10; best plain grid is 6
    expect(searchLayer(4, 4, 5, 5)).toEqual({ count: 0, blocks: [] });
    // area bound floor(2288 / 221) = 10; plain grids give 8 and 9
    expect(searchLayer(52, 44, 13, 17).count).toBe(10);
  });

  it('tolerates floating-point noise', () => {
    expect(searchLayer(0.3, 0.1, 0.1, 0.1).count).toBe(3);
    expect(searchLayer(0.7, 0.3, 0.1, 0.2).count).toBe(10);
  });

  it('returns nothing for degenerate inputs', () => {
    expect(searchLayer(0, 10, 1, 1)).toEqual({ count: 0, blocks: [] });
    expect(searchLayer(10, 10, 0, 1)).toEqual({ count: 0, blocks: [] });
    expect(searchLayer(10, 10, 1, -1)).toEqual({ count: 0, blocks: [] });
  });

  it('is deterministic', () => {
    expect(searchLayer(52, 44, 13, 17)).toEqual(searchLayer(52, 44, 13, 17));
    expect(searchLayer(50, 42, 7.5, 5.25)).toEqual(searchLayer(50, 42, 7.5, 5.25));
  });

  it.each([
    [52, 44, 13, 17],
    [52, 44, 21, 13],
    [48, 40, 9, 5],
    [50, 42, 7.5, 5.25],
    [50, 42, 13, 17],
    [48, 40, 11.75, 9.25],
    [40, 48, 6.3, 4.1],
    [10, 7, 5, 2],
  ])('produces a valid arrangement for %s x %s with %s x %s cartons', (rx, ry, a, b) => {
    const r = searchLayer(rx, ry, a, b);
    expect(r.count).toBeGreaterThan(0);
    expectValid(r, rx, ry, a, b);
  });

  const sizes = [1, 2, 3, 4, 5];
  const pairs = sizes.flatMap((a) => sizes.map((b) => [a, b] as const));
  it.each(pairs)('matches the brute-force guillotine optimum for %s x %s cartons', (a, b) => {
    const table = bruteForceTable(12, 12, a, b);
    for (let w = 1; w <= 12; w++) {
      for (let h = 1; h <= 12; h++) {
        const expected = table[w]?.[h];
        const r = searchLayer(w, h, a, b);
        expect({ w, h, count: r.count }).toEqual({ w, h, count: expected });
        expectValid(r, w, h, a, b);
        // Same case scaled by 0.1: every sum now carries floating-point noise.
        const scaled = searchLayer(w * 0.1, h * 0.1, a * 0.1, b * 0.1);
        expect({ w, h, scaled: scaled.count }).toEqual({ w, h, scaled: expected });
      }
    }
  });

  it('falls back quickly and validly when the state space is too large', () => {
    const t = performance.now();
    const r = searchLayer(480, 400, 1.1, 0.7);
    expect(performance.now() - t).toBeLessThan(1500);
    expect(r.count).toBeGreaterThan(0);
    expectValid(r, 480, 400, 1.1, 0.7, false);
  });

  it('keeps the fallback arrangement valid carton by carton', () => {
    const r = searchLayer(40, 30, 1.1, 0.7); // far more than MAX_LAYER_STATES normal-pattern pairs
    expectValid(r, 40, 30, 1.1, 0.7);
  });

  it('uses a single cut in the fallback when it beats both grids', () => {
    // Too many states for the full search. The rotated grid gives 85 x 28 = 2380; cutting at
    // y = 27.5 gives 85 x 25 rotated below plus 54 x 5 unrotated above = 2395.
    const r = searchLayer(60, 31, 1.1, 0.7);
    expect(r.count).toBeGreaterThanOrEqual(2395);
    const grid = Math.max(
      gridLayer(60, 31, 1.1, 0.7, false).count,
      gridLayer(60, 31, 1.1, 0.7, true).count,
    );
    expect(r.count).toBeGreaterThan(grid);
    expectValid(r, 60, 31, 1.1, 0.7);
  });
});
