import { describe, expect, it } from 'vitest';
import type { Block } from '../../domain/types';
import { searchLayer } from './layerSearch';
import { blockCartonRects, type Rect } from './geometry';
import {
  assertNoOverlapWithin,
  lineMissingEveryCarton,
  lineMissingEveryRect,
} from './overlap.testSupport';
import { hasThroughCut, pinwheelLayer, type PinwheelAllowance } from './pinwheel';

/** A seeded linear congruential generator, so every run sees the same "random" cases. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 0x100000000;
  };
}

/** Generous: these runs take a few seconds alone and several times that on a loaded machine. */
const HEAVY = 30_000;

/**
 * The most cartons of any true four-block pinwheel, found the slow plain way: every size of
 * every block, each block in its corner of the rectangle (bottom-left and top-right one way
 * round, bottom-right and top-left the other; then all four turned), kept when no two blocks
 * overlap and, once the blocks are pushed together, no straight line right across misses every
 * carton. 0 when there is none. Shares nothing with the search but the rectangle convention.
 */
function bruteForce(rectX: number, rectY: number, a: number, b: number, atMost = Infinity): number {
  const EPS = 1e-6;
  const apart = (p: Rect, q: Rect) =>
    Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) <= EPS ||
    Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) <= EPS;
  let best = 0;
  for (const turned of [false, true]) {
    // Carton size along x and y of the blocks in corners 1 and 3, and of those in 2 and 4.
    const odd = turned ? [b, a] : [a, b];
    const even = turned ? [a, b] : [b, a];
    const sizes = (dx: number, dy: number) => {
      const out: [number, number][] = [];
      for (let c = 1; c * dx <= rectX + EPS; c++) {
        for (let r = 1; r * dy <= rectY + EPS; r++) out.push([c, r]);
      }
      return out;
    };
    const corner = (k: number, [c, r]: [number, number]): Rect => {
      const [dx, dy] = (k % 2 === 0 ? odd : even) as [number, number];
      const [w, h] = [c * dx, r * dy];
      return { x: k === 0 || k === 3 ? 0 : rectX - w, y: k < 2 ? 0 : rectY - h, w, h };
    };
    const [s1, s2] = [sizes(odd[0]!, odd[1]!), sizes(even[0]!, even[1]!)];
    for (const n1 of s1) {
      const r1 = corner(0, n1);
      for (const n2 of s2) {
        const r2 = corner(1, n2);
        if (!apart(r1, r2)) continue;
        for (const n3 of s1) {
          const r3 = corner(2, n3);
          if (!apart(r1, r3) || !apart(r2, r3)) continue;
          for (const n4 of s2) {
            const count = n1[0] * n1[1] + n2[0] * n2[1] + n3[0] * n3[1] + n4[0] * n4[1];
            if (count <= best || count > atMost) continue;
            const r4 = corner(3, n4);
            if (!apart(r1, r4) || !apart(r2, r4) || !apart(r3, r4)) continue;
            // Pushed together: the right-hand pair as far left as it goes, then the top pair
            // as far down as it goes.
            const rects = [r1, r2, r3, r4].map((r) => ({ ...r }));
            const [q1, q2, q3, q4] = rects as [Rect, Rect, Rect, Rect];
            let slack = Math.min(q2.x, q3.x);
            for (const left of [q1, q4]) {
              for (const right of [q2, q3]) {
                const shared =
                  Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y);
                if (shared > EPS) slack = Math.min(slack, right.x - (left.x + left.w));
              }
            }
            slack = Math.max(0, slack);
            q2.x -= slack;
            q3.x -= slack;
            slack = Math.min(q3.y, q4.y);
            for (const low of [q1, q2]) {
              for (const high of [q3, q4]) {
                const shared = Math.min(low.x + low.w, high.x + high.w) - Math.max(low.x, high.x);
                if (shared > EPS) slack = Math.min(slack, high.y - (low.y + low.h));
              }
            }
            slack = Math.max(0, slack);
            q3.y -= slack;
            q4.y -= slack;
            const cartons = rects.flatMap((r, k) => {
              const [dx, dy] = (k % 2 === 0 ? odd : even) as [number, number];
              const blockOf: Block = {
                x: r.x,
                y: r.y,
                cols: Math.round(r.w / dx),
                rows: Math.round(r.h / dy),
                rotated: false,
              };
              return blockCartonRects([blockOf], dx, dy);
            });
            if (lineMissingEveryRect(cartons) === null) best = count;
          }
        }
      }
    }
  }
  return best;
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

  it('finds a cut along a seam inside one block, between the other blocks (carton level)', () => {
    // B1 is two cartons side by side (seam at x = 3); B3 starts at x = 3 and B4 ends at x = 2:
    // the line x = 3 passes through no carton, though it runs through the middle of block B1.
    const blocks = [
      block(0, 0, 2, 1),
      block(6, 0, 1, 1, true),
      block(3, 3, 2, 1),
      block(0, 2, 1, 1, true),
    ];
    assertNoOverlapWithin(blocks, 3, 2, 9, 5);
    expect(lineMissingEveryCarton(blocks, 3, 2)).toEqual({ axis: 'x', at: 3 });
    expect(hasThroughCut(blocks, 3, 2)).toBe(true);
  });

  it('does not count the outer edges of the layer as cuts', () => {
    expect(hasThroughCut([block(0, 0, 1, 1)], 3, 2)).toBe(false);
    // A plain grid is cut along every seam between its cartons.
    expect(hasThroughCut([block(0, 0, 2, 1)], 3, 2)).toBe(true);
    expect(hasThroughCut([block(0, 0, 1, 2)], 3, 2)).toBe(true);
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

  it('finds the classic pinwheel whose fourth block is not one of its two largest shapes', () => {
    // 32 x 35 with 15 x 7.5 cartons: four cartons round a 7.5 in hole, 22.5 x 22.5 in all.
    const r = pinwheelLayer(32, 35, 15, 7.5, { strict: true })!;
    expect(r).not.toBeNull();
    expect(r.count).toBe(4);
    expect(r.capped).toBe(false);
    assertNoOverlapWithin(r.blocks, 15, 7.5, 32, 35);
    expect(lineMissingEveryCarton(r.blocks, 15, 7.5)).toBeNull();
  });

  it('atMost: the largest true pinwheel of no more cartons than that', () => {
    // 48 x 40 with 16.5 x 10.5 cartons: ten in the best pinwheel, four in the classic one.
    expect(pinwheelLayer(48, 40, 16.5, 10.5, { strict: true })!.count).toBe(10);
    for (const atMost of [9, 7, 5, 4]) {
      const r = pinwheelLayer(48, 40, 16.5, 10.5, { strict: true, atMost })!;
      expect(r.count).toBeLessThanOrEqual(atMost);
      expect(r.count).toBe(bruteForce(48, 40, 16.5, 10.5, atMost));
      assertNoOverlapWithin(r.blocks, 16.5, 10.5, 48, 40);
      expect(lineMissingEveryCarton(r.blocks, 16.5, 10.5)).toBeNull();
    }
    expect(pinwheelLayer(48, 40, 16.5, 10.5, { strict: true, atMost: 4 })!.count).toBe(4);
    expect(pinwheelLayer(48, 40, 16.5, 10.5, { strict: true, atMost: 3 })).toBeNull();
  });

  it(
    'random footprints: the strict search finds what trying every four-block layout finds',
    () => {
      // Fails if the search stops trying narrower second or third blocks, or tries the fourth
      // block in its largest shapes only: each of those loses pinwheels counted below.
      const rnd = seeded(5);
      let found = 0;
      let none = 0;
      let belowStraight = 0;
      let capped = 0;
      for (let n = 0; n < 400; n++) {
        const rectX = 14 + Math.floor(rnd() * 23) / 2;
        const rectY = 12 + Math.floor(rnd() * 21) / 2;
        const a = 4.5 + Math.floor(rnd() * 12) / 2;
        const b = 3 + Math.floor(rnd() * 7) / 2;
        const label = `${rectX} x ${rectY}, cartons ${a} x ${b}`;
        const most = bruteForce(rectX, rectY, a, b);
        const r = pinwheelLayer(rectX, rectY, a, b, { strict: true });
        expect(r?.count ?? 0, label).toBe(most);
        if (most === 0) none++;
        else found++;
        if (!r) continue;
        expect(r.capped, label).toBe(false);
        assertNoOverlapWithin(r.blocks, a, b, rectX, rectY);
        expect(lineMissingEveryCarton(r.blocks, a, b), label).toBeNull();
        const straight = searchLayer(rectX, rectY, a, b).count;
        if (most < straight) belowStraight++;
        // What Prefer pinwheel asks for: a pinwheel only when one ties the straight cuts.
        const tie = pinwheelLayer(rectX, rectY, a, b, { beat: straight - 1, strict: true });
        expect(tie?.count ?? 0, label).toBe(most >= straight ? most : 0);
        // A weight maximum: the best pinwheel of fewer cartons than the best of all.
        if (most > 4) {
          const atMost = 4 + Math.floor(rnd() * (most - 4));
          const less = pinwheelLayer(rectX, rectY, a, b, { strict: true, atMost });
          expect(less?.count ?? 0, `${label}, at most ${atMost}`).toBe(
            bruteForce(rectX, rectY, a, b, atMost),
          );
          if (less) expect(lineMissingEveryCarton(less.blocks, a, b), label).toBeNull();
          capped++;
        }
      }
      // The run is worth something only if it holds every kind.
      expect(found).toBeGreaterThan(100);
      expect(none).toBeGreaterThan(20);
      expect(belowStraight).toBeGreaterThan(50);
      expect(capped).toBeGreaterThan(50);
    },
    HEAVY,
  );

  it(
    'random footprints: ties and smaller pinwheels are true pinwheels and never overlap',
    () => {
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
          expect(lineMissingEveryCarton(r.blocks, a, b)).toBeNull();
          if (r.count === straight) ties++;
          if (r.count < straight) fewer++;
        }
      }
      // The run is worth something only if it holds both kinds.
      expect(ties).toBeGreaterThan(20);
      expect(fewer).toBeGreaterThan(20);
    },
    HEAVY,
  );
});
