import type { Dims, Inputs, OptimizeResult, RankedLayout, StabilityRating } from '../domain/types';
import { cartonDisplayDims, computeAnalytics, type Analytics } from '../engine/analytics/analytics';
import { hasPinwheelLayer } from '../engine/analytics/stack';
import { resultNoteLines } from '../ui/resultNotes';

/** What every export says when the result shown is older than the current inputs. */
export const STALE_NOTE = 'Out of date: inputs changed after this calculation';

export interface ExportPayload {
  exportedAt: string;
  /** True when the inputs changed after this calculation (the result is shown out of date). */
  stale: boolean;
  /** "Current", or STALE_NOTE when stale. */
  status: string;
  inputs: Inputs;
  /**
   * What the minimum stability and the layer pattern setting did to the result, as on screen:
   * nothing reached the minimum, no pinwheel was found, what Auto would give. Empty when
   * neither changed anything.
   */
  notes: string[];
  /** True when every layout is shown although it rates below the minimum stability. */
  belowMinimum: boolean;
  selectedLayout: RankedLayout;
  analytics: Analytics;
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

/** Everything an export file needs, taken from the inputs the result was computed from. */
export function buildExportPayload(
  inputs: Inputs,
  result: OptimizeResult,
  selectedIndex: number,
  now: Date,
  stale = false,
): ExportPayload {
  const selectedLayout = result.layouts[selectedIndex];
  if (!selectedLayout) throw new Error(`No layout at index ${selectedIndex}`);
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
