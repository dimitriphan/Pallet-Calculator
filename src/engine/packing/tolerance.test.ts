import { describe, expect, it } from 'vitest';
import { fitsCount, fitsWithin } from './tolerance';

describe('fitsCount', () => {
  it('tolerates floating-point error', () => {
    expect(fitsCount(0.3, 0.1)).toBe(3); // 0.1 * 3 = 0.30000000000000004
    expect(fitsCount(0.1 + 0.2, 0.3)).toBe(1);
  });
  it('floors normal cases', () => {
    expect(fitsCount(10, 3)).toBe(3);
  });
  it('returns 0 for non-positive size', () => {
    expect(fitsCount(10, 0)).toBe(0);
    expect(fitsCount(10, -1)).toBe(0);
  });
});

describe('fitsWithin', () => {
  it('tolerates floating-point error', () => {
    expect(fitsWithin(0.1 + 0.2, 0.3)).toBe(true);
  });
  it('rejects genuinely larger sizes', () => {
    expect(fitsWithin(0.31, 0.3)).toBe(false);
  });
});
