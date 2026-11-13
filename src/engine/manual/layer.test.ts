import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, EPS } from '../../domain/constants';
import type { Block, Inputs, LayerPattern } from '../../domain/types';
import { NAMED_CASES, randomCases } from '../autoBaseline.testSupport';
import { optimize } from '../optimize';
import { usableFootprint } from '../packing/geometry';
import { assertNoOverlapWithin } from '../packing/overlap.testSupport';
import { cartonPlacements } from '../packing/positions';
import { PINWHEEL_INPUTS } from '../packing/testSupport';
import {
  addCarton,
  canPlace,
  cartonBase,
  cartonRect,
  cartonsOf,
  explodePattern,
  firstFreeSpot,
  fromPattern,
  manualPattern,
  moveCarton,
  overhangOf,
  overlapCount,
  palletRect,
  removeCarton,
  snap,
  snapTargets,
  SNAP_THRESHOLD,
  tryMoveCarton,
  tryTurnCarton,
  turnCarton,
  type CartonBase,
  type ManualCarton,
} from './layer';
import { pick, seeded } from './testSupport';

const BASE: CartonBase = { a: 10, b: 6 };
const USABLE = { x: 40, y: 30 };
const at = (x: number, y: number, rotated = false): ManualCarton => ({ x, y, rotated });
const asInputs = (i: object): Inputs => ({ ...DEFAULT_INPUTS, ...i });

/** The cartons as single blocks, for the shared overlap verifier. */
const blocksOf = (cartons: readonly ManualCarton[]): Block[] =>
  cartons.map((c) => ({ x: c.x, y: c.y, cols: 1, rows: 1, rotated: c.rotated }));

/** Throws when two cartons overlap; a huge rectangle, since cartons may lie outside. */
function assertNoOverlap(cartons: readonly ManualCarton[], base: CartonBase) {
  const shift = 1000;
  const moved = cartons.map((c) => ({ ...c, x: c.x + shift, y: c.y + shift }));
  assertNoOverlapWithin(blocksOf(moved), base.a, base.b, 2 * shift, 2 * shift);
}

describe('explodePattern / fromPattern', () => {
  it('puts every carton of a calculated layer where the layer is placed', () => {
    for (const inputs of [DEFAULT_INPUTS, PINWHEEL_INPUTS, asInputs({ overhang: 2 })]) {
      const result = optimize(inputs);
      for (const { layout } of result.layouts.slice(0, 5)) {
        const placed = cartonPlacements(layout, inputs);
        layout.layers.forEach((layer, k) => {
          const cartons = explodePattern(layer, layout.carton, inputs);
          const expected = placed.filter((p) => p.layerIndex === k);
          expect(cartons).toHaveLength(expected.length);
          const base = cartonBase(layout.carton, layer.vertical);
          cartons.forEach((c, n) => {
            const r = cartonRect(c, base);
            expect(r.x).toBeCloseTo(expected[n]!.x, 9);
            expect(r.y).toBeCloseTo(expected[n]!.y, 9);
            expect(r.w).toBe(expected[n]!.dx);
            expect(r.h).toBe(expected[n]!.dy);
          });
        });
      }
    }
  });

  it('gives a manual layer: one single-carton block per carton, same count, height and extent', () => {
    const { layout } = optimize(PINWHEEL_INPUTS).layouts[0]!;
    const layer = layout.layers[0]!;
    expect(layer.kind).toBe('pinwheel');
    const manual = fromPattern(layer, layout.carton, PINWHEEL_INPUTS);
    expect(manual.kind).toBe('manual');
    expect(manual.cartonCount).toBe(layer.cartonCount);
    expect(manual.blocks).toHaveLength(layer.cartonCount);
    expect(manual.blocks.every((b) => b.cols === 1 && b.rows === 1)).toBe(true);
    expect(manual.vertical).toBe(layer.vertical);
    expect(manual.height).toBe(layer.height);
    expect(manual.extent.x).toBeCloseTo(layer.extent.x, 9);
    expect(manual.extent.y).toBeCloseTo(layer.extent.y, 9);
    // A manual layer is placed where its blocks say: exploding it again changes nothing.
    expect(explodePattern(manual, layout.carton, PINWHEEL_INPUTS)).toEqual(cartonsOf(manual));
    const { x, y } = usableFootprint(PINWHEEL_INPUTS);
    const base = cartonBase(layout.carton, layer.vertical);
    assertNoOverlapWithin(manual.blocks, base.a, base.b, x, y);
  });

  it('manualPattern keeps negative and overhanging positions as they are', () => {
    const { layout } = optimize(DEFAULT_INPUTS).layouts[0]!;
    const v = layout.layers[0]!.vertical;
    const { a, b } = cartonBase(layout.carton, v);
    const p = manualPattern([at(-3, -2), at(60, 5, true)], layout.carton, v);
    expect(p.blocks.map((blk) => [blk.x, blk.y, blk.rotated])).toEqual([
      [-3, -2, false],
      [60, 5, true],
    ]);
    expect(p.cartonCount).toBe(2);
    expect(p.extent.x).toBeCloseTo(60 + b + 3, 9);
    expect(p.extent.y).toBeCloseTo(Math.max(-2 + b, 5 + a) + 2, 9);
    expect(manualPattern([], layout.carton, v).extent).toEqual({ x: 0, y: 0 });
  });
});

