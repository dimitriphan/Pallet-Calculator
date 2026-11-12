/**
 * Test support for "the default settings give exactly what the optimizer gave before Round 5".
 * A fixed list of inputs (the named optimizer fixtures and a seeded random run) and a digest
 * of a result. The digests in fixtures/autoBaseline.json were recorded at da0f83c, before the
 * minimum stability and layer pattern settings existed. Not used by application code.
 */
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs, OptimizeResult, RotationMode } from '../domain/types';
import { PINWHEEL_INPUTS } from './packing/testSupport';

/** Inputs as they were before Round 5: none of the settings added since. */
export type LegacyInputs = Omit<Inputs, 'minStability' | 'layerPattern'>;

export interface BaselineCase {
  name: string;
  inputs: LegacyInputs;
}

export interface BaselineRecord {
  hash: string;
  /** Per rank: layout id, products and rating; readable when a hash differs. */
  layouts: string[];
  emptyReason: string | null;
}

function legacy(i: Inputs | LegacyInputs): LegacyInputs {
  const { minStability: _minStability, layerPattern: _layerPattern, ...rest } = i as Inputs;
  void _minStability;
  void _layerPattern;
  return rest;
}

const CUBES: LegacyInputs = {
  ...legacy(DEFAULT_INPUTS),
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};

const D = legacy(DEFAULT_INPUTS);
const P = legacy(PINWHEEL_INPUTS);

/** The inputs the optimizer tests are pinned on. */
export const NAMED_CASES: BaselineCase[] = [
  { name: 'default', inputs: D },
  { name: 'cubes', inputs: CUBES },
  { name: 'pinwheel', inputs: P },
  { name: 'pinwheel, overhang, upright', inputs: { ...P, overhang: 2, keepCartonsUpright: true } },
  {
    name: 'overhang, target, six per carton',
    inputs: { ...D, overhang: 2, targetQuantity: 150, boxesPerCarton: 6, rotationMode: 'upright' },
  },
  { name: 'small product', inputs: { ...D, product: { length: 6, width: 4, height: 3 } } },
  {
    name: 'weight limit',
    inputs: { ...D, weights: { ...D.weights, productBox: 3, maxPallet: 500 } },
  },
  {
    name: 'pinwheel too heavy',
    inputs: {
      ...P,
      rotationMode: 'upright',
      weights: { ...P.weights, productBox: 10, maxPallet: 130 },
    },
  },
  { name: 'nothing fits', inputs: { ...D, product: { length: 30, width: 30, height: 30 } } },
  { name: 'no carton of seven', inputs: { ...CUBES, boxesPerCarton: 7 } },
];

/** A small seeded generator (mulberry32): the same numbers on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODES: RotationMode[] = ['full', 'upright', 'noSide'];

/**
 * `count` random inputs, sized so each search finishes well inside the time budget (a result
 * cut short by the clock would not be repeatable).
 */
export function randomCases(count: number, seed = 20261112): BaselineCase[] {
  const rnd = mulberry32(seed);
  const pick = (lo: number, hi: number, step: number) =>
    lo + Math.floor(rnd() * (Math.floor((hi - lo) / step) + 1)) * step;
  const out: BaselineCase[] = [];
  for (let k = 0; k < count; k++) {
    const product = { length: pick(4, 18, 0.5), width: pick(3, 14, 0.5), height: pick(2, 14, 0.5) };
    const factor = () => 1 + Math.floor(rnd() * 3);
    const leeway = pick(0, 0.5, 0.25);
    const wallThickness = pick(0, 0.25, 0.125);
    const room = leeway + 2 * wallThickness;
    const weighed = rnd() < 0.3;
    const inputs: LegacyInputs = {
      pallet: { length: pick(36, 60, 2), width: pick(32, 48, 2), height: pick(30, 84, 3) },
      product,
      maxCarton: {
        length: product.length * factor() + room + pick(0, 2, 0.5),
        width: product.width * factor() + room + pick(0, 2, 0.5),
        height: product.height * factor() + room + pick(0, 2, 0.5),
      },
      targetQuantity: rnd() < 0.15 ? pick(10, 200, 10) : null,
      boxesPerCarton: rnd() < 0.15 ? 1 + Math.floor(rnd() * 6) : null,
      leeway,
      wallThickness,
      overhang: rnd() < 0.3 ? pick(0.5, 2, 0.5) : 0,
      rotationMode: MODES[Math.floor(rnd() * MODES.length)] as RotationMode,
      customOrientations: [],
      keepCartonsUpright: rnd() < 0.25,
      weights: {
        productBox: weighed ? pick(0.5, 6, 0.5) : null,
        maxPallet: weighed && rnd() < 0.7 ? pick(200, 1500, 100) : null,
        emptyCarton: weighed ? pick(0, 1, 0.5) : 0,
        pallet: 40,
      },
    };
    out.push({ name: `random ${k}`, inputs });
  }
  return out;
}

/** JSON with object keys in a fixed order, so the digest does not depend on how a result is built. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** cyrb53: a 53-bit string hash; two seeds side by side make a chance match negligible. */
function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let k = 0; k < text.length; k++) {
    const ch = text.charCodeAt(k);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Everything in the result, as a digest, with a readable line per layout. */
export function digest(result: OptimizeResult): BaselineRecord {
  const text = canonical(result);
  return {
    hash: `${cyrb53(text, 1)}${cyrb53(text, 2)}`,
    layouts: result.layouts.map(
      (r) =>
        `${r.rank} ${r.layout.id} ${r.layout.totalProducts} ${r.layout.stability?.rating ?? '-'}`,
    ),
    emptyReason: result.emptyReason,
  };
}
