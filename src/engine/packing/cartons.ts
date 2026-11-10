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
function physicalKey(size: Record<ProductAxis, number>, counts: Record<ProductAxis, number>): string {
  return AXES.map((a) => `${size[a]}:${counts[a]}`)
    .sort()
    .join('|');
}

/** Every carton that can be built from the product within the maximum carton size. */
export function generateCartonCandidates(i: Inputs): CartonCandidate[] {
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

  const seen = new Set<string>();
  const result: CartonCandidate[] = [];

  for (let l = 1; l <= limit.L; l++) {
    for (let w = 1; w <= limit.W; w++) {
      for (let h = 1; h <= limit.H; h++) {
        const counts = { L: l, W: w, H: h };
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
        const outerSorted = descending([outer.L, outer.W, outer.H]);
        if (!outerSorted.every((v, idx) => fitsWithin(v, maxSorted[idx] as number))) continue;

        if (i.rotationMode === 'full') {
          const key = physicalKey(size, counts);
          if (seen.has(key)) continue;
          seen.add(key);
        }

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
      }
    }
  }

  return result.sort((a, b) => {
    if (b.boxesPerCarton !== a.boxesPerCarton) return b.boxesPerCarton - a.boxesPerCarton;
    const ka = cartonKey(a);
    const kb = cartonKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