describe('canPlace', () => {
  const layer = [at(0, 0), at(10, 0)];
  it('allows touching and refuses overlapping', () => {
    expect(canPlace(layer, at(20, 0), BASE)).toBe(true);
    expect(canPlace(layer, at(0, 6), BASE)).toBe(true);
    expect(canPlace(layer, at(19.5, 0), BASE)).toBe(false);
    expect(canPlace(layer, at(5, 5.9), BASE)).toBe(false);
  });
  it('uses the engine tolerance: an overlap within it is touching', () => {
    expect(canPlace(layer, at(20 - EPS / 2, 0), BASE)).toBe(true);
    expect(canPlace(layer, at(20 - 1e-6, 0), BASE)).toBe(false);
  });
  it('allows a carton outside the usable footprint, and negative positions', () => {
    expect(canPlace(layer, at(-10, -6), BASE)).toBe(true);
    expect(canPlace(layer, at(500, 500), BASE)).toBe(true);
    expect(canPlace(layer, at(-5, -3), BASE)).toBe(false);
  });
  it('leaves out the carton being moved', () => {
    expect(canPlace(layer, at(1, 0), BASE)).toBe(false);
    expect(canPlace(layer, at(-1, 0), BASE, 0)).toBe(true);
  });
  it('knows a turned carton lies the other way', () => {
    expect(canPlace([at(0, 0, true)], at(6, 0), BASE)).toBe(true);
    expect(canPlace([at(0, 0, true)], at(0, 9), BASE)).toBe(false);
  });
});

describe('moveCarton', () => {
  const layer = [at(0, 0), at(10, 0)];
  it('moves a carton and leaves the given list untouched', () => {
    const moved = moveCarton(layer, 1, { x: 12.25, y: 3 }, BASE);
    expect(moved).toEqual([at(0, 0), at(12.25, 3)]);
    expect(layer).toEqual([at(0, 0), at(10, 0)]);
  });
  it('refuses a move onto another carton', () => {
    expect(moveCarton(layer, 1, { x: 9, y: 0 }, BASE)).toBeNull();
  });
  it('allows a move outside the footprint', () => {
    expect(moveCarton(layer, 0, { x: -4, y: -4 }, BASE)).toEqual([at(-4, -4), at(10, 0)]);
  });
  it('refuses an index that does not exist and a position that is not a number', () => {
    expect(moveCarton(layer, 5, { x: 0, y: 20 }, BASE)).toBeNull();
    expect(moveCarton(layer, 0, { x: NaN, y: 0 }, BASE)).toBeNull();
  });
});

