/** A manual layout as the selected layout: the selector, analytics and the exports. */
import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../engine/analytics/analytics';
import { madeForOf } from '../engine/manual/build';
import { OVERHANGING_CARTONS, TEST_DESIGN } from '../engine/manual/testSupport';
import { cartonPlacements } from '../engine/packing/positions';
import { buildSheetContent } from '../export/buildSheet';
import { buildCsv, csvField } from '../export/csv';
import { renderBuildSheetPdf } from '../export/buildSheetPdf';
import {
  buildExportPayload,
  isManualSelected,
  MANUAL_OUT_OF_DATE_NOTE,
} from '../export/exportData';
import { captionLines } from '../export/png';
import { FakeStorage } from '../persistence/testStorage';
import type { ManualLayoutDraft } from './manualLayoutsStore';
import { manualStores } from './manualTestSupport';
import { selectSelected } from './resultsStore';
import {
  isManualRanked,
  selectedManualEntry,
  selectExportSource,
  selectSelectedLayout,
} from './selection';

const NOW = new Date(2026, 10, 12, 9, 5);

async function setup(storage = new FakeStorage()) {
  const t = manualStores(storage);
  // 2 in of overhang: the usable footprint is 52 x 44 and the test cartons overhang it.
  t.change({
    overhang: 2,
    weights: { productBox: 2, maxPallet: null, emptyCarton: 1, pallet: 40 },
  });
  await t.calculate();
  const draft = (over: Partial<ManualLayoutDraft> = {}): ManualLayoutDraft => ({
    design: TEST_DESIGN,
    cartons: OVERHANGING_CARTONS,
    upperLayers: 'alternate',
    madeFor: madeForOf(TEST_DESIGN, t.current()),
    ...over,
  });
  const selected = () => selectSelectedLayout(t.results.getState(), t.manualLayouts.getState());
  const source = () => selectExportSource(t.results.getState(), t.manualLayouts.getState());
  return { ...t, draft, selected, source, r: () => t.results.getState() };
}

