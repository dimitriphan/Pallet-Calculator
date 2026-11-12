/**
 * Test support for the manual engine: a seeded generator and a manual layout that overhangs.
 * Not used by application code.
 */
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Inputs, Layout, OptimizeResult } from '../../domain/types';
import { buildManualLayout, madeForOf, type ManualLayoutSpec } from './build';
import type { CartonDesign } from './carton';
import type { ManualCarton } from './layer';

/** A small seeded generator (mulberry32): the same numbers on every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value from lo to hi in steps of `step`. */
export function pick(rnd: () => number, lo: number, hi: number, step: number): number {
  return lo + Math.floor(rnd() * (Math.floor((hi - lo) / step) + 1)) * step;
}

/**
 * Pallet 50 x 42 x 72 with 2 in of overhang (usable footprint 52 x 44, the pallet inset by 1),
 * box 12 x 8 x 4, and a maximum carton the 25 x 17 x 5 test carton is within.
 */
export const OVERHANG_INPUTS: Inputs = {
  ...DEFAULT_INPUTS,
  overhang: 2,
  maxCarton: { length: 26, width: 18, height: 16 },
  weights: { productBox: 2, maxPallet: null, emptyCarton: 1, pallet: 40 },
};

/** A 2 x 2 x 1 carton of the default box: 25 x 17 x 5 outside. */
export const TEST_DESIGN: CartonDesign = {
  counts: { length: 2, width: 2, height: 1 },
  facing: 'LWH',
  sideDown: 'base',
};

/**
 * Cartons that break every assumption a calculated layer keeps: one at a negative position
 * (3 in off the left and 2 in off the back), one reaching 5 in past the right edge, one
 * turned 90° wholly inside. Nothing overlaps; the layer is not centred.
 */
export const OVERHANGING_CARTONS: ManualCarton[] = [
  { x: -3, y: -2, rotated: false },
  { x: 32, y: 20, rotated: false },
  { x: 5, y: 16, rotated: true },
];

export function manualSpec(over: Partial<ManualLayoutSpec> = {}, inputs = OVERHANG_INPUTS) {
  const design = over.design ?? TEST_DESIGN;
  return {
    id: 'test',
    name: 'Manual 1',
    design,
    cartons: OVERHANGING_CARTONS,
    upperLayers: 'alternate' as const,
    madeFor: madeForOf(design, inputs),
    ...over,
  };
}

/** The overhanging manual layout, alternate layers turned, under OVERHANG_INPUTS. */
export function overhangingLayout(over: Partial<ManualLayoutSpec> = {}, inputs = OVERHANG_INPUTS) {
  return buildManualLayout(manualSpec(over, inputs), inputs).layout;
}

/** A result holding one layout, as the screens and exports take a selected layout. */
export function resultOf(layout: Layout): OptimizeResult {
  return {
    layouts: [
      {
        rank: 1,
        layout,
        score: {
          quantity: 0,
          utilization: 0,
          space: 0,
          quantityContribution: 0,
          utilizationContribution: 0,
          spaceContribution: 0,
          total: 0,
        },
        explanation: '',
      },
    ],
    candidatesEvaluated: 0,
    emptyReason: null,
    truncated: false,
  };
}
