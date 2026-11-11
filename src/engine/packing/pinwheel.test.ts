import { describe, expect, it } from 'vitest';
import { searchLayer } from './layerSearch';
import { assertNoOverlapWithin, cartonRects } from './overlap.testSupport';
import { layerCountBound, MAX_PINWHEEL_WORK, pinwheelLayer } from './pinwheel';

/** A seeded linear congruential generator, so every run sees the same "random" cases. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * The pinned realistic case: a 16.5 x 10.5 in carton footprint on a 48 x 40 in pallet. The
 * best straight-cut layer holds 9 cartons; the pinwheel holds 10. Found by the search below.
 */
export const PINNED = { rectX: 48, rectY: 40, a: 16.5, b: 10.5, guillotine: 9, pinwheel: 10 };

describe('pinwheelLayer', () => {
  it('fits 4 cartons of 3 x 2 in a 5 x 5 square, where straight cuts fit 3', () => {
    expect(searchLayer(5, 5, 3, 2).count).toBe(3);
    const r = pinwheelLayer(5, 5, 3, 2);
    expect(r).not.toBeNull();
    expect(r!.count).toBe(4);
    expect(r!.capped).toBe(false);
    expect(r!.blocks).toHaveLength(4);
    assertNoOverlapWithin(r!.blocks, 3, 2, 5, 5);
  });

  it('goes round the four corners, turning every second block', () => {
    const r = pinwheelLayer(5, 5, 3, 2)!;
    expect(r.blocks.map((blk) => blk.rotated)).toEqual([false, true, false, true]);
    // Bottom-left, bottom-right, top-right, top-left of the bounding box, round a centre gap.
    const rects = cartonRects(r.blocks, 3, 2);
    expect(rects).toEqual([
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 3, y: 0, w: 2, h: 3 },
      { x: 2, y: 3, w: 3, h: 2 },
      { x: 0, y: 2, w: 2, h: 3 },
    ]);
  });

  it('beats straight cuts on a realistic pallet in inches (pinned regression case)', () => {
    // A small search: pallets 48 x 40 and 50 x 42, footprints 8 to 24 in in half-inch steps.
    const wins: string[] = [];
    for (const [rectX, rectY] of [
      [48, 40],
      [50, 42],
    ] as const) {
      for (let a = 8; a <= 24; a += 0.5) {
        for (let b = 8; b < a; b += 0.5) {
          const p = pinwheelLayer(rectX, rectY, a, b);
          if (p && p.count > searchLayer(rectX, rectY, a, b).count) {
            wins.push(`${rectX}x${rectY}:${a}x${b}`);
            assertNoOverlapWithin(p.blocks, a, b, rectX, rectY);
          }
        }
      }
    }
    expect(wins.length).toBeGreaterThan(0);
    expect(wins).toContain(`${PINNED.rectX}x${PINNED.rectY}:${PINNED.a}x${PINNED.b}`);

    const { rectX, rectY, a, b } = PINNED;
    expect(searchLayer(rectX, rectY, a, b).count).toBe(PINNED.guillotine);
    const r = pinwheelLayer(rectX, rectY, a, b)!;
    expect(r.count).toBe(PINNED.pinwheel);
    assertNoOverlapWithin(r.blocks, a, b, rectX, rectY);
    // The same layer with the footprint given the other way round.
    // 1 x 2, 3 x 1 turned, 1 x 2, 3 x 1 turned, round a 15 x 4.5 in gap.
    expect(r.blocks).toEqual([
      { x: 0, y: 0, cols: 1, rows: 2, rotated: false },
      { x: 16.5, y: 0, cols: 3, rows: 1, rotated: true },
      { x: 31.5, y: 16.5, cols: 1, rows: 2, rotated: false },
      { x: 0, y: 21, cols: 3, rows: 1, rotated: true },
    ]);
    const turned = pinwheelLayer(rectX, rectY, b, a)!;
    expect(turned.count).toBe(PINNED.pinwheel);
    assertNoOverlapWithin(turned.blocks, b, a, rectX, rectY);
  });

  it('gives valid layers whose count is the number of cartons, over 300 random cases', () => {
    const rnd = seeded(20261110);
    let found = 0;
    for (let k = 0; k < 300; k++) {
      const rectX = 2 + rnd() * 60;
      const rectY = 2 + rnd() * 60;
      const a = 0.5 + rnd() * 20;
      const b = 0.5 + rnd() * 20;
      const r = pinwheelLayer(rectX, rectY, a, b);
      // The bound bestLayer uses to skip the pinwheel search holds for both kinds of layer.
      expect(searchLayer(rectX, rectY, a, b).count).toBeLessThanOrEqual(
        layerCountBound(rectX, rectY, a, b),
      );
      if (r === null) continue;
      expect(r.count).toBeLessThanOrEqual(layerCountBound(rectX, rectY, a, b));
      found++;
      expect(r.blocks).toHaveLength(4);
      expect(r.blocks.every((blk) => blk.cols >= 1 && blk.rows >= 1)).toBe(true);
      expect(r.count).toBe(cartonRects(r.blocks, a, b).length);
      assertNoOverlapWithin(r.blocks, a, b, rectX, rectY);
    }
    expect(found).toBeGreaterThan(100);
  });

  it('gives valid layers for cartons that are whole multiples of each other', () => {
    for (const [rectX, rectY, a, b] of [
      [48, 40, 12, 6],
      [48, 40, 16, 8],
      [50, 42, 10, 5],
      [0.3, 0.3, 0.2, 0.1],
    ] as const) {
      const r = pinwheelLayer(rectX, rectY, a, b);
      if (r) assertNoOverlapWithin(r.blocks, a, b, rectX, rectY);
    }
  });

  it('bounds any layer by the longest run of carton sides that fits each way', () => {
    // 5 = 3 + 2 both ways: at most 25 / 6, so 4.
    expect(layerCountBound(5, 5, 3, 2)).toBe(4);
    // 7 holds 3 + 2 + 2 = 7, but 4.5 holds only 4 (2 + 2): at most 7 x 4 / 6, so 4.
    expect(layerCountBound(7, 4.5, 3, 2)).toBe(4);
    expect(layerCountBound(48, 40, 16.5, 10.5)).toBe(10);
  });

  it('returns null for a square footprint', () => {
    expect(pinwheelLayer(48, 40, 10, 10)).toBeNull();
    expect(pinwheelLayer(48, 40, 10, 10 + 1e-12)).toBeNull();
  });

  it('returns null when the rectangle cannot hold four blocks', () => {
    expect(pinwheelLayer(4, 4, 3, 2)).toBeNull();
    expect(pinwheelLayer(3, 2, 3, 2)).toBeNull();
    expect(pinwheelLayer(10, 1, 3, 2)).toBeNull();
    expect(pinwheelLayer(0, 0, 3, 2)).toBeNull();
    expect(pinwheelLayer(Number.NaN, 5, 3, 2)).toBeNull();
    expect(pinwheelLayer(5, 5, 0, 2)).toBeNull();
  });

  it('keeps a huge case quick: stops at the work cap with a valid layer', () => {
    const t0 = performance.now();
    const r = pinwheelLayer(500, 500, 3, 2);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
    expect(r).not.toBeNull();
    expect(typeof r!.capped).toBe('boolean');
    expect(r!.count).toBe(cartonRects(r!.blocks, 3, 2).length);
    assertNoOverlapWithin(r!.blocks, 3, 2, 500, 500);
    expect(MAX_PINWHEEL_WORK).toBe(2_000_000);
  });
});