describe('the selected layout', () => {
  it('is the selected calculated layout, with its inputs, when no manual one is selected', async () => {
    const t = await setup();
    t.manualLayouts.getState().save(t.draft());
    t.r().select(1);
    const s = t.selected()!;
    expect(s.ranked).toBe(t.r().result!.layouts[1]);
    expect(s.inputs).toBe(t.r().inputs);
    expect(s.stale).toBe(false);
    expect(s.ranked.manual).toBeUndefined();
    expect(isManualRanked(s.ranked)).toBe(false);
    expect(selectedManualEntry(t.r(), t.manualLayouts.getState())).toBeNull();
  });

  it('is null with nothing calculated and nothing selected', () => {
    const t = manualStores();
    expect(selectSelectedLayout(t.results.getState(), t.manualLayouts.getState())).toBeNull();
    expect(selectExportSource(t.results.getState(), t.manualLayouts.getState())).toBeNull();
  });

  it('is the manual layout once selected: same shape, marked, never ranked or scored', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft(), 'Dock 4');
    const resets = t.sceneResets.count;
    t.r().selectManual(spec!.id);
    expect(t.sceneResets.count).toBe(resets + 1);
    const entry = t.manualLayouts.getState().entries[0]!;
    const s = t.selected()!;
    expect(s.ranked).toBe(entry.ranked);
    expect(s.inputs).toBe(entry.build.inputs);
    expect(s.stale).toBe(false);
    expect(isManualRanked(s.ranked)).toBe(true);
    expect(s.ranked.manual).toEqual({
      id: spec!.id,
      name: 'Dock 4',
      flags: entry.build.flags,
      status: 'current',
      upperLayers: entry.spec.upperLayers,
      madeFor: entry.spec.madeFor,
    });
    expect(s.ranked.manual!.flags).toContainEqual({ kind: 'overhang', cartons: 2, by: 5 });
    expect(s.ranked.layout.id).toBe(`manual:${spec!.id}`);
    expect(t.r().result!.layouts.map((l) => l.layout.id)).not.toContain(s.ranked.layout.id);
    expect(s.ranked).toMatchObject({ rank: 0, explanation: '', score: { total: 0 } });
    // The calculated selection is untouched underneath.
    expect(selectSelected(t.r())).toBe(t.r().result!.layouts[0]);
  });

  it('selecting a calculated layout deselects the manual one', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft());
    t.r().selectManual(spec!.id);
    t.r().select(1);
    expect(t.r().selectedManualId).toBeNull();
    expect(t.selected()!.ranked).toBe(t.r().result!.layouts[1]);
    t.r().selectManual(spec!.id);
    t.r().selectManual(null);
    expect(t.selected()!.ranked).toBe(t.r().result!.layouts[1]);
  });

  it('a manual layout stays selected through a recalculation and is re-checked', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft());
    t.r().selectManual(spec!.id);
    const layers = t.selected()!.ranked.layout.layers.length;
    t.change({ pallet: { ...t.current().pallet, height: 30 } });
    await t.calculate();
    expect(t.r().selectedManualId).toBe(spec!.id);
    const s = t.selected()!;
    expect(s.ranked.manual!.id).toBe(spec!.id);
    expect(s.ranked.layout.layers.length).toBeLessThan(layers);
    expect(s.inputs.pallet.height).toBe(30);
  });

  it('an id no layout has selects nothing: the calculated layout shows', async () => {
    const t = await setup();
    t.r().selectManual('gone');
    expect(t.selected()!.ranked).toBe(t.r().result!.layouts[0]);
    expect(t.source()!.manual).toBeUndefined();
  });

  it('deleting the selected manual layout falls back to the first calculated layout', async () => {
    const t = await setup();
    const a = t.manualLayouts.getState().save(t.draft());
    const b = t.manualLayouts.getState().save(t.draft());
    t.r().select(2);
    t.r().selectManual(a!.id);
    t.manualLayouts.getState().remove(b!.id);
    expect(t.r().selectedManualId).toBe(a!.id);
    expect(t.r().selectedIndex).toBe(2);
    t.manualLayouts.getState().remove(a!.id);
    expect(t.r().selectedManualId).toBeNull();
    expect(t.r().selectedIndex).toBe(0);
    expect(t.selected()!.ranked).toBe(t.r().result!.layouts[0]);
  });

  it('falls back the same way when another tab deletes it, and with nothing calculated', async () => {
    const storage = new FakeStorage();
    const t = await setup(storage);
    const other = manualStores(storage);
    const a = t.manualLayouts.getState().save(t.draft());
    t.r().select(1);
    t.r().selectManual(a!.id);
    other.manualLayouts.getState().refresh();
    other.manualLayouts.getState().remove(a!.id);
    t.manualLayouts.getState().refresh();
    expect(t.r()).toMatchObject({ selectedManualId: null, selectedIndex: 0 });

    const bare = manualStores();
    const b = bare.manualLayouts.getState().save(t.draft());
    bare.results.getState().selectManual(b!.id);
    expect(
      selectSelectedLayout(bare.results.getState(), bare.manualLayouts.getState())!.ranked.manual!
        .id,
    ).toBe(b!.id);
    bare.manualLayouts.getState().remove(b!.id);
    expect(bare.results.getState().selectedManualId).toBeNull();
    expect(selectSelectedLayout(bare.results.getState(), bare.manualLayouts.getState())).toBeNull();
  });

  it('is stale while the inputs are invalid, and shows the last valid build', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft());
    t.r().selectManual(spec!.id);
    const before = t.selected()!;
    t.inputs.getState().setField('pallet.length', '');
    const s = t.selected()!;
    expect(s.stale).toBe(true);
    expect(s.ranked).toBe(before.ranked);
    expect(s.inputs).toBe(before.inputs);
    expect(t.source()!.stale).toBe(true);
  });
});

