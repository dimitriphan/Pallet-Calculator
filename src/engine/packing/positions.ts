import type { Inputs, Layer, Layout, ProductAxis } from '../../domain/types';
import { productSize, usableFootprint } from './geometry';
import { blocksBounds, footprintAxes } from './stacking';

/** An axis-aligned box in the engine frame (x along pallet length, y along width, z up). */
export interface PlacedBox {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface PlacedCarton extends PlacedBox {
  index: number;
  layerIndex: number;
  /** Which product axis of the carton lies along each engine axis. */
  axes: { x: ProductAxis; y: ProductAxis; z: ProductAxis };
}

/** Offset that centres the layer's blocks (by their bounding box) in the usable footprint. */
export function layerOffset(
  layer: Layer,
  a: number,
  b: number,
  usable: { x: number; y: number },
): { x: number; y: number } {
  const { min, size } = blocksBounds(layer.blocks, a, b);
  return { x: (usable.x - size.x) / 2 - min.x, y: (usable.y - size.y) / 2 - min.y };
}

/** Every carton of the layout: layer by layer, block by block, row by row. */
export function cartonPlacements(l: Layout, i: Inputs): PlacedCarton[] {
  const usable = usableFootprint(i);
  const out: PlacedCarton[] = [];
  l.layers.forEach((layer, layerIndex) => {
    const [fa, fb] = footprintAxes(layer.vertical);
    const a = l.carton.outer[fa];
    const b = l.carton.outer[fb];
    const offset = layerOffset(layer, a, b, usable);
    const dz = l.carton.outer[layer.vertical];
    for (const blk of layer.blocks) {
      const axes = blk.rotated
        ? { x: fb, y: fa, z: layer.vertical }
        : { x: fa, y: fb, z: layer.vertical };
      const dx = l.carton.outer[axes.x];
      const dy = l.carton.outer[axes.y];
      for (let row = 0; row < blk.rows; row++) {
        for (let col = 0; col < blk.cols; col++) {
          out.push({
            index: out.length,
            layerIndex,
            x: offset.x + blk.x + col * dx,
            y: offset.y + blk.y + row * dy,
            z: layer.z,
            dx,
            dy,
            dz,
            axes: { ...axes },
          });
        }
      }
    }
  });
  return out;
}

/**
 * The products inside one placed carton: packed tight in a group that starts at
 * wallThickness + leeway / 2 from the carton's minimum corner on each axis.
 */
export function productsInCarton(l: Layout, i: Inputs, carton: PlacedCarton): PlacedBox[] {
  const size = productSize(i);
  const inset = i.wallThickness + i.leeway / 2;
  const { x: ax, y: ay, z: az } = carton.axes;
  const dx = size[ax];
  const dy = size[ay];
  const dz = size[az];
  const out: PlacedBox[] = [];
  for (let k = 0; k < l.carton.counts[az]; k++) {
    for (let j = 0; j < l.carton.counts[ay]; j++) {
      for (let n = 0; n < l.carton.counts[ax]; n++) {
        out.push({
          x: carton.x + inset + n * dx,
          y: carton.y + inset + j * dy,
          z: carton.z + inset + k * dz,
          dx,
          dy,
          dz,
        });
      }
    }
  }
  return out;
}

/** Every product of the layout, carton by carton in carton index order. */
export function allProductPlacements(l: Layout, i: Inputs): PlacedBox[] {
  return cartonPlacements(l, i).flatMap((carton) => productsInCarton(l, i, carton));
}
