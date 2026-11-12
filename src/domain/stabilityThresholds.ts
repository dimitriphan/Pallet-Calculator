/**
 * Stability thresholds (spec 7.1; `deckShare` added in Round 5 for layouts placed by hand). Every comparison is strict: a value exactly at a threshold
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
  /**
   * Layouts placed by hand only. Inches. Two bottom-layer cartons count as standing together
   * (one free-standing group for the stack height check) when their facing edges are at most
   * this far apart and overlap along that edge: cartons this close brace each other once the
   * load is wrapped. It also keeps a hand copy of a calculated pinwheel layer, whose blocks
   * can stand a fraction of an inch apart, rated as the original.
   */
  joinGap: 1,
  /**
   * Layouts placed by hand only. Share of a bottom-layer carton's base area resting on the
   * pallet deck (the pallet itself, not the allowed overhang around it), for the worst carton.
   * The same shares as `supportShare`: a carton needs as much under it from the deck as from
   * a layer of cartons.
   */
  deckShare: { caution: 0.9, serious: 0.7 },
} as const;
