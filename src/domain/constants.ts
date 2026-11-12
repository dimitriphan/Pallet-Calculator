import type { Inputs } from './types';

export const PALLET_HEIGHT = 5;
export const EPS = 1e-9;
export const PRODUCT_RENDER_THRESHOLD = 5000;
/** Above this many products, "Show anyway" is refused: drawing them could crash the tab. */
export const PRODUCT_FORCE_LIMIT = 200000;
export const SCORE_WEIGHTS = { quantity: 0.6, utilization: 0.25, space: 0.15 } as const;

export const DEFAULT_INPUTS: Inputs = {
  pallet: { length: 50, width: 42, height: 72 },
  product: { length: 12, width: 8, height: 4 },
  maxCarton: { length: 24, width: 18, height: 16 },
  targetQuantity: null,
  boxesPerCarton: null,
  leeway: 0.5,
  wallThickness: 0.25,
  overhang: 0,
  rotationMode: 'full',
  customOrientations: [],
  keepCartonsUpright: false,
  weights: { productBox: null, maxPallet: null, emptyCarton: 0, pallet: 40 },
  minStability: 'auto',
};
