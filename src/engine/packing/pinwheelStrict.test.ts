import { describe, expect, it } from 'vitest';
import type { Block } from '../../domain/types';
import { searchLayer } from './layerSearch';
import { assertNoOverlapWithin } from './overlap.testSupport';
import { hasThroughCut, pinwheelLayer, type PinwheelAllowance } from './pinwheel';

/** A seeded linear congruential generator, so every run sees the same "random" cases. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 0x100000000;
  };
}

const block = (x: number, y: number, cols: number, rows: number, rotated = false): Block => ({
  x,
  y,
  cols,
  rows,
  rotated,
});

describe('hasThroughCut', () => {
  it('finds none in the classic pinwheel of four cartons round a hole', () => {
    // 3 x 2 cartons in a 5 x 5 square, a 1 x 1 hole in the middle.
    const blocks = [
      block(0, 0, 1, 1),
      block(3, 0, 1, 1, true),
      block(2, 3, 1, 1),
      block(0, 2, 1, 1, true),
    ];
    expect(hasThroughCut(blocks, 3, 2)).toBe(false);
  });

  it('finds the cut between two pairs of blocks side by side', () => {
    // Left column 3 wide (an unturned block under a turned pair), right column the same.
    const blocks = [block(0, 0, 1, 1), block(3, 0, 1, 1), block(3, 2, 1, 1), block(0, 2, 1, 1)];
    expect(hasThroughCut(blocks, 3, 2)).toBe(true);
  });

  it('finds a cut along y as well as along x', () => {
    const blocks = [
      block(0, 0, 2, 1),
      block(6, 0, 1, 1, true),
      block(4, 3, 2, 1),
      block(0, 3, 1, 1, true),
    ];
    // Bottom row is 2 high on the left and 3 high on the right: the line y = 3 crosses nothing.
    expect(hasThroughCut(blocks, 3, 2)).toBe(true);
  });

  it('does not count the outer edges of the layer as cuts', () => {
    expect(hasThroughCut([block(0, 0, 2, 2)], 3, 2)).toBe(false);
  });
});

describe('pinwheelLayer, strict', () => {
  it('still finds the classic pinwheel', () => {
    const r = pinwheelLayer(5, 5, 3, 2, { strict: true })!;
    expect(r.count).toBe(4);
    expect(hasThroughCut(r.blocks, 3, 2)).toBe(false);
  });

  it('turns down four blocks that straight cuts build as well, for a narrower true pinwheel', () => {
    // 7 x 5: the plain search fills it with 5 cartons in four blocks that a straight cut
    // divides; the true pinwheel is the classic one of 4, found only with a narrower block.
    const plain = pinwheelLayer(7, 5, 3, 2)!;
    expect(plain.count).toBe(5);
    expect(hasThroughCut(plain.blocks, 3, 2)).toBe(true);
    const strict = pinwheelLayer(7, 5, 3, 2, { strict: true })!;
    expect(strict.count).toBe(4);
    expect(hasThroughCut(strict.blocks, 3, 2)).toBe(false);
    assertNoOverlapWithin(strict.blocks, 3, 2, 7, 5);
    // 6 x 4 has room for no pinwheel at all.
    expect(pinwheelLayer(6, 4, 3, 2, { strict: true })).toBeNull();
  });

  it('gives the same pinwheel as the plain search when that one beats straight cuts', () => {
    const beat = searchLayer(48, 40, 16.5, 10.5).count;
    expect(pinwheelLayer(48, 40, 16.5, 10.5, { beat, strict: true })).toEqual(
      pinwheelLayer(48, 40, 16.5, 10.5, { beat }),
    );
  });

  it('records on the allowance that a search was cut short', () => {
    const allowance: PinwheelAllowance = { remaining: 5000 };
    pinwheelLayer(500, 500, 3, 2, { allowance, strict: true });
    expect(allowance).toEqual({ remaining: 0, capped: true });
    const plenty: PinwheelAllowance = { remaining: 1e9 };
    pinwheelLayer(48, 40, 16.5, 10.5, { allowance: plenty, strict: true });
    expect(plenty.capped).toBeUndefined();
  });

  it('random footprints: ties and smaller pinwheels are true pinwheels and never overlap', () => {
    const rnd = seeded(20261112);
    let ties = 0;
    let fewer = 0;
    for (let n = 0; n < 400; n++) {
      const rectX = 20 + Math.floor(rnd() * 41);
      const rectY = 20 + Math.floor(rnd() * 31);
      const a = 3 + Math.floor(rnd() * 31) / 2;
      const b = 2 + Math.floor(rnd() * 21) / 2;
      const straight = searchLayer(rectX, rectY, a, b).count;
      if (straight === 0) continue;
      // What Prefer pinwheel asks for (at least the straight-cut count) and Pinwheel only (any).
      for (const beat of [straight - 1, 0]) {
        const r = pinwheelLayer(rectX, rectY, a, b, { beat, strict: true });
        if (!r) continue;
        expect(r.capped).toBe(false);
        expect(r.count).toBeGreaterThan(beat);
        expect(r.blocks).toHaveLength(4);
        expect(r.blocks.every((blk) => blk.cols > 0 && blk.rows > 0)).toBe(true);
        expect(r.count).toBe(r.blocks.reduce((s, blk) => s + blk.cols * blk.rows, 0));
        assertNoOverlapWithin(r.blocks, a, b, rectX, rectY);
        expect(hasThroughCut(r.blocks, a, b)).toBe(false);
        if (r.count === straight) ties++;
        if (r.count < straight) fewer++;
      }
    }
    // The run is worth something only if it holds both kinds.
    expect(ties).toBeGreaterThan(20);
    expect(fewer).toBeGreaterThan(20);
  });
});