describe('tryMoveCarton: a carton stays at least partly over the usable footprint', () => {
  // BASE is 10 x 6 and USABLE 40 x 30.
  const layer = [at(0, 0), at(10, 0)];
  const move = (to: { x: number; y: number }, cartons = layer) =>
    tryMoveCarton(cartons, 0, to, BASE, USABLE);
  it('moves a carton that overhangs but is still partly over the footprint', () => {
    expect(move({ x: -9.5, y: -5.5 })).toEqual({ ok: true, cartons: [at(-9.5, -5.5), at(10, 0)] });
    expect(move({ x: 39.5, y: 29.5 })).toMatchObject({ ok: true });
  });
  it('refuses a place wholly off the footprint, on any side', () => {
    for (const to of [
      { x: -10.5, y: 3 },
      { x: 40.5, y: 3 },
      { x: 3, y: -6.5 },
      { x: 3, y: 30.5 },
      { x: -500, y: 900 },
    ])
      expect(move(to), JSON.stringify(to)).toEqual({ ok: false, reason: 'offPallet' });
  });
  it('refuses a place that only touches the footprint: nothing of the carton is over it', () => {
    expect(move({ x: -10, y: 3 })).toEqual({ ok: false, reason: 'offPallet' });
    expect(move({ x: 3, y: 30 })).toEqual({ ok: false, reason: 'offPallet' });
    expect(move({ x: 40, y: 30 })).toEqual({ ok: false, reason: 'offPallet' });
  });
  it('still refuses an overlap, an unknown carton and a position that is not a number', () => {
    expect(tryMoveCarton(layer, 1, { x: 9, y: 0 }, BASE, USABLE)).toEqual({
      ok: false,
      reason: 'overlap',
    });
    expect(tryMoveCarton(layer, 7, { x: 9, y: 0 }, BASE, USABLE)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(move({ x: NaN, y: 0 })).toEqual({ ok: false, reason: 'invalid' });
  });
  it('a carton already wholly off (an old stored layout) may move back, never further off', () => {
    const lost = [at(-30, 3), at(10, 0)];
    expect(move({ x: -29, y: 3 }, lost)).toMatchObject({ ok: true });
    expect(move({ x: -30, y: 5 }, lost)).toMatchObject({ ok: true });
    expect(move({ x: 4, y: 20 }, lost)).toMatchObject({ ok: true });
    expect(move({ x: -31, y: 3 }, lost)).toEqual({ ok: false, reason: 'offPallet' });
  });
});

describe('turnCarton', () => {
  it('keeps an overhanging carton partly over the footprint', () => {
    // Its minimum corner kept, the turned carton would be wholly off; the next corner is not.
    expect(turnCarton([at(-9.5, 3)], 0, BASE, USABLE)).toEqual([at(-5.5, 3, true)]);
  });
  it('turns a carton about its minimum corner when that is free and inside', () => {
    expect(turnCarton([at(0, 0)], 0, BASE, USABLE)).toEqual([at(0, 0, true)]);
    expect(turnCarton([at(0, 0, true)], 0, BASE, USABLE)).toEqual([at(0, 0)]);
  });
  it('keeps another corner when the minimum corner would push it outside', () => {
    // At the far corner: 30..40 x 24..30. Turned it is 6 x 10: about its minimum corner it
    // would reach y = 34, so the first corner that keeps it inside (left, far side) is kept.
    expect(turnCarton([at(30, 24)], 0, BASE, USABLE)).toEqual([at(30, 20, true)]);
  });
  it('keeps a corner that avoids a neighbour', () => {
    // A neighbour above the minimum corner: turning there would overlap, so the right corner is kept.
    const turned = turnCarton([at(10, 10), at(10, 16)], 0, BASE, USABLE);
    expect(turned?.[0]).toEqual(at(10, 6, true));
    assertNoOverlap(turned!, BASE);
  });
  it('keeps the right-edge corner on the near side when the left corners are taken', () => {
    // 10..20 x 10..16, turned 6 x 10. A neighbour over the left part of the far side
    // (4..14 x 16..22) is in the way of the minimum corner only: turned against its own
    // right edge (x = 14) the carton clears it.
    const turned = turnCarton([at(10, 10), at(4, 16)], 0, BASE, USABLE);
    expect(turned?.[0]).toEqual(at(14, 10, true));
    assertNoOverlap(turned!, BASE);
  });
  it('keeps the right-edge corner on the far side when the other three are taken', () => {
    // A neighbour across the whole far side takes both near-side corners; one over the left
    // part of the near side (4..14 x 4..10) takes the left far-side corner. What is left is
    // the turn about the carton's right, far corner: 14..20 x 6..16.
    const turned = turnCarton([at(10, 10), at(10, 16), at(4, 4)], 0, BASE, USABLE);
    expect(turned?.[0]).toEqual(at(14, 6, true));
    assertNoOverlap(turned!, BASE);
  });
  it('is refused when the turned carton would overlap wherever it is put', () => {
    // Boxed in by a ring of cartons two deep.
    const ring: ManualCarton[] = [at(10, 12)];
    for (let x = -10; x <= 30; x += 10) {
      for (let y = -6; y <= 30; y += 6) if (!(x === 10 && y === 12)) ring.push(at(x, y));
    }
    expect(turnCarton(ring, 0, BASE, USABLE)).toBeNull();
  });
  it('is refused for a carton inside the footprint when every free turned place overhangs', () => {
    // 10 x 6 in a 10 x 6 footprint: turned it cannot be inside. A turn never makes an overhang.
    const tight = { x: 10, y: 6 };
    expect(turnCarton([at(0, 0)], 0, BASE, tight)).toBeNull();
    expect(tryTurnCarton([at(0, 0)], 0, BASE, tight)).toEqual({ ok: false, reason: 'noRoom' });
    // In the front corner with the carton behind it in the way: only places past the front
    // edge are free.
    const cornered = [at(30, 24), at(30, 18)];
    expect(tryTurnCarton(cornered, 0, BASE, USABLE)).toEqual({ ok: false, reason: 'noRoom' });
  });
  it('says overlap when the turned carton would overlap wherever it is put', () => {
    const ring: ManualCarton[] = [at(10, 12)];
    for (let x = -10; x <= 30; x += 10) {
      for (let y = -6; y <= 30; y += 6) if (!(x === 10 && y === 12)) ring.push(at(x, y));
    }
    expect(tryTurnCarton(ring, 0, BASE, USABLE)).toEqual({ ok: false, reason: 'overlap' });
  });
  it('a carton that already overhangs may turn and still overhang, as before', () => {
    const turned = turnCarton([at(-2, 0)], 0, BASE, { x: 10, y: 6 });
    expect(turned).toEqual([at(-2, 0, true)]);
    expect(overhangOf(turned!, BASE, { x: 10, y: 6 }).cartons).toBe(1);
    // It comes inside when a turned place inside is free.
    expect(turnCarton([at(36, 0)], 0, BASE, USABLE)).toEqual([at(36, 0, true)]);
  });
  it('a turn of a carton inside the footprint never makes an overhang (property)', () => {
    const rnd = seeded(77);
    for (let run = 0; run < 300; run++) {
      const cartons: ManualCarton[] = [];
      for (let k = 0; k < 6; k++) {
        const c = at(pick(rnd, 0, 30, 1), pick(rnd, 0, 24, 1), rnd() < 0.5);
        const r = cartonRect(c, BASE);
        if (r.x + r.w <= USABLE.x && r.y + r.h <= USABLE.y && canPlace(cartons, c, BASE))
          cartons.push(c);
      }
      if (cartons.length === 0) continue;
      const turned = turnCarton(cartons, 0, BASE, USABLE);
      if (turned) expect(overhangOf(turned, BASE, USABLE).cartons).toBe(0);
    }
  });
  it('turns a square carton where it stands', () => {
    expect(turnCarton([at(3, 4)], 0, { a: 8, b: 8 }, USABLE)).toEqual([at(3, 4, true)]);
  });
  it('returns null for an index that does not exist', () => {
    expect(turnCarton([at(0, 0)], 3, BASE, USABLE)).toBeNull();
  });
});

describe('firstFreeSpot / addCarton', () => {
  it('starts at the front-left corner: least x, greatest y', () => {
    expect(firstFreeSpot([], false, BASE, USABLE)).toEqual({ x: 0, y: 24 });
    expect(firstFreeSpot([], true, BASE, USABLE)).toEqual({ x: 0, y: 20 });
  });
  it('fills the front row from the left, then the row behind', () => {
    let cartons: ManualCarton[] = [];
    const spots: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const added = addCarton(cartons, false, BASE, USABLE)!;
      expect(added.index).toBe(k);
      cartons = added.cartons;
      spots.push([cartons[k]!.x, cartons[k]!.y]);
    }
    expect(spots).toEqual([
      [0, 24],
      [10, 24],
      [20, 24],
      [30, 24],
      [0, 18],
      [10, 18],
    ]);
  });
  it('returns null, and adds nothing, when the footprint is full', () => {
    let cartons: ManualCarton[] = [];
    for (;;) {
      const added = addCarton(cartons, false, BASE, USABLE);
      if (!added) break;
      cartons = added.cartons;
    }
    expect(cartons).toHaveLength(20);
    expect(firstFreeSpot(cartons, false, BASE, USABLE)).toBeNull();
    assertNoOverlapWithin(blocksOf(cartons), BASE.a, BASE.b, USABLE.x, USABLE.y);
  });
  it('returns null for a carton larger than the footprint in that orientation', () => {
    expect(firstFreeSpot([], false, { a: 50, b: 6 }, USABLE)).toBeNull();
    expect(firstFreeSpot([], true, { a: 50, b: 6 }, USABLE)).toBeNull();
    expect(firstFreeSpot([], true, { a: 30, b: 35 }, USABLE)).toEqual({ x: 0, y: 0 });
  });
  it('ignores free room outside the footprint and finds a gap between cartons', () => {
    // A front row with a 10-wide gap at x 10..20.
    const row = [at(0, 24), at(20, 24), at(30, 24), at(-10, 24)];
    expect(firstFreeSpot(row, false, BASE, USABLE)).toEqual({ x: 10, y: 24 });
  });
  it('uses the orientation asked for', () => {
    const added = addCarton([at(0, 24)], true, BASE, USABLE)!;
    expect(added.cartons[1]).toEqual(at(10, 20, true));
  });
});

