/**
 * Geometry invariant checks shared by engine tests. Pure functions that return counts,
 * so each test decides what to expect. Not used by application code.
 */
import { DEFAULT_INPUTS, EPS } from '../../domain/constants';
import type { Inputs } from '../../domain/types';

export interface Box3 {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Number of box pairs whose interiors overlap by more than EPS on all three axes.
 * Sweep along x: boxes are sorted by their minimum x, and each box is compared only with
 * later boxes that start before its own maximum x. A layered load has many boxes per layer
 * spread along x, so this stays far below n^2 comparisons for thousands of boxes.
 */
export function overlappingPairs(boxes: readonly Box3[]): number {
  const sorted = [...boxes].sort((p, q) => p.x - q.x || p.y - q.y || p.z - q.z);
  let pairs = 0;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as Box3;
    const pEnd = p.x + p.dx;
    for (let k = i + 1; k < sorted.length; k++) {
      const q = sorted[k] as Box3;
      if (q.x >= pEnd - EPS) break; // nothing later can overlap p along x
      if (overlap(p.y, p.dy, q.y, q.dy) && overlap(p.z, p.dz, q.z, q.dz)) pairs++;
    }
  }
  return pairs;
}

function overlap(a: number, da: number, b: number, db: number): boolean {
  return Math.min(a + da, b + db) - Math.max(a, b) > EPS;
}

/** Number of boxes that are not inside [0, size] on every axis (EPS tolerant). */
export function boxesOutside(
  boxes: readonly Box3[],
  size: { x: number; y: number; z: number },
): number {
  const space: Box3 = { x: 0, y: 0, z: 0, dx: size.x, dy: size.y, dz: size.z };
  return boxes.filter((b) => !isInside(b, space, 0)).length;
}

/** Whether `inner` lies inside `outer` with at least `clearance` on every side (EPS tolerant). */
export function isInside(inner: Box3, outer: Box3, clearance: number): boolean {
  return (
    inner.x >= outer.x + clearance - EPS &&
    inner.y >= outer.y + clearance - EPS &&
    inner.z >= outer.z + clearance - EPS &&
    inner.x + inner.dx <= outer.x + outer.dx - clearance + EPS &&
    inner.y + inner.dy <= outer.y + outer.dy - clearance + EPS &&
    inner.z + inner.dz <= outer.z + outer.dz - clearance + EPS
  );
}

/**
 * The pinned realistic pinwheel case, as a user types it: pallet 48 x 40 x 60 in, product and
 * maximum carton 16.5 x 10.5 x 18 in, no leeway or walls (so the carton is the product).
 * Standing on its height the carton lays 10 to a layer in a pinwheel; straight cuts fit 9.
 * The best layout is three pinwheel layers, 30 products; without pinwheels it was 27.
 */
export const PINWHEEL_INPUTS: Inputs = {
  ...DEFAULT_INPUTS,
  pallet: { length: 48, width: 40, height: 60 },
  product: { length: 16.5, width: 10.5, height: 18 },
  maxCarton: { length: 16.5, width: 10.5, height: 18 },
  leeway: 0,
  wallThickness: 0,
};
