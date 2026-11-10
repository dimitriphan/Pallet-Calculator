import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('is 21 for black on white, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1 for identical colours', () => {
    expect(contrastRatio('#3F8F96', '#3F8F96')).toBeCloseTo(1, 5);
  });

  it('gives 11.29 for foam on deep', () => {
    expect(contrastRatio('#E9F1EE', '#1E3347').toFixed(2)).toBe('11.29');
  });
});
