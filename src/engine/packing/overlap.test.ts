import { describe, expect, it } from 'vitest';
import { assertNoOverlapWithin, cartonRects } from './overlap.testSupport';

describe('overlap verifier', () => {
  it('lists carton rectangles block by block, row by row, rotated blocks turned', () => {
    expect(
      cartonRects(
        [
          { x: 0, y: 0, cols: 2, rows: 1, rotated: false },
          { x: 6, y: 0, cols: 1, rows: 2, rotated: true },
        ],
        3,
        2,
      ),
    ).toEqual([
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 3, y: 0, w: 3, h: 2 },
      { x: 6, y: 0, w: 2, h: 3 },
      { x: 6, y: 3, w: 2, h: 3 },
    ]);
  });

  it('throws for two overlapping blocks, naming the pair', () => {
    const blocks = [
      { x: 0, y: 0, cols: 2, rows: 1, rotated: false },
      { x: 5, y: 1, cols: 1, rows: 1, rotated: true },
    ];
    expect(() => assertNoOverlapWithin(blocks, 3, 2, 20, 20)).toThrow(
      /cartons 1 .* and 2 .* overlap/,
    );
  });

  it('passes touching blocks', () => {
    const blocks = [
      { x: 0, y: 0, cols: 2, rows: 1, rotated: false },
      { x: 6, y: 0, cols: 1, rows: 1, rotated: true },
      { x: 0, y: 2, cols: 2, rows: 1, rotated: false },
    ];
    expect(() => assertNoOverlapWithin(blocks, 3, 2, 8, 4)).not.toThrow();
  });

  it('passes cartons that touch only within floating-point error', () => {
    const blocks = [
      { x: 0, y: 0, cols: 3, rows: 1, rotated: false },
      { x: 0.1 * 3, y: 0, cols: 1, rows: 1, rotated: false },
    ];
    expect(() => assertNoOverlapWithin(blocks, 0.1, 1, 0.4, 1)).not.toThrow();
  });

  it('throws for a block outside the rectangle', () => {
    const blocks = [{ x: 4, y: 0, cols: 2, rows: 1, rotated: false }];
    expect(() => assertNoOverlapWithin(blocks, 3, 2, 9, 2)).toThrow(/outside the 9 x 2/);
    expect(() =>
      assertNoOverlapWithin([{ x: -1, y: 0, cols: 1, rows: 1, rotated: false }], 3, 2, 9, 2),
    ).toThrow(/outside/);
  });
});
