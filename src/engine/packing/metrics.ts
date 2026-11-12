import type { Block, Inputs, Layer, Layout } from '../../domain/types';
import { availableVolume, productSize, volumeOf } from './geometry';
import { blocksBounds, footprintAxes } from './stacking';

export interface LayoutMetrics {
  cartonVolume: number;
  productVolume: number;
  /** x, y: the largest layer extent on each axis; z: the sum of layer heights. */
  loadExtent: { x: number; y: number; z: number };
  loadBoundingVolume: number;
  availableVolume: number;
  fullestLayerCartons: number;
  /** Cartons x footprint area of the layer with the most cartons. */
  fullestLayerUsedArea: number;
}

export function layoutMetrics(l: Layout, i: Inputs): LayoutMetrics {
  let x = 0;
  let y = 0;
  let z = 0;
  let fullest: Layer | undefined;
  // Layers placed by hand are not centred on each other, so their extents do not nest: the
  // load reaches from the least to the greatest carton edge over all of them.
  const manual = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let bounded: Block[] | undefined;
  for (const layer of l.layers) {
    x = Math.max(x, layer.extent.x);
    y = Math.max(y, layer.extent.y);
    if (layer.kind === 'manual' && layer.blocks.length > 0 && layer.blocks !== bounded) {
      bounded = layer.blocks;
      const [fa, fb] = footprintAxes(layer.vertical);
      const { min, size } = blocksBounds(layer.blocks, l.carton.outer[fa], l.carton.outer[fb]);
      manual.x0 = Math.min(manual.x0, min.x);
      manual.y0 = Math.min(manual.y0, min.y);
      manual.x1 = Math.max(manual.x1, min.x + size.x);
      manual.y1 = Math.max(manual.y1, min.y + size.y);
    }
    z += layer.height;
    // Layers are ordered by count, so the first one with the top count is kept on ties.
    if (!fullest || layer.cartonCount > fullest.cartonCount) fullest = layer;
  }
  if (manual.x1 > manual.x0) x = Math.max(x, manual.x1 - manual.x0);
  if (manual.y1 > manual.y0) y = Math.max(y, manual.y1 - manual.y0);
  let fullestLayerUsedArea = 0;
  if (fullest) {
    const [fa, fb] = footprintAxes(fullest.vertical);
    fullestLayerUsedArea = fullest.cartonCount * l.carton.outer[fa] * l.carton.outer[fb];
  }
  return {
    cartonVolume: l.totalCartons * volumeOf(l.carton.outer),
    productVolume: l.totalProducts * volumeOf(productSize(i)),
    loadExtent: { x, y, z },
    loadBoundingVolume: x * y * z,
    availableVolume: availableVolume(i),
    fullestLayerCartons: fullest ? fullest.cartonCount : 0,
    fullestLayerUsedArea,
  };
}
