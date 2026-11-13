import { PALLET_HEIGHT } from '../../domain/constants';
import type { Dims, Inputs, Layer, Layout, ProductAxis, Stability } from '../../domain/types';
import { availableVolume, usableFootprint, usableHeight } from '../packing/geometry';
import { layoutMetrics } from '../packing/metrics';
import { footprintAxes } from '../packing/stacking';
import { turnedLayerNumbers } from './stack';
import { measureStability, type StabilityMeasures } from './stability';
import { layerFreeRects, unusedSpace } from './unusedSpace';
import { layoutWeight, roomForCartons, type LayoutWeight } from './weight';

export type TargetStatus = 'none' | 'met' | 'exceeded' | 'notAchievable';

export interface LayerOrientation {
  vertical: ProductAxis;
  layers: number;
  cartonsPerLayer: number;
}

const AXIS_NAME: Record<ProductAxis, string> = { L: 'Length', W: 'Width', H: 'Height' };

/** Layers grouped by vertical axis and carton count, in the order they are first stacked. */
export function layerOrientations(l: Layout): LayerOrientation[] {
  const out: LayerOrientation[] = [];
  for (const layer of l.layers) {
    const same = out.find(
      (o) => o.vertical === layer.vertical && o.cartonsPerLayer === layer.cartonCount,
    );
    if (same) same.layers += 1;
    else out.push({ vertical: layer.vertical, layers: 1, cartonsPerLayer: layer.cartonCount });
  }
  return out;
}

/** "1 × 1 × 5": boxes along product length, width and height. */
export function describeBoxCounts(counts: Record<ProductAxis, number>): string {
  return `${counts.L} × ${counts.W} × ${counts.H}`;
}

/** "Length up: 1 layer; Width up: 6 layers". */
export function describeLayerOrientations(list: LayerOrientation[]): string {
  return list
    .map((o) => `${AXIS_NAME[o.vertical]} up: ${o.layers} ${o.layers === 1 ? 'layer' : 'layers'}`)
    .join('; ');
}

export interface Analytics {
  product: { dims: Dims; volume: number; perCarton: number };
  carton: {
    inner: Dims;
    outer: Dims;
    utilizationPct: number;
    emptyVolume: number;
    perPallet: number;
    /** Boxes along each product dimension inside the carton. */
    counts: Record<ProductAxis, number>;
    /** Per distinct layer type, bottom first: which product dimension points up. */
    layerOrientations: LayerOrientation[];
  };
  pallet: {
    dims: Dims;
    usableHeight: number;
    usableFootprint: { x: number; y: number };
    layers: number;
    cartonsPerLayerMin: number;
    cartonsPerLayerMax: number;
    totalLoadHeight: number;
    volumeUtilizationPct: number;
    remainingHeight: number;
    remainingFootprintArea: number;
    loadLength: number;
    loadWidth: number;
  };
  totals: {
    products: number;
    cartons: number;
    /**
     * The carton volume inside the envelope (usable footprint by usable height). For every
     * calculated layout that is all of it. `volumeUsed + remainingVolume = volumeAvailable`.
     */
    volumeUsed: number;
    volumeAvailable: number;
    utilizationPct: number;
    remainingVolume: number;
    /**
     * Only for a layout placed by hand: the carton volume outside the envelope (cartons that
     * overhang the usable footprint, or stand above the height limit); 0 when all is inside.
     * `volumeUsed` plus this is the volume of all the cartons.
     */
    volumeOutsideEnvelope?: number;
    /** The part of the remaining volume above the top of the stack. */
    headroomVolume: number;
    /** The part of the remaining volume beside the cartons, layer by layer. */
    layerGapVolume: number;
  };
  target: {
    status: TargetStatus;
    requested: number | null;
    maxPossible: number;
    cartonsNeeded: number | null;
    layersNeeded: number | null;
  };
  summary: {
    boxesPerCarton: number;
    cartonsPerLayer: string;
    layers: number;
    cartonsPerPallet: number;
    totalBoxes: number;
  };
  /** Null when the product box weight is blank (weight ignored). Pounds and inches. */
  weight:
    | (LayoutWeight & {
        /**
         * More full cartons the maximum would allow, said only for a load trimmed by weight:
         * 0 without a maximum or when no layer was removed (the height is the limit then).
         */
        roomForCartons: number;
        /** Whole layers removed from the top to keep under the maximum. */
        layersRemoved: number;
        max: number | null;
      })
    | null;
  /**
   * The layout's stability rating and warnings, with what every check measured and the
   * numbers of the layers turned half a turn (from 1). Null for a
   * layout stored before the rating existed (it has no rating to show).
   */
  stability: (Stability & { measures: StabilityMeasures; turnedLayers: number[] }) | null;
}

