import { z } from 'zod';
import type { Analytics } from '../engine/analytics/analytics';
import type { OptimizeResult } from './types';

const num = z.number();
const dims = z.object({ length: num, width: num, height: num });
const axis = z.enum(['L', 'W', 'H']);
const perAxis = z.object({ L: num, W: num, H: num });

const carton = z.object({
  counts: perAxis,
  inner: perAxis,
  outer: perAxis,
  boxesPerCarton: num,
  utilization: num,
  emptyVolume: num,
});

const block = z.object({
  x: num,
  y: num,
  cols: num,
  rows: num,
  rotated: z.boolean(),
});

const layer = z.object({
  vertical: axis,
  height: num,
  cartonCount: num,
  blocks: z.array(block),
  extent: z.object({ x: num, y: num }),
  z: num,
  // Added in Round 4: absent on straight-cut layers and on results stored before it.
  // 'manual' added in Round 5: a layer placed by hand.
  kind: z.enum(['grid', 'pinwheel', 'manual']).optional(),
  // Added in Round 4: only on layers turned half a turn to interlock.
  turned: z.boolean().optional(),
});

const stabilityWarning = z.object({
  check: z.enum(['stackHeight', 'cartonHeight', 'support', 'columns']),
  level: z.enum(['caution', 'serious']),
  value: num,
  layer: num.optional(),
});

const stability = z.object({
  rating: z.enum(['good', 'fair', 'poor']),
  warnings: z.array(stabilityWarning),
});

const layout = z.object({
  id: z.string(),
  carton,
  layers: z.array(layer),
  totalCartons: num,
  totalProducts: num,
  // Added in Round 4: only on layouts trimmed to the maximum pallet weight.
  weightTrim: z.object({ layersRemoved: num }).optional(),
  // Added in Round 4: layouts stored before the stability rating have none (no badge shown).
  stability: stability.optional(),
});

const score = z.object({
  quantity: num,
  utilization: num,
  space: num,
  quantityContribution: num,
  utilizationContribution: num,
  spaceContribution: num,
  total: num,
});

const rankedLayout = z.object({
  rank: num,
  layout,
  score,
  explanation: z.string(),
});

export const optimizeResultSchema: z.ZodType<OptimizeResult> = z.object({
  layouts: z.array(rankedLayout),
  candidatesEvaluated: num,
  emptyReason: z
    .enum([
      'NO_CARTON_FITS',
      'CARTON_EXCEEDS_PALLET',
      'NO_CARTON_WITH_COUNT',
      'OVER_WEIGHT',
      'WEIGHT_SEARCH_LIMITED',
    ])
    .nullable(),
  truncated: z.boolean(),
  // Added in Round 2: optional, so results saved before it still load.
  nearestCounts: z.object({ below: num.nullable(), above: num.nullable() }).optional(),
  // Added in Round 5: only on results worked out with a minimum stability.
  belowMinimum: z.boolean().optional(),
  autoBestProducts: num.optional(),
  // Added in Round 5: only when Pinwheel only found no pinwheel and shows the Auto result.
  patternFallback: z.boolean().optional(),
});

/** Analytics as stored, where fields added after the first release may be missing. */
export type StoredAnalytics = Omit<Analytics, 'carton' | 'totals'> & {
  carton: Omit<Analytics['carton'], 'counts' | 'layerOrientations'> &
    Partial<Pick<Analytics['carton'], 'counts' | 'layerOrientations'>>;
  totals: Omit<Analytics['totals'], 'headroomVolume' | 'layerGapVolume'> &
    Partial<Pick<Analytics['totals'], 'headroomVolume' | 'layerGapVolume'>>;
};

export const analyticsSchema: z.ZodType<StoredAnalytics> = z.object({
  product: z.object({ dims, volume: num, perCarton: num }),
  carton: z.object({
    inner: dims,
    outer: dims,
    utilizationPct: num,
    emptyVolume: num,
    perPallet: num,
    // Added after the first release: optional so older saved scenarios still load (the
    // scenario schema recomputes analytics when they are missing).
    counts: perAxis.optional(),
    layerOrientations: z
      .array(z.object({ vertical: axis, layers: num, cartonsPerLayer: num }))
      .optional(),
  }),
  pallet: z.object({
    dims,
    usableHeight: num,
    usableFootprint: z.object({ x: num, y: num }),
    layers: num,
    cartonsPerLayerMin: num,
    cartonsPerLayerMax: num,
    totalLoadHeight: num,
    volumeUtilizationPct: num,
    remainingHeight: num,
    remainingFootprintArea: num,
    loadLength: num,
    loadWidth: num,
  }),
  totals: z.object({
    products: num,
    cartons: num,
    volumeUsed: num,
    volumeAvailable: num,
    utilizationPct: num,
    remainingVolume: num,
    // Added in Round 4: optional so older saved scenarios still load (the scenario schema
    // recomputes analytics when they are missing).
    headroomVolume: num.optional(),
    layerGapVolume: num.optional(),
  }),
  target: z.object({
    status: z.enum(['none', 'met', 'exceeded', 'notAchievable']),
    requested: num.nullable(),
    maxPossible: num,
    cartonsNeeded: num.nullable(),
    layersNeeded: num.nullable(),
  }),
  summary: z.object({
    boxesPerCarton: num,
    cartonsPerLayer: z.string(),
    layers: num,
    cartonsPerPallet: num,
    totalBoxes: num,
  }),
  // Added in Round 4: analytics saved before weights read as "weight ignored".
  weight: z
    .object({
      total: num,
      perCarton: num,
      perLayer: z.array(num),
      centreOfMassHeight: num,
      roomForCartons: num,
      layersRemoved: num,
      max: num.nullable(),
    })
    .nullable()
    .default(null),
  // Added in Round 4: analytics saved before the stability rating read as "not rated".
  stability: stability
    .extend({
      measures: z.object({
        stackHeightRatio: num,
        cartonHeight: z.object({ ratio: num, layer: num }).nullable(),
        support: z.object({ share: num, layer: num }).nullable(),
        columns: z.object({ layers: num, from: num }).nullable(),
      }),
      turnedLayers: z.array(num),
    })
    .nullable()
    .default(null),
});
