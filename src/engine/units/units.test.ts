import { describe, expect, it } from 'vitest';
import {
  areaLabel,
  formatArea,
  formatDims,
  formatLength,
  formatVolume,
  formatWeight,
  fromInches,
  fromPounds,
  LENGTH_DECIMALS,
  toInches,
  toPounds,
  volumeLabel,
  WEIGHT_DECIMALS,
  weightUnitFor,
} from './units';

describe('units', () => {
  it('converts to and from inches', () => {
    expect(toInches(2.54, 'cm')).toBeCloseTo(1, 12);
    expect(toInches(25.4, 'mm')).toBeCloseTo(1, 12);
    expect(toInches(7, 'in')).toBe(7);
    expect(fromInches(1, 'mm')).toBeCloseTo(25.4, 12);
    expect(fromInches(1, 'cm')).toBeCloseTo(2.54, 12);
  });

  it('formats lengths and dimensions at the precision of the unit', () => {
    expect(LENGTH_DECIMALS).toEqual({ in: 2, cm: 1, mm: 0 });
    expect(formatLength(12.345)).toBe('12.35');
    expect(formatLength(12)).toBe('12.00');
    expect(formatLength(1, 'cm')).toBe('2.5');
    expect(formatLength(12, 'cm')).toBe('30.5');
    expect(formatLength(12, 'mm')).toBe('305');
    expect(formatDims({ length: 12, width: 8, height: 4 })).toBe('12.00 × 8.00 × 4.00');
    expect(formatDims({ length: 12, width: 8, height: 4 }, 'cm')).toBe('30.5 × 20.3 × 10.2');
    expect(formatDims({ length: 12, width: 8, height: 4 }, 'mm')).toBe('305 × 203 × 102');
  });

  it('derives the weight unit and converts pounds', () => {
    expect(weightUnitFor('in')).toBe('lb');
    expect(weightUnitFor('cm')).toBe('kg');
    expect(weightUnitFor('mm')).toBe('kg');
    expect(fromPounds(10, 'kg')).toBeCloseTo(4.5359, 4);
    expect(fromPounds(10, 'lb')).toBe(10);
    expect(toPounds(4.5359237, 'kg')).toBeCloseTo(10, 6);
    for (const v of [0.1, 1, 12.345, 2000]) {
      expect(Math.abs(toPounds(fromPounds(v, 'kg'), 'kg') - v)).toBeLessThan(1e-9);
    }
  });

  it('formats weights as a number only, 1 decimal', () => {
    expect(WEIGHT_DECIMALS).toBe(1);
    expect(formatWeight(10, 'in')).toBe('10.0');
    expect(formatWeight(10, 'cm')).toBe('4.5');
    expect(formatWeight(10, 'mm')).toBe('4.5');
  });

  it('formats volumes in in³ for inches and cm³ otherwise', () => {
    expect(formatVolume(1728, 'in')).toBe('1728.00');
    expect(formatVolume(1728, 'cm')).toBe('28316.8');
    expect(formatVolume(1728, 'mm')).toBe('28316.8');
    expect(volumeLabel('in')).toBe('in³');
    expect(volumeLabel('cm')).toBe('cm³');
    expect(volumeLabel('mm')).toBe('cm³');
  });

  it('formats areas in in² for inches and cm² otherwise', () => {
    expect(formatArea(144, 'in')).toBe('144.00');
    expect(formatArea(144, 'cm')).toBe('929.0');
    expect(areaLabel('in')).toBe('in²');
    expect(areaLabel('mm')).toBe('cm²');
  });
});