describe('removeCarton', () => {
  it('removes one carton and keeps the order of the rest', () => {
    const layer = [at(0, 0), at(10, 0), at(20, 0)];
    expect(removeCarton(layer, 1)).toEqual([at(0, 0), at(20, 0)]);
    expect(removeCarton(layer, 9)).toEqual(layer);
    expect(layer).toHaveLength(3);
  });
});

describe('snap', () => {
  const inputs = asInputs({ pallet: { length: 40, width: 30, height: 60 }, overhang: 2 });
  const size = { w: 10, h: 6 };
  const targets = snapTargets([at(15, 10), at(0, 0)], BASE, inputs, 1);

  it('lists the footprint, the pallet inset by half the overhang and the other cartons', () => {
    expect(targets.usable).toEqual({ x: 42, y: 32 });
    expect(targets.pallet).toEqual({ x: 1, y: 1, w: 40, h: 30 });
    expect(palletRect(inputs)).toEqual(targets.pallet);
    expect(targets.others).toEqual([{ x: 15, y: 10, w: 10, h: 6 }]);
  });
  it('snaps the near edge to the footprint edge', () => {
    expect(snap({ x: 0.3, y: -0.4 }, size, targets)).toEqual({ x: 0, y: 0 });
  });
  it('snaps the far edge to the footprint edge', () => {
    const p = snap({ x: 32.2, y: 25.8 }, size, targets);
    expect(p.x + size.w).toBe(42);
    expect(p.y + size.h).toBe(32);
  });
  it('snaps to the pallet edge when that is nearer', () => {
    expect(snap({ x: 0.8, y: 1.2 }, size, targets)).toEqual({ x: 1, y: 1 });
    expect(snap({ x: 30.9, y: 20 }, size, targets).x).toBe(31);
  });
  it('snaps to another carton: beside it, and in line with it', () => {
    expect(snap({ x: 25.4, y: 9.7 }, size, targets)).toEqual({ x: 25, y: 10 });
    expect(snap({ x: 4.7, y: 16.3 }, size, targets)).toEqual({ x: 5, y: 16 });
  });
  it('leaves an edge further away than the threshold alone, each axis on its own', () => {
    expect(snap({ x: 7.3, y: 0.2 }, size, targets)).toEqual({ x: 7.3, y: 0 });
    expect(SNAP_THRESHOLD).toBe(0.5);
    expect(snap({ x: 0.5, y: 5 }, size, targets).x).toBe(0);
    expect(snap({ x: 0.75, y: 5 }, size, targets).x).toBe(1);
  });
  it('takes the nearest edge, and its own threshold', () => {
    expect(snap({ x: 0.45, y: 20 }, size, targets).x).toBe(0);
    expect(snap({ x: 0.55, y: 20 }, size, targets).x).toBe(1);
    expect(snap({ x: 2.5, y: 20 }, size, targets, 2).x).toBe(1);
  });
  it('is switched off by a null or zero threshold', () => {
    expect(snap({ x: 0.3, y: -0.4 }, size, targets, null)).toEqual({ x: 0.3, y: -0.4 });
    expect(snap({ x: 0.3, y: -0.4 }, size, targets, 0)).toEqual({ x: 0.3, y: -0.4 });
  });
});

