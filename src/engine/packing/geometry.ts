import { PALLET_HEIGHT } from '../../domain/constants';
import type { Block, Inputs, ProductAxis } from '../../domain/types';

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

/** An axis-aligned rectangle in a layer's frame: minimum corner and size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The carton rectangles of a layer's blocks, block by block, row by row, in the same order and
 * convention as the placements: an unrotated block lays `a` along x and `b` along y, a rotated
 * one `b` along x and `a` along y; a block's cartons start at its (x, y).
 */
export function blockCartonRects(blocks: readonly Block[], a: number, b: number): Rect[] {
  const out: Rect[] = [];
  for (const blk of blocks) {
    const w = blk.rotated ? b : a;
    const h = blk.rotated ? a : b;
    for (let row = 0; row < blk.rows; row++) {
      for (let col = 0; col < blk.cols; col++) {
        out.push({ x: blk.x + col * w, y: blk.y + row * h, w, h });
      }
    }
  }
  return out;
}