describe('analytics and exports of a selected manual layout', () => {
  it('an overhanging layout: analytics, placements, payload, CSV, caption and build sheet', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft(), 'Dock 4');
    t.r().selectManual(spec!.id);
    const { ranked, inputs } = t.selected()!;
    const layout = ranked.layout;

    const analytics = computeAnalytics(layout, inputs);
    expect(analytics.totals.cartons).toBe(layout.totalCartons);
    expect(analytics.totals.products).toBe(layout.totalProducts);
    expect(analytics.weight!.total).toBeGreaterThan(40);
    const placed = cartonPlacements(layout, inputs);
    expect(placed).toHaveLength(layout.totalCartons);
    expect(Math.min(...placed.map((c) => c.x))).toBeLessThan(0);

    const src = t.source()!;
    expect(src).toMatchObject({ selectedIndex: 0, stale: false, manual: ranked.manual });
    expect(src.inputs).toBe(inputs);
    expect(src.result.layouts).toEqual([ranked]);

    expect(src.manual).toBe(ranked.manual);
    const payload = buildExportPayload(
      src.inputs,
      src.result,
      src.selectedIndex,
      NOW,
      src.stale,
      src.manual,
    );
    expect(payload.status).toBe('Current');
    // Not ranked, not scored, not compared (review I4): null, and the marker says what it is.
    expect(payload.selectedLayout).toEqual({
      rank: null,
      score: null,
      explanation: null,
      layout,
      manual: ranked.manual,
    });
    expect(isManualSelected(payload.selectedLayout)).toBe(true);
    expect(payload.analytics).toEqual(analytics);
    expect(payload.notes).toEqual([]);
    expect(payload.comparison).toEqual([]);
    const json = JSON.parse(JSON.stringify(payload)) as {
      selectedLayout: { rank: unknown; score: unknown; manual: unknown; layout: typeof layout };
    };
    expect(json.selectedLayout.rank).toBeNull();
    expect(json.selectedLayout.score).toBeNull();
    expect(json.selectedLayout.manual).toMatchObject({
      id: spec!.id,
      name: 'Dock 4',
      status: 'current',
      upperLayers: 'alternate',
    });
    expect(json.selectedLayout.layout.layers[0]!.kind).toBe('manual');

    const csv = buildCsv(payload, 'in');
    const lines = csv.split('\r\n');
    expect(lines).toContain('Selected layout,Manual: Dock 4');
    expect(lines).toContain('Status,Current');
    expect(lines).toContain('Upper layers,Alternate layers turned');
    const flagRow = lines.find((l) => l.startsWith('Manual layout flags,'))!;
    expect(flagRow).toContain('2 cartons overhang the allowed footprint by up to 5.00 in');
    expect(flagRow).toContain('Carton is over the maximum carton size');
    expect(lines).toContain(`Total boxes per pallet,${layout.totalProducts}`);
    // No score, no "Layout 0", and no one-row comparison table of zeros.
    expect(csv).not.toMatch(/score|contribution/i);
    expect(lines).not.toContain('Selected layout,0');
    expect(lines.some((l) => l.startsWith('#,'))).toBe(false);
    expect(lines.filter((l) => l === '')).toHaveLength(1);
    expect(lines.some((l) => l.startsWith('Made for'))).toBe(false);

    const caption = captionLines(payload, 'in');
    expect(caption.at(-1)).toMatch(/^Manual layout: Dock 4 {3}\| {3}Exported /);
    expect(caption.join(' ')).not.toMatch(/Layout \d/);
    expect(caption.join(' ')).toContain(String(layout.totalProducts));

    const sheet = buildSheetContent({ ...src, jobName: 'Dock 4', now: NOW });
    expect(sheet.stale).toBe(false);
    expect(sheet.layoutNote).toBeNull();
    expect(sheet.manual).toEqual({
      heading: 'Manual layout: Dock 4',
      flags: [
        'Carton is over the maximum carton size by 1.00 in (longest side).',
        '2 cartons overhang the allowed footprint by up to 5.00 in.',
      ],
      notes: [],
    });
    // The footer names it; never "Layout 1 of 1".
    expect(sheet.layoutLabel).toBe('Manual layout: Dock 4');
    expect(sheet.palletAndLoad).toContainEqual({
      label: 'Upper layers',
      value: 'Alternate layers turned',
    });
    expect(sheet.summary.find((r) => r.label === 'Total boxes per pallet')!.value).toBe(
      String(layout.totalProducts),
    );
    // The manual layer and its turned twin are both drawn, each with its own letter.
    expect(sheet.patterns.map((p) => p.letter)).toEqual(['A', 'B']);
    expect(sheet.patterns[1]!.note).toContain('Pattern A turned half a turn');
    expect(sheet.patterns[0]!.drawing.cartons).toHaveLength(OVERHANGING_CARTONS.length);
    expect(new Set(sheet.stacking.map((r) => r.pattern))).toEqual(new Set(['A', 'B']));

    const pdf = new TextDecoder('latin1').decode(
      await (await renderBuildSheetPdf(sheet, null)).arrayBuffer(),
    );
    expect(pdf).toContain('(Manual layout: Dock 4)');
    expect(pdf).toContain('(Limits broken)');
    expect(pdf).toContain('(2 cartons overhang the allowed footprint by up to 5.00 in.)');
    expect(pdf).toContain('Manual layout: Dock 4 - Page 1 of');
    expect(pdf).not.toMatch(/Layout \d+ of \d+/);
    // The flags are drawn in the print error colour (red 700).
    expect(pdf).toMatch(/0\.7\d* 0\.1\d* 0\.1\d* rg/);
  });

  it('a manual layout under the minimum stability is marked in the exports', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft(), 'Low');
    t.r().selectManual(spec!.id);
    const rating = t.selected()!.ranked.layout.stability!.rating;
    const minimum = rating === 'good' ? 'good' : rating === 'fair' ? 'good' : 'fair';
    t.change({ minStability: minimum });
    await t.calculate();
    const src = t.source()!;
    const payload = buildExportPayload(src.inputs, src.result, 0, NOW, src.stale, src.manual);
    const marked = rating !== 'good';
    expect(payload.belowMinimum).toBe(marked);
    expect(buildCsv(payload, 'in').split('\r\n')).toContain(
      `Stability mark,${marked ? 'Below your minimum' : ''}`,
    );
    // What the setting did to the calculated list is not said of a manual layout.
    expect(payload.notes).toEqual([]);
    const sheet = buildSheetContent({ ...src, jobName: '', now: NOW });
    expect(sheet.palletAndLoad.some((r) => r.label === 'Minimum stability')).toBe(false);
    expect(sheet.palletAndLoad.find((r) => r.label === 'Stability')!.value).toContain(
      marked ? '(Below your minimum)' : '',
    );
  });

  it('an out-of-date layout: exported as it was made and marked out of date', async () => {
    const t = await setup();
    const made = t.current();
    const spec = t.manualLayouts.getState().save(t.draft({ upperLayers: 'same' }), 'Old');
    t.r().selectManual(spec!.id);
    const madeProducts = t.selected()!.ranked.layout.totalProducts;
    t.change({ product: { ...made.product, length: 13 } });
    await t.calculate();

    const s = t.selected()!;
    expect(s.ranked.manual!.status).toBe('outOfDate');
    expect(s.stale).toBe(true);
    // Its own inputs: the product it was made for, not the one the calculation now uses.
    expect(s.inputs.product).toEqual(made.product);
    expect(t.r().inputs!.product.length).toBe(13);
    expect(s.ranked.layout.carton.outer).toEqual(spec!.madeFor.outer);
    expect(s.ranked.layout.totalProducts).toBe(madeProducts);

    const analytics = computeAnalytics(s.ranked.layout, s.inputs);
    expect(analytics.totals.products).toBe(madeProducts);
    expect(cartonPlacements(s.ranked.layout, s.inputs)).toHaveLength(s.ranked.layout.totalCartons);

    const src = t.source()!;
    expect(src.stale).toBe(true);
    expect(src.inputs).toBe(s.inputs);
    const payload = buildExportPayload(
      src.inputs,
      src.result,
      src.selectedIndex,
      NOW,
      src.stale,
      src.manual,
    );
    expect(payload.status).toBe(MANUAL_OUT_OF_DATE_NOTE);
    expect(payload.inputs.product).toEqual(made.product);
    expect((payload.selectedLayout as typeof s.ranked).manual!.status).toBe('outOfDate');
    expect(payload.analytics).toEqual(analytics);
    const lines = buildCsv(payload, 'in').split('\r\n');
    expect(lines).toContain('Selected layout,Manual: Old');
    expect(lines).toContain(`Status,${csvField(MANUAL_OUT_OF_DATE_NOTE)}`);
    expect(lines).toContain('Made for product,12.00 × 8.00 × 4.00 in');
    expect(lines).toContain('Made for carton wall thickness (in),0.25');
    expect(lines).toContain('Made for box leeway (in),0.50');
    expect(captionLines(payload, 'in').at(-1)).toContain(MANUAL_OUT_OF_DATE_NOTE);
    const sheet = buildSheetContent({ ...src, jobName: '', now: NOW });
    expect(sheet.stale).toBe(true);
    expect(sheet.staleNote).toBe(
      'Out of date: this layout was made for a product of 12.00 × 8.00 × 4.00 in (carton wall 0.25 in, leeway 0.50 in). The inputs have changed since; it is shown as it was made.',
    );
    expect(sheet.patterns).toHaveLength(1);
    const pdf = new TextDecoder('latin1').decode(
      await (await renderBuildSheetPdf(sheet, null)).arrayBuffer(),
    );
    expect(pdf).toContain('Out of date: this layout was made for a product of');
    expect(pdf).toContain('(Manual layout: Old)');
  });

  it('a calculated selection exports with its whole result, as before', async () => {
    const t = await setup();
    t.manualLayouts.getState().save(t.draft());
    t.r().select(1);
    const src = t.source()!;
    expect(src.result).toBe(t.r().result);
    expect(src.inputs).toBe(t.r().inputs);
    expect(src).toMatchObject({ selectedIndex: 1, stale: false });
    expect(src.manual).toBeUndefined();
    t.r().markStale();
    expect(t.source()!.stale).toBe(true);
  });
});
