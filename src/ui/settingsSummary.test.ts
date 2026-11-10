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
});
