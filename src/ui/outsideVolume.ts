/**
 * The carton volume of a layout placed by hand that is outside the space the tool counts
 * ("Volume used" and the utilization are of the part inside it). One row for it, with the same
 * title on screen, in the CSV and on the build sheet, whenever it is above zero.
 */
import { EPS, PALLET_HEIGHT } from '../domain/constants';
import type { Analytics } from '../engine/analytics/analytics';

export const OUTSIDE_FOOTPRINT = 'Carton volume outside the allowed footprint';
/** When a carton also stands above the stacking height (flagged; only after an input change). */
export const OUTSIDE_FOOTPRINT_OR_HEIGHT =
  'Carton volume outside the allowed footprint or above the stacking height';

/** The row's title and the volume in cubic inches, or null when nothing is outside. */
export function outsideVolume(a: Analytics): { label: string; volume: number } | null {
  const volume = a.totals.volumeOutsideEnvelope ?? 0;
  if (!(volume > 0)) return null;
  const overHeight = a.pallet.totalLoadHeight - PALLET_HEIGHT > a.pallet.usableHeight + EPS;
  return { label: overHeight ? OUTSIDE_FOOTPRINT_OR_HEIGHT : OUTSIDE_FOOTPRINT, volume };
}
