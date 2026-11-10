import type { CartonCandidate, Inputs, ProductAxis } from '../../domain/types';
import { productSize, volumeOf } from './geometry';
import { fitsCount, fitsWithin } from './tolerance';

const AXES: ProductAxis[] = ['L', 'W', 'H'];

export function cartonKey(c: CartonCandidate): string {
  return `${c.counts.L}x${c.counts.W}x${c.counts.H}`;
}

function descending(values: [number, number, number]): [number, number, number] {
  const [a, b, c] = [...values].sort((x, y) => y - x);
  return [a as number, b as number, c as number];
}

/** Physical identity of a carton: the multiset of (product size, count) pairs. */
function physicalKey(
  size: Record<ProductAxis, number>,
  counts: Record<ProductAxis, number>,
): string {
  return AXES.map((a) => `${size[a]}:${counts[a]}`)
    .sort()
    .join('|');
}

/** At most this many candidates are kept (those with the most boxes per carton). */
export const MAX_CARTON_CANDIDATES = 8000;

/** Enumeration stops after this many valid count triples; only very small products reach it. */
const MAX_VALID_TRIPLES = 500000;

/** Every carton that can be built from the product within the maximum carton size. */
export function generateCartonCandidates(i: Inputs): CartonCandidate[] {
  return generateCartonCandidatesWithInfo(i).candidates;
}

/** The distinct boxes per carton that some carton can hold, ascending (boxesPerCarton ignored). */
export function achievableCounts(i: Inputs): number[] {
  const { candidates } = generateCartonCandidatesWithInfo({ ...i, boxesPerCarton: null });
  return [...new Set(candidates.map((c) => c.boxesPerCarton))].sort((a, b) => a - b);
}

/**
 * Candidates sorted by boxes per carton (descending) then key, and whether the list was cut
 * short: by the enumeration limit, or by keeping only the MAX_CARTON_CANDIDATES biggest.
 * With `boxesPerCarton` set to N, only cartons of exactly N boxes, enumerated from the
 * factorizations of N, so neither limit applies and the list is never cut short.
 */
export function generateCartonCandidatesWithInfo(i: Inputs): {
  candidates: CartonCandidate[];
  truncated: boolean;
} {
  const size = productSize(i);
  const productVolume = volumeOf(size);
  const { leeway, wallThickness } = i;
  const maxSorted = descending([i.maxCarton.length, i.maxCarton.width, i.maxCarton.height]);
  const bound = maxSorted[0];
  const limit = {
    L: fitsCount(bound, size.L),
    W: fitsCount(bound, size.W),
    H: fitsCount(bound, size.H),
  };
  const outerOf = (count: number, axisSize: number): number =>
    count * axisSize + leeway + 2 * wallThickness;
  /** The sorted-fit rule: the carton's sorted outer sizes fit the sorted maximum carton. */
  const fits = (l: number, w: number, h: number): boolean =>
    descending([outerOf(l, size.L), outerOf(w, size.W), outerOf(h, size.H)]).every((v, idx) =>
      fitsWithin(v, maxSorted[idx] as number),
    );

  const seen = new Set<string>();
  const result: CartonCandidate[] = [];
  /** Adds the carton unless, under full rotation, a physically identical one is already in. */
  const add = (l: number, w: number, h: number): void => {
    const counts = { L: l, W: w, H: h };
    if (i.rotationMode === 'full') {
      const key = physicalKey(size, counts);
      if (seen.has(key)) return;
      seen.add(key);
    }

    const inner = {
      L: l * size.L + leeway,
      W: w * size.W + leeway,
      H: h * size.H + leeway,
    };
    const outer = {
      L: inner.L + 2 * wallThickness,
      W: inner.W + 2 * wallThickness,
      H: inner.H + 2 * wallThickness,
    };
    const boxesPerCarton = l * w * h;
    const cartonProductVolume = boxesPerCarton * productVolume;
    const outerVolume = volumeOf(outer);
    result.push({
      counts,
      inner,
      outer,
      boxesPerCarton,
      utilization: cartonProductVolume / outerVolume,
      emptyVolume: outerVolume - cartonProductVolume,
    });
  };

  const n = i.boxesPerCarton;
  if (n !== null) {
    // Only divisors of N, each bounded by its axis limit, in the same (l, w) order as below so
    // the merge keeps the same carton of each physical pair.
    for (let l = 1; l <= Math.min(limit.L, n); l++) {
      if (n % l !== 0) continue;
      const rest = n / l;
      for (let w = 1; w <= Math.min(limit.W, rest); w++) {
        if (rest % w !== 0) continue;
        const h = rest / w;
        if (h <= limit.H && fits(l, w, h)) add(l, w, h);
      }
    }
    return { candidates: sortCandidates(result), truncated: false };
  }

  let validTriples = 0;
  let truncated = false;

  // Growing any count only makes the carton larger, so once a count no longer fits, every
  // larger count on that axis is skipped too (and the enclosing loop stops if even 1 fails).
  enumerate: for (let l = 1; l <= limit.L; l++) {
    let anyW = false;
    for (let w = 1; w <= limit.W; w++) {
      let anyH = false;
      for (let h = 1; h <= limit.H; h++) {
        if (!fits(l, w, h)) break;
        anyH = true;
        if (++validTriples > MAX_VALID_TRIPLES) {
          truncated = true;
          break enumerate;
        }
        add(l, w, h);
      }
      if (!anyH) break;
      anyW = true;
    }
    if (!anyW) break;
  }

  const sorted = sortCandidates(result);
  if (sorted.length > MAX_CARTON_CANDIDATES) truncated = true;
  return { candidates: sorted.slice(0, MAX_CARTON_CANDIDATES), truncated };
}

/** Boxes per carton descending, then key ascending. */
function sortCandidates(list: CartonCandidate[]): CartonCandidate[] {
  const keyed = list.map((c) => ({ c, key: cartonKey(c) }));
  keyed.sort((a, b) => {
    if (b.c.boxesPerCarton !== a.c.boxesPerCarton) return b.c.boxesPerCarton - a.c.boxesPerCarton;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return keyed.map((k) => k.c);
}
