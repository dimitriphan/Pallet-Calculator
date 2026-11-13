/** Exports and stored results for a layer placed by hand: overhanging and negative positions. */
import { describe, expect, it } from 'vitest';
import { optimizeResultSchema } from '../domain/resultSchemas';
import { scenarioSchema } from '../domain/schemas';
import { computeAnalytics } from '../engine/analytics/analytics';
import { buildManualLayout } from '../engine/manual/build';
import {
  manualSpec,
  overhangingLayout,
  OVERHANG_INPUTS as I,
  resultOf,
} from '../engine/manual/testSupport';
import type { ManualMarker } from '../store/manualLayoutsStore';
import { buildSheetContent, drawingBounds } from './buildSheet';
import { renderBuildSheetPdf } from './buildSheetPdf';
import { buildCsv } from './csv';
import { buildExportPayload } from './exportData';
import { captionLines } from './png';

const NOW = new Date(2026, 10, 12, 9, 5);
const L = overhangingLayout();
const RESULT = resultOf(L);
const sheet = () =>
  buildSheetContent({
    inputs: I,
    result: RESULT,
    selectedIndex: 0,
    jobName: 'Manual',
    stale: false,
    now: NOW,
  });

describe('stored results', () => {
  it("a layout with kind 'manual' layers validates and comes back unchanged", () => {
    const stored = JSON.parse(JSON.stringify(RESULT)) as unknown;
    const parsed = optimizeResultSchema.parse(stored);
    expect(parsed).toEqual(RESULT);
    expect(parsed.layouts[0]!.layout.layers[0]!.kind).toBe('manual');
    expect(parsed.layouts[0]!.layout.layers[0]!.blocks[0]).toEqual({
      x: -3,
      y: -2,
      cols: 1,
      rows: 1,
      rotated: false,
    });
  });

  it('a scenario holding a manual layout validates', () => {
    const scenario = {
      id: 's1',
      name: 'With a manual layout',
      savedAt: NOW.toISOString(),
      inputs: I,
      result: RESULT,
      selectedIndex: 0,
      analytics: computeAnalytics(L, I),
    };
    const parsed = scenarioSchema.parse(JSON.parse(JSON.stringify(scenario)));
    expect(parsed.result.layouts[0]!.layout.id).toBe('manual:test');
    expect(parsed.analytics).toEqual(scenario.analytics);
  });

  it('an unknown layer kind is still refused', () => {
    const bad = JSON.parse(JSON.stringify(RESULT)) as typeof RESULT;
    (bad.layouts[0]!.layout.layers[0] as { kind: string }).kind = 'spiral';
    expect(optimizeResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe('build sheet for a manual layout', () => {
  const s = sheet();

  it('draws every carton where it stands, outside the footprint included', () => {
    expect(s.patterns).toHaveLength(2);
    const [a, b] = s.patterns;
    expect(a!.drawing.cartons).toEqual([
      { x: -3, y: -2, dx: 25, dy: 17 },
      { x: 32, y: 20, dx: 25, dy: 17 },
      { x: 5, y: 16, dx: 17, dy: 25 },
    ]);
    expect(a!.drawing.footprint).toEqual({ x: 52, y: 44 });
    expect(a!.drawing.pallet).toEqual({ x: 1, y: 1, dx: 50, dy: 42 });
    // The drawing's bounds reach every carton: the frame grows, nothing is cut off.
    expect(a!.drawing.bounds).toEqual({ x: -3, y: -2, dx: 60, dy: 46 });
    expect(b!.drawing.bounds).toEqual({ x: -5, y: 0, dx: 60, dy: 46 });
    for (const p of s.patterns) {
      const { bounds, cartons } = p.drawing;
      for (const c of cartons) {
        expect(c.x).toBeGreaterThanOrEqual(bounds.x);
        expect(c.y).toBeGreaterThanOrEqual(bounds.y);
        expect(c.x + c.dx).toBeLessThanOrEqual(bounds.x + bounds.dx);
        expect(c.y + c.dy).toBeLessThanOrEqual(bounds.y + bounds.dy);
      }
    }
  });

  it('labels no blocks and says the layer is placed by hand', () => {
    for (const p of s.patterns) {
      expect(p.drawing.blocks).toEqual([]);
      expect(p.facts.map((f) => f.label)).not.toContain('Blocks (rows × columns)');
      expect(p.facts).toContainEqual({
        label: 'Arrangement',
        value: 'Placed by hand: build as drawn',
      });
      expect(p.facts).toContainEqual({ label: 'Cartons in layer', value: '3' });
    }
    expect(s.patterns[0]!.facts).toContainEqual({
      label: 'Carton footprint as placed',
      value: '25.00 × 17.00 in (some turned 90°)',
    });
  });

  it('gives the turned layer its own pattern letter and says what it is a turn of', () => {
    expect(s.patterns.map((p) => p.letter)).toEqual(['A', 'B']);
    expect(s.patterns[1]!.note).toBe('Pattern A turned half a turn (180°).');
    expect(s.patterns[0]!.note).toBeUndefined();
    expect(s.stacking.map((r) => r.pattern).join('')).toBe('ABABABABABABA');
    expect(s.palletAndLoad).toContainEqual({
      label: 'Finished load',
      value: '62.00 × 48.00 × 70.00 in including pallet',
    });
  });

  it('the bounds of a drawing with every carton inside are the footprint itself', () => {
    expect(drawingBounds({ x: 52, y: 44 }, [{ x: 0, y: 0, dx: 25, dy: 17 }])).toEqual({
      x: 0,
      y: 0,
      dx: 52,
      dy: 44,
    });
    // Float noise at an edge does not grow them.
    expect(drawingBounds({ x: 52, y: 44 }, [{ x: -1e-13, y: 27, dx: 52, dy: 17 + 1e-13 }])).toEqual(
      {
        x: 0,
        y: 0,
        dx: 52,
        dy: 44,
      },
    );
  });

  it('renders to a PDF', async () => {
    const blob = await renderBuildSheetPdf(s, null);
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).not.toContain('NaN');
    expect(text).toContain('Placed by hand');
  });
});

describe('exports of a manual layout', () => {
  it('JSON, CSV and the PNG caption are built without a negative or NaN figure', () => {
    const payload = buildExportPayload(I, RESULT, 0, NOW);
    expect(payload.selectedLayout.layout.id).toBe('manual:test');
    expect(payload.analytics.totals.remainingVolume).toBeGreaterThanOrEqual(0);
    expect(payload.comparison[0]!.remainingVolume).toBeGreaterThanOrEqual(0);
    expect(payload.comparison[0]!.utilizationPct).toBeLessThanOrEqual(100);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('null,null');
    const csv = buildCsv(payload);
    expect(csv).not.toMatch(/NaN|Infinity/);
    // Two free-standing groups, the narrower 17 in across under 65 in of stack; the worst
    // bottom carton has 294 of its 425 sq in on the pallet.
    const lines = csv.split('\r\n');
    expect(lines).toContain(
      'Stack height ÷ shorter side of the narrowest free-standing group,3.82',
    );
    expect(lines.some((l) => l.startsWith('Stack height ÷ shorter side of base,'))).toBe(false);
    expect(lines).toContain('Least share of a bottom carton resting on the pallet,69%');
    expect(captionLines(payload).join('\n')).not.toMatch(/NaN|Infinity/);
  });
});

describe('"Below your minimum" on the exports of a manual layout', () => {
  // The overhanging layout rates Poor, so Good only puts it under the minimum.
  const spec = manualSpec();
  const exportsUnder = (inputs: typeof I) => {
    const build = buildManualLayout(spec, inputs);
    const manual: ManualMarker = {
      id: spec.id,
      name: spec.name,
      flags: build.flags,
      status: build.status,
      upperLayers: spec.upperLayers,
      madeFor: spec.madeFor,
    };
    const stale = build.status === 'outOfDate';
    const result = resultOf(build.layout);
    const payload = buildExportPayload(build.inputs, result, 0, NOW, stale, manual);
    const sheet = buildSheetContent({
      inputs: build.inputs,
      result,
      selectedIndex: 0,
      jobName: '',
      stale,
      now: NOW,
      manual,
    });
    return { build, payload, sheet, csv: buildCsv(payload).split('\r\n') };
  };
  const stabilityRow = (sheet: ReturnType<typeof exportsUnder>['sheet']) =>
    sheet.palletAndLoad.find((r) => r.label === 'Stability')!.value;

  it('is said of a current layout that rates under the minimum', () => {
    const { build, payload, sheet, csv } = exportsUnder({ ...I, minStability: 'good' });
    expect(build.status).toBe('current');
    expect(build.layout.stability!.rating).toBe('poor');
    expect(payload.belowMinimum).toBe(true);
    expect(csv).toContain('Stability mark,Below your minimum');
    expect(stabilityRow(sheet)).toBe('Poor (Below your minimum)');
  });

  it('is not said of an out-of-date layout, as the screen does not say it', async () => {
    const { build, payload, sheet, csv } = exportsUnder({
      ...I,
      minStability: 'good',
      product: { ...I.product, length: 13 },
    });
    expect(build.status).toBe('outOfDate');
    expect(build.layout.stability!.rating).toBe('poor');
    expect(payload.belowMinimum).toBe(false);
    expect(csv).toContain('Stability mark,');
    expect(csv.join('\n')).not.toContain('Below your minimum');
    expect(stabilityRow(sheet)).toBe('Poor');
    const pdf = new TextDecoder('latin1').decode(
      await (await renderBuildSheetPdf(sheet, null)).arrayBuffer(),
    );
    expect(pdf).not.toContain('Below your minimum');
  });
});
