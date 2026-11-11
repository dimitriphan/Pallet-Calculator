import type { CartonCandidate, Inputs } from '../../domain/types';

/**
 * Totals within this fraction of the maximum count as at the maximum, so unit rounding (a kg
 * maximum read back in pounds) cannot turn an exact fit into an overload. "Never over the
 * maximum" therefore holds up to this relative tolerance: about a millionth of a pound on a
 * 1000 lb maximum.
 */
export const WEIGHT_TOLERANCE = 1e-9;

/** Whether `total` is at or under `max`, up to WEIGHT_TOLERANCE. */
export function withinMax(total: number, max: number): boolean {
  return total <= max + Math.abs(max) * WEIGHT_TOLERANCE;
}

/** Whether a maximum pallet weight applies: it needs both the maximum and the box weight. */
export function weightLimited(i: Inputs): boolean {
  return i.weights.productBox !== null && i.weights.maxPallet !== null;
}

/**
 * The most full cartons of `c` that fit under the maximum with the pallet: 0 when even one is
 * over, Infinity without a limit. Exact (up to the tolerance), so it is a true upper bound.
 */
export function maxCartonsByWeight(c: CartonCandidate, i: Inputs): number {
  const { productBox: box, maxPallet: max, emptyCarton, pallet } = i.weights;
  if (box === null || max === null) return Infinity;
  const perCarton = emptyCarton + c.boxesPerCarton * box;
  if (!(perCarton > 0)) return Infinity;
  if (!withinMax(pallet, max)) return 0;
  let n = Math.max(0, Math.floor((max - pallet) / perCarton));
  while (n > 0 && !withinMax(pallet + n * perCarton, max)) n--;
  while (withinMax(pallet + (n + 1) * perCarton, max)) n++;
  return n;
}

/** Most products `c` could put on the pallet under the maximum; Infinity without a limit. */
export function weightBound(c: CartonCandidate, i: Inputs): number {
  const n = maxCartonsByWeight(c, i);
  return n === Infinity ? Infinity : c.boxesPerCarton * n;
}