describe('overhangOf / overlapCount', () => {
  it('counts the cartons outside and the furthest any reaches', () => {
    const cartons = [at(0, 0), at(-1.5, 10), at(32, 20), at(5, 27, true), at(30, 24)];
    // The third reaches 2 past x = 40; the fourth, 6 wide and 10 deep, 7 past y = 30.
    expect(overhangOf(cartons, BASE, USABLE)).toEqual({ cartons: 3, by: 7 });
    expect(overhangOf([at(0, 0), at(30, 24)], BASE, USABLE)).toEqual({ cartons: 0, by: 0 });
    expect(overhangOf([at(-EPS / 2, 0)], BASE, USABLE)).toEqual({ cartons: 0, by: 0 });
  });
  it('counts overlapping pairs', () => {
    expect(overlapCount([at(0, 0), at(10, 0), at(0, 6)], BASE)).toBe(0);
    expect(overlapCount([at(0, 0), at(9, 0), at(0, 5)], BASE)).toBe(3);
  });
});

/** A random walk of editing steps on a layer; every step is one the editor could make. */
function randomEdit(
  rnd: () => number,
  cartons: ManualCarton[],
  base: CartonBase,
  usable: { x: number; y: number },
  inputs: Inputs,
): ManualCarton[] {
  const index = Math.floor(rnd() * Math.max(1, cartons.length));
  const roll = rnd();
  if (roll < 0.3 || cartons.length === 0) {
    return addCarton(cartons, rnd() < 0.5, base, usable)?.cartons ?? cartons;
  }
  if (roll < 0.65) {
    // A drag: anywhere from well outside one corner to well outside the other, snapped or not.
    const raw = { x: pick(rnd, -8, usable.x + 4, 0.125), y: pick(rnd, -8, usable.y + 4, 0.125) };
    const { w, h } = cartonRect(cartons[index]!, base);
    const to = snap(
      raw,
      { w, h },
      snapTargets(cartons, base, inputs, index),
      rnd() < 0.7 ? SNAP_THRESHOLD : null,
    );
    return moveCarton(cartons, index, to, base) ?? cartons;
  }
  if (roll < 0.8) {
    // A nudge with the arrow keys.
    const c = cartons[index]!;
    const step = rnd() < 0.5 ? 0.25 : 1;
    const dir = [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ][Math.floor(rnd() * 4)]!;
    return moveCarton(cartons, index, { x: c.x + dir[0]!, y: c.y + dir[1]! }, base) ?? cartons;
  }
  if (roll < 0.93) return turnCarton(cartons, index, base, usable) ?? cartons;
  return removeCarton(cartons, index);
}

