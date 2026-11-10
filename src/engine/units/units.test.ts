import { describe, expect, it } from 'vitest';
import { formatDims, formatLength, fromInches, toInches } from './units';

describe('units', () => {
  it('converts to and from inches', () => {
    expect(toInches(2.54, 'cm')).toBeCloseTo(1, 12);
    expect(toInches(25.4, 'mm')).toBeCloseTo(1, 12);
    expect(toInches(7, 'in')).toBe(7);
    expect(fromInches(1, 'mm')).toBeCloseTo(25.4, 12);
    expect(fromInches(1, 'cm')).toBeCloseTo(2.54, 12);
  });
  it('formats lengths and dimensions', () => {
    expect(formatLength(12.345)).toBe('12.35');
    expect(formatLength(12)).toBe('12.00');
    expect(formatLength(1, 'cm')).toBe('2.54');
    expect(formatDims({ length: 12, width: 8, height: 4 })).toBe('12.00 × 8.00 × 4.00');
  });
});