/**
 * A carton's size as it stands with `vertical` up: the longer side of its base, the shorter
 * side, then its height. The one way a carton's size is written, on screen and in exports.
 */
export function standingDims(size: Record<ProductAxis, number>, vertical: ProductAxis): Dims {
  const [a, b] = footprintAxes(vertical);
  return {
    length: Math.max(size[a], size[b]),
    width: Math.min(size[a], size[b]),
    height: size[vertical],
  };
}

/**
 * The carton's size as the layout's cartons stand: `standingDims` for the way up of the bottom
 * layer. A layout whose layers stand the carton different ways up is written by its bottom
 * layer too, so the results table, the editor (which copies the bottom layer) and the exports
 * all write the same carton the same way; "Product side facing up" lists the other layers.
 * A layout with no layers has no way up: its three sizes are sorted, longest first.
 */
export function cartonDisplayDims(l: Layout, which: 'inner' | 'outer'): Dims {
  const size = l.carton[which];
  const first = l.layers[0]?.vertical;
  if (first !== undefined) return standingDims(size, first);
  const axes: ProductAxis[] = ['L', 'W', 'H'];
  const sorted = axes.map((k) => size[k]).sort((p, q) => q - p);
  return { length: sorted[0] ?? 0, width: sorted[1] ?? 0, height: sorted[2] ?? 0 };
}

function targetAnalytics(l: Layout, i: Inputs): Analytics['target'] {
  const requested = i.targetQuantity;
  const maxPossible = l.totalProducts;
  const none = { requested, maxPossible, cartonsNeeded: null, layersNeeded: null };
  if (requested === null) return { status: 'none', ...none };
  if (requested > maxPossible) return { status: 'notAchievable', ...none };

  const cartonsNeeded = Math.ceil(requested / l.carton.boxesPerCarton);
  let cumulative = 0;
  let layersNeeded = 0;
  for (const layer of l.layers) {
    if (cumulative >= cartonsNeeded) break;
    cumulative += layer.cartonCount;
    layersNeeded++;
  }
  return {
    status: requested === maxPossible ? 'met' : 'exceeded',
    requested,
    maxPossible,
    cartonsNeeded,
    layersNeeded,
  };
}

/** Cubic inches: a smaller difference between two ways of measuring a volume is rounding. */
const OUTSIDE_NOISE = 1e-6;

