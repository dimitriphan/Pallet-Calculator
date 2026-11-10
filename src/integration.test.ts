import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from './domain/constants';
import { computeAnalytics } from './engine/analytics/analytics';
import { optimize } from './engine/optimize';
import { cartonPlacements } from './engine/packing/positions';
import { formatNumber } from './engine/units/units';
import { buildCsv } from './export/csv';
import { buildExportPayload } from './export/exportData';
import { dimensionLines } from './scene/sceneGeometry';
import { loadBounds, measuredBounds } from './scene/transforms';

/** One run of the default inputs, checked across engine, analytics, exports and the 3D view. */
describe('the default winner, across modules', () => {
  const result = optimize(DEFAULT_INPUTS);
  const winner = result.layouts[0]!.layout;
  const analytics = computeAnalytics(winner, DEFAULT_INPUTS);
  const payload = buildExportPayload(DEFAULT_INPUTS, result, 0, new Date('2026-11-10T12:00:00Z'));
  const csv = buildCsv(payload).split('\r\n');
  const placements = cartonPlacements(winner, DEFAULT_INPUTS);

  it('is the known winner', () => {
    expect(winner.totalProducts).toBe(260);
    expect(winner.totalCartons).toBe(52);
    expect(winner.carton.boxesPerCarton).toBe(5);
    expect(winner.layers).toHaveLength(7);
  });

  it('agrees on the carton and product totals everywhere', () => {
    expect(placements).toHaveLength(winner.totalCartons);
    expect(analytics.totals.cartons).toBe(placements.length);
    expect(analytics.totals.products).toBe(placements.length * winner.carton.boxesPerCarton);
    expect(payload.analytics).toEqual(analytics);
    expect(csv).toContain(`Total boxes per pallet,${analytics.summary.totalBoxes}`);
    expect(csv).toContain(`Cartons per pallet,${analytics.summary.cartonsPerPallet}`);
  });

  it('draws the same load size in 3D as the analytics and the CSV report', () => {
    const d = dimensionLines(measuredBounds(winner, DEFAULT_INPUTS), {
      clearOf: loadBounds(winner, DEFAULT_INPUTS),
    });
    const label = (v: number) => `${formatNumber(v)} in`;
    expect(d.labels.map((l) => l.text)).toEqual([
      label(analytics.pallet.loadLength),
      label(analytics.pallet.loadWidth),
      label(analytics.pallet.totalLoadHeight),
    ]);
    expect(csv).toContain(`Load length (in),${formatNumber(analytics.pallet.loadLength)}`);
    expect(csv).toContain(`Load width (in),${formatNumber(analytics.pallet.loadWidth)}`);
    expect(csv).toContain(
      `Load total height (in),${formatNumber(analytics.pallet.totalLoadHeight)}`,
    );
    // The cartons' own extent is what the analytics call the load.
    const extent = (lo: (c: (typeof placements)[number]) => number, hi: typeof lo) =>
      Math.max(...placements.map(hi)) - Math.min(...placements.map(lo));
    expect(
      extent(
        (c) => c.x,
        (c) => c.x + c.dx,
      ),
    ).toBeCloseTo(analytics.pallet.loadLength, 9);
    expect(
      extent(
        (c) => c.y,
        (c) => c.y + c.dy,
      ),
    ).toBeCloseTo(analytics.pallet.loadWidth, 9);
  });
});
