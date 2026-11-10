import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import { availableVolume, productSize, usableFootprint, usableHeight, volumeOf } from './geometry';

describe('geometry', () => {
  it('adds overhang to the footprint', () => {
    expect(usableFootprint({ ...DEFAULT_INPUTS, overhang: 2 })).toEqual({ x: 52, y: 44 });
  });
  it('subtracts the pallet height from the usable height', () => {
    expect(usableHeight(DEFAULT_INPUTS)).toBe(67);
  });
  it('computes available volume', () => {
    expect(availableVolume(DEFAULT_INPUTS)).toBe(50 * 42 * 67);
  });
  it('maps product dimensions to axes and volume', () => {
    expect(productSize(DEFAULT_INPUTS)).toEqual({ L: 12, W: 8, H: 4 });
    expect(volumeOf({ L: 12, W: 8, H: 4 })).toBe(384);
  });
});
