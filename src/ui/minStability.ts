import type { MinStability, OptimizeResult } from '../domain/types';
import { fmtCount } from './format';

/** The three choices, in the order they are offered. */
export const MIN_STABILITY_OPTIONS: MinStability[] = ['auto', 'fair', 'good'];

export const MIN_STABILITY_LABEL: Record<MinStability, string> = {
  auto: 'Auto',
  fair: 'Fair or better',
  good: 'Good only',
};

/** The rating a minimum asks for, as a word. */
const MINIMUM_RATING: Record<Exclude<MinStability, 'auto'>, string> = {
  fair: 'Fair',
  good: 'Good',
};

/** Beside a layout shown although it rates below the minimum. */
export const BELOW_MINIMUM = 'Below your minimum';

/** "Minimum stability: Good only." */
export function minStabilityText(minimum: MinStability): string {
  return `Minimum stability: ${MIN_STABILITY_LABEL[minimum]}.`;
}

/**
 * What is said when no layout meets the minimum and the best-rated ones are shown instead.
 * `limited` is a search that was cut short: it cannot say that none reaches the minimum, only
 * that none was found.
 */
export function belowMinimumText(minimum: Exclude<MinStability, 'auto'>, limited = false): string {
  const rating = MINIMUM_RATING[minimum];
  return limited
    ? `No layout reaching ${rating} was found before the search was stopped. Showing the most stable found.`
    : `No layout reaches ${rating}. Showing the most stable found.`;
}

/**
 * "Auto would give 15 more boxes.": what the minimum stability or the layer pattern setting
 * costs against the first layout listed, or null when it costs nothing.
 */
export function autoMoreText(result: {
  layouts: { layout: { totalProducts: number } }[];
  autoBestProducts?: OptimizeResult['autoBestProducts'];
}): string | null {
  const top = result.layouts[0]?.layout.totalProducts;
  if (top === undefined || result.autoBestProducts === undefined) return null;
  const more = result.autoBestProducts - top;
  if (more <= 0) return null;
  return `Auto would give ${fmtCount(more)} more ${more === 1 ? 'box' : 'boxes'}.`;
}
