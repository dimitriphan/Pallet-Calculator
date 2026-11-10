import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, OptimizeResult } from '../domain/types';
import { optimize } from '../engine/optimize';
import { emptyMessage } from './emptyMessage';

const withCount = (n: number): Inputs => ({ ...DEFAULT_INPUTS, boxesPerCarton: n });
const empty = (r: Partial<OptimizeResult>): OptimizeResult => ({
  layouts: [],
  candidatesEvaluated: 0,
  emptyReason: null,
  truncated: false,
  ...r,
});

describe('emptyMessage', () => {
  it('is null when layouts exist', () => {
    expect(emptyMessage(optimize(DEFAULT_INPUTS), DEFAULT_INPUTS)).toBeNull();
  });

  it('explains NO_CARTON_FITS', () => {
    expect(emptyMessage(empty({ emptyReason: 'NO_CARTON_FITS' }), DEFAULT_INPUTS)).toBe(
      'No carton fits: the product box (plus leeway and walls) is larger than the maximum carton dimensions.',
    );
  });

  it('explains CARTON_EXCEEDS_PALLET', () => {
    expect(emptyMessage(empty({ emptyReason: 'CARTON_EXCEEDS_PALLET' }), DEFAULT_INPUTS)).toBe(
      'No layout fits: the smallest possible carton is larger than the usable pallet space.',
    );
  });

  it('names both neighbouring counts', () => {
    const inputs = withCount(7);
    expect(emptyMessage(optimize(inputs), inputs)).toBe(
      'No carton holding exactly 7 boxes fits within the maximum carton dimensions. Counts that do fit: 6 and 8.',
    );
  });

  it('names the single neighbouring count', () => {
    const inputs = withCount(50);
    expect(emptyMessage(optimize(inputs), inputs)).toBe(
      'No carton holding exactly 50 boxes fits within the maximum carton dimensions. The closest count that fits is 10.',
    );
  });

  it.each([undefined, { below: null, above: null }])(
    'shows only the first sentence without usable neighbours (%j)',
    (nearestCounts) => {
      const r = empty({ emptyReason: 'NO_CARTON_WITH_COUNT', nearestCounts });
      expect(emptyMessage(r, withCount(7))).toBe(
        'No carton holding exactly 7 boxes fits within the maximum carton dimensions.',
      );
    },
  );
});
