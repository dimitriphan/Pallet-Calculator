import type {
  Dims,
  Inputs,
  Layout,
  OptimizeResult,
  RankedLayout,
  StabilityRating,
} from '../domain/types';
import type { ManualMarker } from '../store/manualLayoutsStore';
import { isBelowMinimum } from '../ui/minStability';
import { cartonDisplayDims, computeAnalytics, type Analytics } from '../engine/analytics/analytics';
import { hasPinwheelLayer } from '../engine/analytics/stack';
import { resultNoteLines } from '../ui/resultNotes';

/** What every export says when the result shown is older than the current inputs. */
export const STALE_NOTE = 'Out of date: inputs changed after this calculation';

/** The same for a manual layout whose carton no longer applies (spec 6.6). */
export const MANUAL_OUT_OF_DATE_NOTE =
  'Out of date: the product size, wall thickness or leeway changed after this layout was made';

export interface ExportPayload {
  exportedAt: string;
  /** True when the inputs changed after this calculation (the result is shown out of date). */
  stale: boolean;
  /** "Current", or when stale STALE_NOTE (MANUAL_OUT_OF_DATE_NOTE for an out-of-date manual layout). */
  status: string;
  inputs: Inputs;
  /**
   * What the minimum stability and the layer pattern setting did to the result, as on screen:
   * nothing reached the minimum, no pinwheel was found, what Auto would give. Empty when
   * neither changed anything.
   */
  notes: string[];
  /**
   * True when every layout is shown although it rates below the minimum stability; for a
   * manual layout, when its own rating is under the minimum (never for one that is out of date).
   */
  belowMinimum: boolean;
  /**
   * The selected layout. A manual layout was not ranked or scored: its `rank`, `score` and
   * `explanation` are null and `manual` holds its name, flags and status.
   */
  selectedLayout: RankedLayout | ManualSelected;
  analytics: Analytics;
  /** The calculated layouts side by side; empty for a manual layout, which is not ranked. */
  comparison: {
    rank: number;
    carton: Dims;
    products: number;
    cartons: number;
    layers: number;
    utilizationPct: number;
    remainingVolume: number;
    score: number;
    /** Total weight in pounds; present only when the box weight was set. */
    weight?: number;
    /** Absent for a layout stored before layouts were rated. */
    stability?: StabilityRating;
    /** Present (true) only for a layout with a pinwheel layer, as the table's badge. */
    pinwheel?: true;
  }[];
}

/** A manual layout as the selected layout of an export: no rank, no score. */
export interface ManualSelected {
  rank: null;
  score: null;
  explanation: null;
  layout: Layout;
  manual: ManualMarker;
}

export function isManualSelected(s: ExportPayload['selectedLayout']): s is ManualSelected {
  return s.rank === null;
}

/**
 * Everything an export file needs, taken from the inputs the result was computed from. With
 * `manual` (the selected layout is a manual one, given as a result of that one layout) nothing
 * of a ranking is written: no rank, no score, no comparison.
 */
export function buildExportPayload(
  inputs: Inputs,
  result: OptimizeResult,
  selectedIndex: number,
  now: Date,
  stale = false,
  manual?: ManualMarker,
): ExportPayload {
  const selectedLayout = result.layouts[selectedIndex];
  if (!selectedLayout) throw new Error(`No layout at index ${selectedIndex}`);
  if (manual) {
    const { layout } = selectedLayout;
    return {
      exportedAt: now.toISOString(),
      stale,
      status: !stale
        ? 'Current'
        : manual.status === 'outOfDate'
          ? MANUAL_OUT_OF_DATE_NOTE
          : STALE_NOTE,
      inputs,
      // The notes are about the calculated result, which this is not.
      notes: [],
      // As on screen: an out-of-date layout is shown as it was made, and is not judged
      // against the minimum now set.
      belowMinimum:
        manual.status !== 'outOfDate' &&
        isBelowMinimum(layout.stability?.rating, inputs.minStability),
      selectedLayout: { rank: null, score: null, explanation: null, layout, manual },
      analytics: computeAnalytics(layout, inputs),
      comparison: [],
    };
  }
  return {
    exportedAt: now.toISOString(),
    stale,
    status: stale ? STALE_NOTE : 'Current',
    inputs,
    notes: resultNoteLines(inputs, result),
    belowMinimum: result.belowMinimum === true && inputs.minStability !== 'auto',
    selectedLayout,
    analytics: computeAnalytics(selectedLayout.layout, inputs),
    comparison: result.layouts.map((r) => {
      const a = computeAnalytics(r.layout, inputs);
      return {
        rank: r.rank,
        carton: cartonDisplayDims(r.layout, 'outer'),
        products: r.layout.totalProducts,
        cartons: r.layout.totalCartons,
        layers: r.layout.layers.length,
        utilizationPct: a.totals.utilizationPct,
        remainingVolume: a.totals.remainingVolume,
        score: r.score.total,
        ...(a.weight ? { weight: a.weight.total } : {}),
        ...(r.layout.stability ? { stability: r.layout.stability.rating } : {}),
        ...(hasPinwheelLayer(r.layout) ? { pinwheel: true as const } : {}),
      };
    }),
  };
}

/** pallet-layout-YYYYMMDD-HHmmss.ext, in the viewer's local time. */
export function exportFilename(ext: 'json' | 'csv' | 'png', now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const date = `${p(now.getFullYear(), 4)}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `pallet-layout-${date}-${time}.${ext}`;
}
