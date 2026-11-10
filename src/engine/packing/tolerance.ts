import { EPS } from '../../domain/constants';

/** How many items of `size` fit in `space`, tolerant of floating-point error. */
export function fitsCount(space: number, size: number): number {
  if (size <= 0) return 0;
  return Math.floor((space + EPS) / size);
}

/** Whether `size` fits within `space`, tolerant of floating-point error. */
export function fitsWithin(size: number, space: number): boolean {
  return size <= space + EPS;
}
