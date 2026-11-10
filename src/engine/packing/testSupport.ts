/**
 * Geometry invariant checks shared by engine tests. Pure functions that return counts,
 * so each test decides what to expect. Not used by application code.
 */
import { EPS } from '../../domain/constants';

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