export function computeAnalytics(l: Layout, i: Inputs): Analytics {
  const m = layoutMetrics(l, i);
  const counts = l.layers.map((layer) => layer.cartonCount);
  const min = counts.length > 0 ? Math.min(...counts) : 0;
  const max = counts.length > 0 ? Math.max(...counts) : 0;
  const footprint = usableFootprint(i);
  const height = usableHeight(i);
  const available = availableVolume(i);
  const utilizationPct = available > 0 ? (m.cartonVolume / available) * 100 : 0;
  const unused = unusedSpace(l, i);
  // The rule: used volume, remaining volume and utilisation are all measured inside the
  // envelope (usable footprint by usable height), so used + remaining = available.
  // A calculated layout lies wholly inside it: used is the volume of its cartons and what
  // remains is the subtraction, as always. A layout placed by hand may have cartons outside
  // the usable footprint (or, flagged, above the height limit): what remains is then the
  // unused space measured inside the envelope (never negative), used is the rest of the
  // envelope, and the carton volume outside it is given separately.
  const manual = l.layers.some((layer) => layer.kind === 'manual');
  const remainingVolume = manual
    ? Math.min(available, unused.headroomVolume + unused.gapVolume)
    : available - m.cartonVolume;
  const volumeUsed = manual ? available - remainingVolume : m.cartonVolume;
  const envelopePct = manual && available > 0 ? (volumeUsed / available) * 100 : null;
  const outside = m.cartonVolume - volumeUsed;
  const fullest = manual ? fullestLayer(l) : undefined;
  const remainingFootprintArea = fullest
    ? layerFreeRects(fullest, l, footprint).reduce((s, r) => s + r.w * r.h, 0)
    : footprint.x * footprint.y - m.fullestLayerUsedArea;

  return {
    product: {
      dims: i.product,
      volume: i.product.length * i.product.width * i.product.height,
      perCarton: l.carton.boxesPerCarton,
    },
    carton: {
      inner: cartonDisplayDims(l, 'inner'),
      outer: cartonDisplayDims(l, 'outer'),
      utilizationPct: l.carton.utilization * 100,
      emptyVolume: l.carton.emptyVolume,
      perPallet: l.totalCartons,
      counts: { ...l.carton.counts },
      layerOrientations: layerOrientations(l),
    },
    pallet: {
      dims: i.pallet,
      usableHeight: height,
      usableFootprint: footprint,
      layers: l.layers.length,
      cartonsPerLayerMin: min,
      cartonsPerLayerMax: max,
      totalLoadHeight: m.loadExtent.z + PALLET_HEIGHT,
      volumeUtilizationPct: envelopePct ?? utilizationPct,
      // A hand-made carton over the height limit (flagged) leaves none, not less than none.
      remainingHeight: manual ? Math.max(0, height - m.loadExtent.z) : height - m.loadExtent.z,
      remainingFootprintArea,
      loadLength: m.loadExtent.x,
      loadWidth: m.loadExtent.y,
    },
    totals: {
      products: l.totalProducts,
      cartons: l.totalCartons,
      volumeUsed,
      volumeAvailable: available,
      utilizationPct: envelopePct ?? utilizationPct,
      remainingVolume,
      ...(manual ? { volumeOutsideEnvelope: outside > OUTSIDE_NOISE ? outside : 0 } : {}),
      headroomVolume: unused.headroomVolume,
      layerGapVolume: unused.gapVolume,
    },
    target: targetAnalytics(l, i),
    summary: {
      boxesPerCarton: l.carton.boxesPerCarton,
      cartonsPerLayer: min === max ? String(min) : `${min}–${max}`,
      layers: l.layers.length,
      cartonsPerPallet: l.totalCartons,
      totalBoxes: l.totalProducts,
    },
    weight: weightAnalytics(l, i),
    stability: l.stability
      ? { ...l.stability, measures: measureStability(l, i), turnedLayers: turnedLayerNumbers(l) }
      : null,
  };
}

/** The layer with the most cartons, the first of them on a tie (as layoutMetrics picks it). */
function fullestLayer(l: Layout): Layer | undefined {
  let fullest: Layer | undefined;
  for (const layer of l.layers) {
    if (!fullest || layer.cartonCount > fullest.cartonCount) fullest = layer;
  }
  return fullest;
}

function weightAnalytics(l: Layout, i: Inputs): Analytics['weight'] {
  const w = layoutWeight(l, i);
  if (w === null) return null;
  const layersRemoved = l.weightTrim?.layersRemoved ?? 0;
  return {
    ...w,
    roomForCartons: layersRemoved >= 1 ? roomForCartons(l, i) : 0,
    layersRemoved,
    max: i.weights.maxPallet,
  };
}