describe('properties', () => {
  it('no accepted sequence of placements ever yields overlapping cartons', () => {
    const rnd = seeded(51);
    let accepted = 0;
    for (let run = 0; run < 60; run++) {
      const base = { a: pick(rnd, 6, 20, 0.5), b: pick(rnd, 4, 16, 0.5) };
      const inputs = asInputs({
        pallet: { length: pick(rnd, 30, 60, 2), width: pick(rnd, 24, 48, 2), height: 60 },
        overhang: rnd() < 0.4 ? pick(rnd, 0.5, 3, 0.5) : 0,
      });
      const usable = usableFootprint(inputs);
      let cartons: ManualCarton[] = [];
      for (let step = 0; step < 80; step++) {
        const next = randomEdit(rnd, cartons, base, usable, inputs);
        if (next !== cartons) accepted++;
        cartons = next;
        expect(overlapCount(cartons, base)).toBe(0);
      }
      assertNoOverlap(cartons, base);
    }
    expect(accepted).toBeGreaterThan(2000);
  });

  it('starting from a calculated layer, edits never yield overlapping cartons', () => {
    const rnd = seeded(7);
    const cases = [...NAMED_CASES, ...randomCases(12, 99)];
    let layers = 0;
    for (const c of cases) {
      const inputs = asInputs(c.inputs);
      const best = optimize(inputs).layouts[0]?.layout;
      const layer = best?.layers[0];
      if (!best || !layer || layer.cartonCount > 150) continue;
      layers++;
      const base = cartonBase(best.carton, layer.vertical);
      const usable = usableFootprint(inputs);
      let cartons = explodePattern(layer, best.carton, inputs);
      assertNoOverlapWithin(blocksOf(cartons), base.a, base.b, usable.x, usable.y);
      for (let step = 0; step < 60; step++) {
        cartons = randomEdit(rnd, cartons, base, usable, inputs);
      }
      assertNoOverlap(cartons, base);
    }
    expect(layers).toBeGreaterThan(8);
  });

  it('snapping lands exactly on an edge within the threshold, or does not move', () => {
    const rnd = seeded(3);
    let snapped = 0;
    for (let run = 0; run < 400; run++) {
      const inputs = asInputs({
        pallet: { length: pick(rnd, 30, 60, 1), width: pick(rnd, 24, 48, 1), height: 60 },
        overhang: rnd() < 0.5 ? pick(rnd, 0.25, 3, 0.25) : 0,
      });
      const base = { a: 3 + rnd() * 15, b: 3 + rnd() * 12 };
      const others = Array.from({ length: Math.floor(rnd() * 6) }, () =>
        at(rnd() * 50 - 5, rnd() * 40 - 5, rnd() < 0.5),
      );
      const targets = snapTargets(others, base, inputs);
      const size = cartonRect(at(0, 0, rnd() < 0.5), base);
      const raw = { x: rnd() * 60 - 5, y: rnd() * 50 - 5 };
      const threshold = rnd() < 0.2 ? rnd() * 2 : SNAP_THRESHOLD;
      const p = snap(raw, size, targets, threshold);
      const check = (v: number, from: number, extent: number, edges: number[]) => {
        const reachable = edges
          .flatMap((e) => [e, e - extent])
          .filter((t) => Math.abs(t - from) <= threshold);
        if (reachable.length === 0) {
          expect(v).toBe(from);
          return;
        }
        snapped++;
        // Exactly on an edge: the near side is the edge itself, or the far side is (the
        // position is the edge less the size, as near as a float can say it).
        expect(edges.some((e) => v === e || v === e - extent)).toBe(true);
        expect(Math.abs(v - from)).toBeLessThanOrEqual(threshold);
        // And no reachable edge was nearer.
        const nearest = Math.min(...reachable.map((t) => Math.abs(t - from)));
        expect(Math.abs(v - from)).toBe(nearest);
      };
      const rects = targets.others;
      check(p.x, raw.x, size.w, [
        0,
        targets.usable.x,
        targets.pallet.x,
        targets.pallet.x + targets.pallet.w,
        ...rects.flatMap((r) => [r.x, r.x + r.w]),
      ]);
      check(p.y, raw.y, size.h, [
        0,
        targets.usable.y,
        targets.pallet.y,
        targets.pallet.y + targets.pallet.h,
        ...rects.flatMap((r) => [r.y, r.y + r.h]),
      ]);
    }
    expect(snapped).toBeGreaterThan(100);
  });

  it('the first free spot is found whenever one exists, is inside, and never overlaps', () => {
    const rnd = seeded(11);
    let found = 0;
    let full = 0;
    for (let run = 0; run < 300; run++) {
      // Everything on a half-inch lattice, so every place a carton could stand can be tried.
      const base = { a: pick(rnd, 3, 9, 0.5), b: pick(rnd, 2, 7, 0.5) };
      const usable = { x: pick(rnd, 10, 24, 0.5), y: pick(rnd, 8, 20, 0.5) };
      let cartons: ManualCarton[] = [];
      const tries = Math.floor(rnd() * 40);
      for (let k = 0; k < tries; k++) {
        const c = at(pick(rnd, -3, usable.x, 0.5), pick(rnd, -3, usable.y, 0.5), rnd() < 0.5);
        if (canPlace(cartons, c, base)) cartons = [...cartons, c];
      }
      // Sometimes pack it tight first, so full layers are tested too.
      if (rnd() < 0.4) {
        for (;;) {
          const added = addCarton(cartons, rnd() < 0.5, base, usable);
          if (!added) break;
          cartons = added.cartons;
        }
      }
      for (const rotated of [false, true]) {
        const { w, h } = cartonRect(at(0, 0, rotated), base);
        let exists = false;
        for (let x = 0; x + w <= usable.x && !exists; x += 0.5) {
          for (let y = 0; y + h <= usable.y && !exists; y += 0.5) {
            exists = canPlace(cartons, at(x, y, rotated), base);
          }
        }
        const spot = firstFreeSpot(cartons, rotated, base, usable);
        expect(spot !== null).toBe(exists);
        if (spot) {
          found++;
          expect(canPlace(cartons, { ...spot, rotated }, base)).toBe(true);
          expect(spot.x).toBeGreaterThanOrEqual(0);
          expect(spot.y).toBeGreaterThanOrEqual(0);
          expect(spot.x + w).toBeLessThanOrEqual(usable.x);
          expect(spot.y + h).toBeLessThanOrEqual(usable.y);
          // Nothing free is nearer the front, nor further left in the same row.
          for (let x = 0; x + w <= usable.x; x += 0.5) {
            for (let y = spot.y; y + h <= usable.y; y += 0.5) {
              if (y === spot.y && x >= spot.x) continue;
              expect(canPlace(cartons, at(x, y, rotated), base)).toBe(false);
            }
          }
        } else {
          full++;
        }
      }
    }
    expect(found).toBeGreaterThan(100);
    expect(full).toBeGreaterThan(100);
  });
});

describe('a manual layer as a LayerPattern', () => {
  it('round-trips through cartonsOf', () => {
    const { layout } = optimize(DEFAULT_INPUTS).layouts[0]!;
    const cartons = [at(-2, 3), at(20, 3, true)];
    const p: LayerPattern = manualPattern(cartons, layout.carton, 'H');
    expect(cartonsOf(p)).toEqual(cartons);
  });
});
