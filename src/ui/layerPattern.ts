import type { LayerPatternPref } from '../domain/types';

/** The three choices, in the order they are offered. */
export const LAYER_PATTERN_OPTIONS: LayerPatternPref[] = ['auto', 'preferPinwheel', 'pinwheelOnly'];

export const LAYER_PATTERN_LABEL: Record<LayerPatternPref, string> = {
  auto: 'Auto',
  preferPinwheel: 'Prefer pinwheel',
  pinwheelOnly: 'Pinwheel only',
};

/** "Layer pattern: Pinwheel only." */
export function layerPatternText(pattern: LayerPatternPref): string {
  return `Layer pattern: ${LAYER_PATTERN_LABEL[pattern]}.`;
}

/** What is said when Pinwheel only found no pinwheel and the straight-cut layouts are shown. */
export const PATTERN_FALLBACK =
  'No pinwheel layout exists for these sizes. Showing straight-cut layouts.';

/**
 * The same when the search was limited: it cannot say that none exists, only that none was
 * found.
 */
export const PATTERN_FALLBACK_LIMITED =
  'No pinwheel layout was found before the search was stopped. Showing straight-cut layouts.';

/** The fallback message for a result, or null when the result is not the fallback. */
export function patternFallbackText(result: {
  layouts: unknown[];
  truncated: boolean;
  patternFallback?: boolean;
}): string | null {
  if (!result.patternFallback || result.layouts.length === 0) return null;
  return result.truncated ? PATTERN_FALLBACK_LIMITED : PATTERN_FALLBACK;
}
