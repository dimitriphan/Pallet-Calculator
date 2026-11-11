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
});

const layout = z.object({
  id: z.string(),
  carton,
  layers: z.array(layer),
  totalCartons: num,
  totalProducts: num,
  // Added in Round 4: only on layouts trimmed to the maximum pallet weight.
  weightTrim: z.object({ layersRemoved: num }).optional(),
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
    .enum(['NO_CARTON_FITS', 'CARTON_EXCEEDS_PALLET', 'NO_CARTON_WITH_COUNT', 'OVER_WEIGHT'])
    .nullable(),
  truncated: z.boolean(),
  // Added in Round 2: optional, so results saved before it still load.
  nearestCounts: z.object({ below: num.nullable(), above: num.nullable() }).optional(),
});

/** Analytics as stored, where fields added after the first release may be missing. */
export type StoredAnalytics = Omit<Analytics, 'carton'> & {
  carton: Omit<Analytics['carton'], 'counts' | 'layerOrientations'> &
    Partial<Pick<Analytics['carton'], 'counts' | 'layerOrientations'>>;
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
});
