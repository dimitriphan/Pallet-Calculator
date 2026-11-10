import type { Dims, Inputs, OptimizeResult, RankedLayout } from '../domain/types';
import { cartonDisplayDims, computeAnalytics, type Analytics } from '../engine/analytics/analytics';

export interface ExportPayload {
  exportedAt: string;
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
  }[];
}

/** Everything an export file needs, taken from the inputs the result was computed from. */
export function buildExportPayload(
  inputs: Inputs,
  result: OptimizeResult,
  selectedIndex: number,
  now: Date,
): ExportPayload {
  const selectedLayout = result.layouts[selectedIndex];
  if (!selectedLayout) throw new Error(`No layout at index ${selectedIndex}`);
  return {
    exportedAt: now.toISOString(),
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
