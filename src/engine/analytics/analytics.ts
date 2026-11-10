import { PALLET_HEIGHT } from '../../domain/constants';
import type { Dims, Inputs, Layout, ProductAxis } from '../../domain/types';
import { availableVolume, usableFootprint, usableHeight } from '../packing/geometry';
import { layoutMetrics } from '../packing/metrics';
import { footprintAxes } from '../packing/stacking';

export type TargetStatus = 'none' | 'met' | 'exceeded' | 'notAchievable';

export interface Analytics {
  product: { dims: Dims; volume: number; perCarton: number };
  carton: {
    inner: Dims;
    outer: Dims;
    utilizationPct: number;
    emptyVolume: number;
    perPallet: number;
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
    volumeUsed: number;
    volumeAvailable: number;
    utilizationPct: number;
    remainingVolume: number;
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
}

/**
 * Carton size as length >= width plus height. When every layer stands the carton on the
 * same product axis, that axis is the height; otherwise the three sizes are sorted descending.
 */
export function cartonDisplayDims(l: Layout, which: 'inner' | 'outer'): Dims {
  const size = l.carton[which];
  const first = l.layers[0]?.vertical;
  if (first !== undefined && l.layers.every((layer) => layer.vertical === first)) {
    const [a, b] = footprintAxes(first);
    return {
      length: Math.max(size[a], size[b]),
      width: Math.min(size[a], size[b]),
      height: size[first],
    };
  }
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

export function computeAnalytics(l: Layout, i: Inputs): Analytics {
  const m = layoutMetrics(l, i);
  const counts = l.layers.map((layer) => layer.cartonCount);
  const min = counts.length > 0 ? Math.min(...counts) : 0;
  const max = counts.length > 0 ? Math.max(...counts) : 0;
  const footprint = usableFootprint(i);
  const height = usableHeight(i);
  const available = availableVolume(i);
  const utilizationPct = available > 0 ? (m.cartonVolume / available) * 100 : 0;

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
    },
    pallet: {
      dims: i.pallet,
      usableHeight: height,
      usableFootprint: footprint,
      layers: l.layers.length,
      cartonsPerLayerMin: min,
      cartonsPerLayerMax: max,
      totalLoadHeight: m.loadExtent.z + PALLET_HEIGHT,
      volumeUtilizationPct: utilizationPct,
      remainingHeight: height - m.loadExtent.z,
      remainingFootprintArea: footprint.x * footprint.y - m.fullestLayerUsedArea,
      loadLength: m.loadExtent.x,
      loadWidth: m.loadExtent.y,
    },
    totals: {
      products: l.totalProducts,
      cartons: l.totalCartons,
      volumeUsed: m.cartonVolume,
      volumeAvailable: available,
      utilizationPct,
      remainingVolume: available - m.cartonVolume,
    },
    target: targetAnalytics(l, i),
    summary: {
      boxesPerCarton: l.carton.boxesPerCarton,
      cartonsPerLayer: min === max ? String(min) : `${min}–${max}`,
      layers: l.layers.length,
      cartonsPerPallet: l.totalCartons,
      totalBoxes: l.totalProducts,
    },
  };
}
