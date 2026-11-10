import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { CartonCandidate } from '../../domain/types';
import { cartonKey, generateCartonCandidates } from './cartons';
import { fitsWithin } from './tolerance';

describe('generateCartonCandidates', () => {
  const cs = generateCartonCandidates(DEFAULT_INPUTS);
  const first = cs[0];
  if (!first) throw new Error('expected candidates for default inputs');

  it('lists every valid count triple for the defaults', () => {
    expect(cs).toHaveLength(10); // L:1 x W:1..2 x H:1..5
    expect(first).toMatchObject({
      counts: { L: 1, W: 2, H: 5 },
      boxesPerCarton: 10,
      inner: { L: 12.5, W: 16.5, H: 20.5 },
      outer: { L: 13, W: 17, H: 21 },
    });
    expect(first.utilization).toBeCloseTo(3840 / 4641, 12);
    expect(first.emptyVolume).toBeCloseTo(4641 - 3840, 9);
    expect(cs.some((c) => c.counts.L === 2)).toBe(false); // 25 > 24
  });

  it('every candidate fits the sorted maximum carton', () => {
    const max = [24, 18, 16] as const;
    for (const c of cs) {
      const o = [c.outer.L, c.outer.W, c.outer.H].sort((a, b) => b - a);
      o.forEach((v, i) => expect(fitsWithin(v, max[i] ?? 0)).toBe(true));
    }
  });

  it('sorts by boxes descending then key ascending', () => {
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1] as CartonCandidate;
      const b = cs[i] as CartonCandidate;
      expect(a.boxesPerCarton > b.boxesPerCarton || (a.boxesPerCarton === b.boxesPerCarton && cartonKey(a) < cartonKey(b))).toBe(true);
    }
    expect(cartonKey(first)).toBe('1x2x5');
  });

  it('returns [] when the product is larger than the maximum carton', () => {
    expect(generateCartonCandidates({ ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 } })).toEqual([]);
  });

  it('collapses physically identical cartons under full rotation', () => {
    const cube = generateCartonCandidates({
      ...DEFAULT_INPUTS,
      product: { length: 5, width: 5, height: 5 },
      leeway: 0,
      wallThickness: 0,
      maxCarton: { length: 10, width: 5, height: 5 },
    });
    expect(cube.map((c) => c.boxesPerCarton)).toEqual([2, 1]);
  });

  it('keeps mirror cartons when rotation is not full', () => {
    const cube = generateCartonCandidates({
      ...DEFAULT_INPUTS,
      rotationMode: 'upright',
      product: { length: 5, width: 5, height: 5 },
      leeway: 0,
      wallThickness: 0,
      maxCarton: { length: 10, width: 5, height: 5 },
    });
    expect(cube.map((c) => c.boxesPerCarton)).toEqual([2, 2, 2, 1]);
  });
});
