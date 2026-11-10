import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { CartonCandidate } from '../../domain/types';
import {
  cartonKey,
  generateCartonCandidates,
  generateCartonCandidatesWithInfo,
  MAX_CARTON_CANDIDATES,
} from './cartons';
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
      expect(
        a.boxesPerCarton > b.boxesPerCarton ||
          (a.boxesPerCarton === b.boxesPerCarton && cartonKey(a) < cartonKey(b)),
      ).toBe(true);
    }
    expect(cartonKey(first)).toBe('1x2x5');
  });

  it('returns [] when the product is larger than the maximum carton', () => {
    expect(
      generateCartonCandidates({ ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 } }),
    ).toEqual([]);
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

describe('generateCartonCandidatesWithInfo', () => {
  it('returns the same 10 default candidates, not truncated', () => {
    const r = generateCartonCandidatesWithInfo(DEFAULT_INPUTS);
    expect(r.truncated).toBe(false);
    expect(r.candidates).toHaveLength(10);
    expect(r.candidates).toEqual(generateCartonCandidates(DEFAULT_INPUTS));
  });

  it('matches a brute-force enumeration of every count triple', () => {
    // 'upright' keeps mirror cartons, so every valid triple appears exactly once.
    const i = {
      ...DEFAULT_INPUTS,
      rotationMode: 'upright' as const,
      product: { length: 2, width: 3, height: 5 },
    };
    const max = [24, 18, 16];
    const expected: string[] = [];
    for (let l = 1; l <= 30; l++) {
      for (let w = 1; w <= 30; w++) {
        for (let h = 1; h <= 30; h++) {
          const outer = [l * 2 + 1, w * 3 + 1, h * 5 + 1].sort((a, b) => b - a);
          if (outer.every((v, k) => fitsWithin(v, max[k] as number)))
            expected.push(`${l}x${w}x${h}`);
        }
      }
    }
    const got = generateCartonCandidatesWithInfo(i).candidates.map(cartonKey);
    expect([...got].sort()).toEqual(expected.sort());
  });

  it('caps a very small product quickly and reports truncation', () => {
    expect(MAX_CARTON_CANDIDATES).toBe(8000);
    const t0 = performance.now();
    const r = generateCartonCandidatesWithInfo({
      ...DEFAULT_INPUTS,
      product: { length: 0.2, width: 0.2, height: 0.2 },
    });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.truncated).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.length).toBeLessThanOrEqual(MAX_CARTON_CANDIDATES);
    for (let k = 1; k < r.candidates.length; k++) {
      expect((r.candidates[k - 1] as CartonCandidate).boxesPerCarton).toBeGreaterThanOrEqual(
        (r.candidates[k] as CartonCandidate).boxesPerCarton,
      );
    }
  });
});
