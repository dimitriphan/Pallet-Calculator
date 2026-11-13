import { describe, expect, it } from 'vitest';
import type { ManualFlag } from '../engine/manual/build';
import type { CartonFlags } from '../engine/manual/carton';
import {
  cannotSaveText,
  cartonBlockedText,
  cartonFlagList,
  flagLines,
  flagText,
} from './manualFlags';

const CLEAR: CartonFlags = {
  overMaximum: [],
  cannotFitFootprint: false,
  overHeightBy: null,
  orientationNotAllowed: false,
  blocked: null,
};

describe('flagText (spec 6.3)', () => {
  it('says how many cartons overhang and by how much, in the unit', () => {
    expect(flagText({ kind: 'overhang', cartons: 3, by: 1.5 }, 'in')).toBe(
      '3 cartons overhang the allowed footprint by up to 1.50 in',
    );
    expect(flagText({ kind: 'overhang', cartons: 1, by: 1 }, 'cm')).toBe(
      '1 carton overhangs the allowed footprint by up to 2.5 cm',
    );
  });

  it('names the side a carton is over the maximum on', () => {
    const one: ManualFlag = {
      kind: 'overMaximum',
      sides: [{ side: 'longest', size: 25, max: 24, by: 1 }],
    };
    expect(flagText(one, 'in')).toBe(
      'Carton is over the maximum carton size by 1.00 in (longest side)',
    );
    const three: ManualFlag = {
      kind: 'overMaximum',
      sides: [
        { side: 'longest', size: 30, max: 24, by: 6 },
        { side: 'middle', size: 20, max: 18, by: 2 },
        { side: 'shortest', size: 17, max: 16, by: 1 },
      ],
    };
    expect(flagText(three, 'mm')).toBe(
      'Carton is over the maximum carton size by 152 mm (longest side), 51 mm (middle side) and 25 mm (shortest side)',
    );
  });

  it('gives the excess weight in the weight unit that goes with the length unit', () => {
    expect(flagText({ kind: 'overWeight', by: 12.34 }, 'in')).toBe(
      'Over the maximum pallet weight by 12.3 lb (one layer is kept)',
    );
    expect(flagText({ kind: 'overWeight', by: 10 }, 'cm')).toBe(
      'Over the maximum pallet weight by 4.5 kg (one layer is kept)',
    );
  });

  it('words the flags that stop a save', () => {
    expect(flagText({ kind: 'overHeight', by: 2 }, 'in')).toBe(
      'Carton is taller than the stacking height by 2.00 in',
    );
    expect(flagText({ kind: 'cannotFit' }, 'in')).toMatch(/too big for the allowed footprint/);
    expect(flagText({ kind: 'empty' }, 'in')).toBe('The layer has no cartons');
    expect(flagText({ kind: 'overlap', pairs: 1 }, 'in')).toBe('1 pair of cartons overlaps');
    expect(flagText({ kind: 'overlap', pairs: 2 }, 'in')).toBe('2 pairs of cartons overlap');
    expect(flagText({ kind: 'invalid' }, 'in')).toBe('This layout cannot be read');
  });
});

describe('flagLines', () => {
  it('puts broken limits before notes and marks the ones that stop a save', () => {
    const lines = flagLines(
      [
        { kind: 'orientationNotAllowed' },
        { kind: 'overhang', cartons: 2, by: 1 },
        { kind: 'empty' },
      ],
      'in',
    );
    expect(lines.map((l) => [l.key, l.tone, l.blocking])).toEqual([
      ['overhang', 'error', false],
      ['empty', 'error', true],
      ['orientationNotAllowed', 'note', false],
    ]);
  });
});

describe('carton flags', () => {
  it('turns the carton step flags into the same flags a layout carries', () => {
    expect(cartonFlagList(CLEAR)).toEqual([]);
    const sides = [{ side: 'longest' as const, size: 25, max: 24, by: 1 }];
    expect(
      cartonFlagList({
        overMaximum: sides,
        cannotFitFootprint: true,
        overHeightBy: 3,
        orientationNotAllowed: true,
        blocked: 'footprint',
      }),
    ).toEqual([
      { kind: 'cannotFit' },
      { kind: 'overHeight', by: 3 },
      { kind: 'overMaximum', sides },
      { kind: 'orientationNotAllowed' },
    ]);
  });

  it('says why a carton cannot go on to the pallet layer', () => {
    expect(cartonBlockedText(CLEAR, 'in')).toBeNull();
    expect(
      cartonBlockedText({ ...CLEAR, cannotFitFootprint: true, blocked: 'footprint' }, 'in'),
    ).toBe(
      'Carton is too big for the allowed footprint, whichever way it is turned. Change the carton to go on to the pallet layer or to save.',
    );
    expect(cartonBlockedText({ ...CLEAR, overHeightBy: 4, blocked: 'height' }, 'cm')).toBe(
      'Carton is taller than the stacking height by 10.2 cm. Change the carton to go on to the pallet layer or to save.',
    );
  });
});

describe('cannotSaveText', () => {
  it('is null when nothing stops a save', () => {
    expect(cannotSaveText([{ kind: 'overhang', cartons: 1, by: 1 }], 'in')).toBeNull();
  });

  it('gives the carton before the empty layer it causes', () => {
    expect(cannotSaveText([{ kind: 'empty' }, { kind: 'cannotFit' }], 'in')).toBe(
      'Cannot be saved: carton is too big for the allowed footprint, whichever way it is turned.',
    );
    expect(cannotSaveText([{ kind: 'empty' }], 'in')).toBe(
      'Cannot be saved: the layer has no cartons.',
    );
  });
});
