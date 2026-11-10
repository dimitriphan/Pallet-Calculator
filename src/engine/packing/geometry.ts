import { PALLET_HEIGHT } from '../../domain/constants';
import type { Inputs, ProductAxis } from '../../domain/types';

/** Footprint available for cartons: pallet length/width plus the allowed overhang. */
export function usableFootprint(i: Inputs): { x: number; y: number } {
  return { x: i.pallet.length + i.overhang, y: i.pallet.width + i.overhang };
}

/** Stacking height above the built-in pallet. */
export function usableHeight(i: Inputs): number {
  return i.pallet.height - PALLET_HEIGHT;
}

export function availableVolume(i: Inputs): number {
  const { x, y } = usableFootprint(i);
  return x * y * usableHeight(i);
}

export function productSize(i: Inputs): Record<ProductAxis, number> {
  return { L: i.product.length, W: i.product.width, H: i.product.height };
}

export function volumeOf(size: Record<ProductAxis, number>): number {
  return size.L * size.W * size.H;
}
