import type { Inputs, Layer, Layout } from '../../domain/types';
import { availableVolume, productSize, volumeOf } from './geometry';
import { footprintAxes } from './stacking';

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
  for (const layer of l.layers) {
    x = Math.max(x, layer.extent.x);
    y = Math.max(y, layer.extent.y);
    z += layer.height;
    // Layers are ordered by count, so the first one with the top count is kept on ties.
    if (!fullest || layer.cartonCount > fullest.cartonCount) fullest = layer;
  }
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
