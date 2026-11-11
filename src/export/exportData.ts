import type { Dims, Inputs, OptimizeResult, RankedLayout } from '../domain/types';
import { cartonDisplayDims, computeAnalytics, type Analytics } from '../engine/analytics/analytics';

/** What every export says when the result shown is older than the current inputs. */
export const STALE_NOTE = 'Out of date: inputs changed after this calculation';

export interface ExportPayload {
  exportedAt: string;
  /** True when the inputs changed after this calculation (the result is shown out of date). */
  stale: boolean;
  /** "Current", or STALE_NOTE when stale. */
  status: string;
  inputs: Inputs;
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
