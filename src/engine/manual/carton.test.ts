import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, OrientationCode, ProductAxis } from '../../domain/types';
import { NAMED_CASES, randomCases } from '../autoBaseline.testSupport';
import { generateCartonCandidates } from '../packing/cartons';
import {
  boxAxisAlong,
  canonicalFacing,
  cartonFlags,
  cartonWeight,
  designCarton,
  designFlags,
  designedSize,
  designOf,
  facingsFor,
  sideDownChoices,
  verticalAxis,
  type CartonDesign,
} from './carton';

const AXES: ProductAxis[] = ['L', 'W', 'H'];
const asInputs = (i: object): Inputs => ({ ...DEFAULT_INPUTS, ...i });

describe('designCarton', () => {
  it('puts each count on the box dimension the facing lays along that carton side', () => {
    // Box 12 x 8 x 4, leeway 0.5, walls 0.25: outer = n x size + 1.
    const design: CartonDesign = {
      counts: { length: 3, width: 2, height: 1 },
      facing: 'WHL',
      sideDown: 'base',
    };
    const c = designCarton(design, DEFAULT_INPUTS);
    expect(c.counts).toEqual({ W: 3, H: 2, L: 1 });
    expect(c.boxesPerCarton).toBe(6);
    expect(c.inner).toEqual({ W: 24.5, H: 8.5, L: 12.5 });
    expect(c.outer).toEqual({ W: 25, H: 9, L: 13 });
    expect(designedSize(design, c, 'outer')).toEqual({ length: 25, width: 9, height: 13 });
    expect(designedSize(design, c, 'inner')).toEqual({ length: 24.5, width: 8.5, height: 12.5 });
    expect(c.utilization).toBeCloseTo((6 * 12 * 8 * 4) / (25 * 9 * 13), 12);
    expect(c.emptyVolume).toBeCloseTo(25 * 9 * 13 - 6 * 12 * 8 * 4, 9);
  });

  it('equals every calculated carton exactly, from its counts and each facing', () => {
    const cases = [...NAMED_CASES, ...randomCases(25)];
    let checked = 0;
    for (const { inputs } of cases) {
      const i = asInputs(inputs);
      for (const c of generateCartonCandidates(i).slice(0, 40)) {
        for (const vertical of AXES) {
          const design = designOf(c, vertical);
          expect(designCarton(design, i)).toEqual(c);
          expect(verticalAxis(design)).toBe(vertical);
          checked++;
        }
        // Any facing, with the counts laid along the matching sides, gives the same carton.
        for (const facing of ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'] as OrientationCode[]) {
          const counts = {
            length: c.counts[boxAxisAlong(facing, 'length')],
            width: c.counts[boxAxisAlong(facing, 'width')],
            height: c.counts[boxAxisAlong(facing, 'height')],
          };
          expect(designCarton({ counts, facing }, i)).toEqual(c);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('designOf makes the longer base side the length', () => {
    const [c] = generateCartonCandidates(DEFAULT_INPUTS);
    const design = designOf(c!, 'H');
    const size = designedSize(design, c!, 'outer');
    expect(size.length).toBeGreaterThanOrEqual(size.width);
    expect(size.height).toBe(c!.outer.H);
    expect(design.sideDown).toBe('base');
  });

  it('gives the carton weight only when the box weight is set', () => {
    const design: CartonDesign = {
      counts: { length: 2, width: 2, height: 1 },
      facing: 'LWH',
      sideDown: 'base',
    };
    const c = designCarton(design, DEFAULT_INPUTS);
    expect(cartonWeight(c, DEFAULT_INPUTS)).toBeNull();
    const weighed = asInputs({
      weights: { productBox: 3, maxPallet: null, emptyCarton: 1.5, pallet: 40 },
    });
    expect(cartonWeight(c, weighed)).toBe(13.5);
  });
});

describe('facingsFor', () => {
  it('gives six facings for a box with three different sides', () => {
    expect(facingsFor({ length: 12, width: 8, height: 4 })).toEqual([
      'LWH',
      'WLH',
      'LHW',
      'HLW',
      'WHL',
      'HWL',
    ]);
  });

  it('merges facings that look the same when two sides are equal', () => {
    const f = facingsFor({ length: 8, width: 8, height: 4 });
    expect(f).toEqual(['LWH', 'LHW', 'HLW']);
    expect(canonicalFacing('WLH', { length: 8, width: 8, height: 4 })).toBe('LWH');
    expect(canonicalFacing('WHL', { length: 8, width: 8, height: 4 })).toBe('LHW');
    expect(canonicalFacing('HWL', { length: 8, width: 8, height: 4 })).toBe('HLW');
    expect(facingsFor({ length: 12, width: 4, height: 4 })).toHaveLength(3);
    expect(facingsFor({ length: 4, width: 8, height: 4 })).toHaveLength(3);
  });

  it('gives one facing for a cube', () => {
    expect(facingsFor({ length: 5, width: 5, height: 5 })).toEqual(['LWH']);
  });

  it('every merged facing gives a carton of the same size as the one kept', () => {
    const i = asInputs({ product: { length: 8, width: 8, height: 4 } });
    const counts = { length: 2, width: 3, height: 1 };
    for (const facing of ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'] as OrientationCode[]) {
      const kept = canonicalFacing(facing, i.product);
      const p = designedSize({ facing }, designCarton({ counts, facing }, i), 'outer');
      const q = designedSize({ facing: kept }, designCarton({ counts, facing: kept }, i), 'outer');
      expect(p).toEqual(q);
    }
  });
});

describe('side down', () => {
  it('names the box dimension pointing up for each face down', () => {
    expect(verticalAxis({ facing: 'WLH', sideDown: 'base' })).toBe('H');
    expect(verticalAxis({ facing: 'WLH', sideDown: 'side' })).toBe('L');
    expect(verticalAxis({ facing: 'WLH', sideDown: 'end' })).toBe('W');
  });

  it('lists the three ways the carton can stand with their base and height', () => {
    const design = { counts: { length: 2, width: 1, height: 1 }, facing: 'LWH' as const };
    const c = designCarton(design, DEFAULT_INPUTS); // outer L 25, W 9, H 5
    const choices = sideDownChoices(design, c);
    expect(choices.map((s) => [s.sideDown, s.vertical, s.height])).toEqual([
      ['base', 'H', 5],
      ['side', 'W', 9],
      ['end', 'L', 25],
    ]);
    expect(choices[0]?.base).toEqual({ a: 25, b: 9 });
    expect(choices[2]?.base).toEqual({ a: 9, b: 5 });
  });
});

describe('cartonFlags', () => {
  const design = (l: number, w: number, h: number): CartonDesign => ({
    counts: { length: l, width: w, height: h },
    facing: 'LWH',
    sideDown: 'base',
  });

  it('is all clear for a calculated carton', () => {
    for (const c of generateCartonCandidates(DEFAULT_INPUTS).slice(0, 20)) {
      const f = cartonFlags(c, 'H', DEFAULT_INPUTS);
      expect(f.overMaximum).toEqual([]);
      expect(f.blocked).toBeNull();
      expect(f.orientationNotAllowed).toBe(false);
    }
  });

  it('names the sides over the maximum carton size and by how much', () => {
    // Maximum 24 x 18 x 16. Carton 3 x 2 x 2 of 12 x 8 x 4: outer 37 x 17 x 9.
    const f = designFlags(design(3, 2, 2), DEFAULT_INPUTS);
    expect(f.overMaximum).toEqual([{ side: 'longest', size: 37, max: 24, by: 13 }]);
    expect(f.blocked).toBeNull();
    // 2 x 3 x 5: outer 25 x 25 x 21, sorted 25, 25, 21 against 24, 18, 16.
    expect(designFlags(design(2, 3, 5), DEFAULT_INPUTS).overMaximum).toEqual([
      { side: 'longest', size: 25, max: 24, by: 1 },
      { side: 'middle', size: 25, max: 18, by: 7 },
      { side: 'shortest', size: 21, max: 16, by: 5 },
    ]);
  });

  it('compares sorted sides, as the search does: a carton that fits turned is not over', () => {
    const i = asInputs({ maxCarton: { length: 10, width: 30, height: 20 } });
    // outer 25 x 17 x 9 fits 30 x 20 x 10 sorted.
    expect(designFlags(design(2, 2, 2), i).overMaximum).toEqual([]);
  });

  it('counts a size at the maximum within tolerance as fitting', () => {
    const i = asInputs({ maxCarton: { length: 25 - 1e-12, width: 17, height: 9 } });
    expect(designFlags(design(2, 2, 2), i).overMaximum).toEqual([]);
  });

  it('blocks a carton whose base fits the usable footprint neither way round', () => {
    // Pallet 50 x 42. 5 boxes long: outer 61 x 9.
    const f = designFlags(design(5, 1, 1), DEFAULT_INPUTS);
    expect(f.cannotFitFootprint).toBe(true);
    expect(f.blocked).toBe('footprint');
    // 49 long fits only along the pallet's length; turned it would not, which is fine.
    expect(designFlags(design(4, 1, 1), DEFAULT_INPUTS).blocked).toBeNull();
    // The overhang counts as footprint.
    expect(designFlags(design(5, 1, 1), asInputs({ overhang: 11 })).blocked).toBeNull();
  });

  it('blocks a carton taller than the usable height, with the excess', () => {
    const i = asInputs({ pallet: { length: 50, width: 42, height: 20 } });
    const f = designFlags(design(1, 1, 4), i); // 17 tall, 15 usable
    expect(f.overHeightBy).toBe(2);
    expect(f.blocked).toBe('height');
    expect(designFlags({ ...design(1, 1, 4), sideDown: 'side' }, i).overHeightBy).toBeNull();
  });

  it('notes a box standing a way up the rotation inputs do not allow', () => {
    const i = asInputs({ rotationMode: 'upright' });
    expect(designFlags(design(1, 1, 1), i).orientationNotAllowed).toBe(false);
    const onSide = designFlags({ ...design(1, 1, 1), facing: 'LHW' }, i);
    expect(onSide.orientationNotAllowed).toBe(true);
    expect(onSide.blocked).toBeNull();
  });
});
