import { PALLET_HEIGHT } from '../../domain/constants';
import type { Inputs, Layer, Layout } from '../../domain/types';
import { withLayers } from '../packing/stacking';

/** Weights in pounds; heights in inches above the floor. */
export interface LayoutWeight {
  /** Pallet plus every carton with its boxes. */
  total: number;
  /** One full carton: the empty carton plus its boxes. */
  perCarton: number;
  /** Each layer's cartons, bottom first. */
  perLayer: number[];
  /** Height of the load's centre of mass above the floor, pallet included. */
  centreOfMassHeight: number;
}

/** Totals within this fraction of the maximum count as at the maximum (unit rounding). */
const WEIGHT_TOLERANCE = 1e-9;

function perCartonWeight(l: Layout, i: Inputs, productBox: number): number {
  return i.weights.emptyCarton + l.carton.boxesPerCarton * productBox;
}

function totalWeight(l: Layout, i: Inputs, productBox: number): number {
  return i.weights.pallet + l.totalCartons * perCartonWeight(l, i, productBox);
}

function withinMax(total: number, max: number): boolean {
  return total <= max + Math.abs(max) * WEIGHT_TOLERANCE;
}

/**
 * Total = pallet + cartons x (empty carton + boxes per carton x box). The pallet's mass sits at
 * the middle of the deck, each layer's at the middle of the layer. Null when the box weight is
 * blank: weight is then ignored everywhere.
 */
export function layoutWeight(l: Layout, i: Inputs): LayoutWeight | null {
  const box = i.weights.productBox;
  if (box === null) return null;
  const perCarton = perCartonWeight(l, i, box);
  const perLayer = l.layers.map((layer) => layer.cartonCount * perCarton);
  const total = totalWeight(l, i, box);
  let moment = i.weights.pallet * (PALLET_HEIGHT / 2);
  l.layers.forEach((layer, k) => {
    moment += (perLayer[k] as number) * (PALLET_HEIGHT + layer.z + layer.height / 2);
  });
  return { total, perCarton, perLayer, centreOfMassHeight: total > 0 ? moment / total : 0 };
}

/**
 * Removes whole layers from the top until the total is at or under the maximum. The same
 * layout object when there is no maximum, no box weight, or it is already under; null when
 * even the bottom layer on the pallet is over.
 */
export function trimToWeight(l: Layout, i: Inputs): Layout | null {
  const { productBox: box, maxPallet: max } = i.weights;
  if (box === null || max === null) return l;
  if (withinMax(totalWeight(l, i, box), max)) return l;
  const perCarton = perCartonWeight(l, i, box);
  // Count cartons, not pounds, so each step's total is computed as layoutWeight would.
  let cartons = l.totalCartons;
  let keep = l.layers.length;
  while (keep > 0 && !withinMax(i.weights.pallet + cartons * perCarton, max)) {
    keep--;
    cartons -= (l.layers[keep] as Layer).cartonCount;
  }
  if (keep === 0) return null;
  const trimmed = withLayers(l, l.layers.slice(0, keep));
  return { ...trimmed, weightTrim: { layersRemoved: l.layers.length - keep } };
}

/** How many more full cartons the maximum would allow on top of `l`; 0 without a maximum. */
export function roomForCartons(l: Layout, i: Inputs): number {
  const { productBox: box, maxPallet: max } = i.weights;
  if (box === null || max === null) return 0;
  const perCarton = perCartonWeight(l, i, box);
  if (!(perCarton > 0)) return 0;
  const spare = max - totalWeight(l, i, box);
  return spare > 0 ? Math.floor(spare / perCarton + WEIGHT_TOLERANCE) : 0;
}
