import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { settingsSummary } from './settingsSummary';

describe('settingsSummary', () => {
  it('describes the default inputs', () => {
    expect(settingsSummary(DEFAULT_INPUTS)).toBe(
      'Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable.',
    );
  });

  it('includes overhang, upright rules and target, never boxes per carton', () => {
    expect(
      settingsSummary({
        ...DEFAULT_INPUTS,
        overhang: 2,
        rotationMode: 'upright',
        keepCartonsUpright: true,
        targetQuantity: 500,
        boxesPerCarton: 6,
      }),
    ).toBe(
      'Using 0.50 in leeway, 0.25 in carton walls, 2.00 in overhang, product kept upright, cartons kept upright, target 500 boxes.',
    );
  });

  it('describes no side rotation', () => {
    expect(settingsSummary({ ...DEFAULT_INPUTS, rotationMode: 'noSide' })).toContain(
      'no side rotation.',
    );
  });

  it('lists custom orientations in stored order', () => {
    expect(
      settingsSummary({
        ...DEFAULT_INPUTS,
        rotationMode: 'custom',
        customOrientations: ['LWH', 'WLH'],
      }),
    ).toContain('custom orientations (LWH, WLH).');
  });

  it('handles custom with none selected', () => {
    expect(settingsSummary({ ...DEFAULT_INPUTS, rotationMode: 'custom' })).toContain(
      'custom orientations (none).',
    );
  });

  it('says nothing about weight while the box weight is blank', () => {
    expect(
      settingsSummary({
        ...DEFAULT_INPUTS,
        weights: { productBox: null, maxPallet: null, emptyCarton: 3, pallet: 50 },
      }),
    ).toBe('Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable.');
  });

  it('names the pallet and empty carton weights once the box weight is set, in lb or kg', () => {
    const weighed = {
      ...DEFAULT_INPUTS,
      weights: { productBox: 2, maxPallet: 1500, emptyCarton: 1, pallet: 40 },
    };
    expect(settingsSummary(weighed)).toBe(
      'Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable, 40.0 lb pallet, 1.0 lb per empty carton.',
    );
    expect(settingsSummary(weighed, 'cm')).toContain('18.1 kg pallet, 0.5 kg per empty carton.');
    expect(
      settingsSummary({ ...weighed, weights: { ...weighed.weights, emptyCarton: 0 } }),
    ).toContain('fully rotatable, 40.0 lb pallet.');
  });
});
