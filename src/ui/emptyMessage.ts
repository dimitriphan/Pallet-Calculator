import type { Inputs, OptimizeResult } from '../domain/types';

const FIXED = {
  NO_CARTON_FITS:
    'No carton fits: the product box (plus leeway and walls) is larger than the maximum carton dimensions.',
  CARTON_EXCEEDS_PALLET:
    'No layout fits: the smallest possible carton is larger than the usable pallet space.',
  OVER_WEIGHT: 'Nothing fits: one layer is already over the maximum pallet weight.',
  WEIGHT_SEARCH_LIMITED:
    'No layout under the maximum pallet weight was found before the search was limited. A smaller carton may still fit: try entering the desired boxes per carton.',
} as const;

/** Why there are no layouts, or null when there are some. `inputs` are the ones the result came from. */
export function emptyMessage(result: OptimizeResult, inputs: Inputs): string | null {
  if (result.layouts.length > 0 || !result.emptyReason) return null;
  if (result.emptyReason !== 'NO_CARTON_WITH_COUNT') return FIXED[result.emptyReason];
  const first = `No carton holding exactly ${inputs.boxesPerCarton} boxes fits within the maximum carton dimensions.`;
  const below = result.nearestCounts?.below ?? null;
  const above = result.nearestCounts?.above ?? null;
  if (below !== null && above !== null)
    return `${first} Counts that do fit: ${below} and ${above}.`;
  const only = below ?? above;
  return only === null ? first : `${first} The closest count that fits is ${only}.`;
}
