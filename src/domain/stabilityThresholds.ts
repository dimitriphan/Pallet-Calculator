/**
 * Stability thresholds (spec 7.1). Every comparison is strict: a value exactly at a threshold
 * gives no warning. The owner may ask for any of these to be changed; nothing else holds them.
 */
export const STABILITY = {
  /** Stack height (pallet deck excluded) ÷ the shorter side of the bottom layer's extent. */
  stackHeightRatio: { caution: 1.5, serious: 2.0 },
  /** A carton's height as stacked ÷ its shorter base side, for the worst layer. */
  cartonHeightRatio: { caution: 1.5, serious: 2.5 },
  /** Share of a layer's carton base area resting on cartons of the layer below, worst layer. */
  supportShare: { caution: 0.9, serious: 0.7 },
  /** This many identical layers or more in straight columns (no interlocking) give a caution. */
  columnLayers: 4,
} as const;
