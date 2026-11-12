import type { Inputs, OptimizeResult } from '../domain/types';
import { patternFallbackText } from './layerPattern';
import { autoMoreText, belowMinimumText } from './minStability';

/** What the minimum stability and the layer pattern setting did to a result, in words. */
export interface ResultNotes {
  /** Nothing reached the minimum and the most stable layouts are shown, each below it. */
  belowMinimum: string | null;
  /** Pinwheel only found no pinwheel and the straight-cut layouts are shown. */
  patternFallback: string | null;
  /** "Auto would give N more boxes." */
  autoMore: string | null;
}

/**
 * The notes for a result and the inputs it was worked out from: the same sentences on screen,
 * on the build sheet and in the CSV. A limited search says only what it found.
 */
export function resultNotes(inputs: Inputs, result: OptimizeResult): ResultNotes {
  const shown = result.layouts.length > 0;
  return {
    belowMinimum:
      shown && result.belowMinimum && inputs.minStability !== 'auto'
        ? belowMinimumText(inputs.minStability, result.truncated)
        : null,
    patternFallback: inputs.layerPattern === 'pinwheelOnly' ? patternFallbackText(result) : null,
    autoMore:
      inputs.minStability !== 'auto' || inputs.layerPattern !== 'auto'
        ? autoMoreText(result)
        : null,
  };
}

/** The notes that apply, as sentences in a fixed order. */
export function resultNoteLines(inputs: Inputs, result: OptimizeResult): string[] {
  const n = resultNotes(inputs, result);
  return [n.belowMinimum, n.patternFallback, n.autoMore].filter((t): t is string => t !== null);
}
