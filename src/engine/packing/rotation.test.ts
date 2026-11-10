import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import { allowedVerticalAxes } from './rotation';

describe('allowedVerticalAxes', () => {
  it('full allows every axis', () => {
    expect(allowedVerticalAxes(DEFAULT_INPUTS)).toEqual(['L', 'W', 'H']);
  });
  it('upright allows only H', () => {
    expect(allowedVerticalAxes({ ...DEFAULT_INPUTS, rotationMode: 'upright' })).toEqual(['H']);
  });
  it('noSide allows L and H', () => {
    expect(allowedVerticalAxes({ ...DEFAULT_INPUTS, rotationMode: 'noSide' })).toEqual(['L', 'H']);
  });
  it('custom uses the distinct third letters in L, W, H order', () => {
    expect(
      allowedVerticalAxes({
        ...DEFAULT_INPUTS,
        rotationMode: 'custom',
        customOrientations: ['LWH', 'WLH', 'HWL'],
      }),
    ).toEqual(['L', 'H']);
  });
});
