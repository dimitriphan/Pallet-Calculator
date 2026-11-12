/** A manual layout as the selected layout: the selector, analytics and the exports. */
import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../engine/analytics/analytics';
import { madeForOf } from '../engine/manual/build';
import { OVERHANGING_CARTONS, TEST_DESIGN } from '../engine/manual/testSupport';
import { cartonPlacements } from '../engine/packing/positions';
import { buildSheetContent } from '../export/buildSheet';
import { buildCsv } from '../export/csv';
import { buildExportPayload, STALE_NOTE } from '../export/exportData';
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
    t.r().selectManual(spec.id);
    expect(t.sceneResets.count).toBe(resets + 1);
    const entry = t.manualLayouts.getState().entries[0]!;
    const s = t.selected()!;
    expect(s.ranked).toBe(entry.ranked);
    expect(s.inputs).toBe(entry.build.inputs);
    expect(s.stale).toBe(false);
    expect(isManualRanked(s.ranked)).toBe(true);
    expect(s.ranked.manual).toEqual({
      id: spec.id,
      name: 'Dock 4',
      flags: entry.build.flags,
      status: 'current',
    });
    expect(s.ranked.manual!.flags).toContainEqual({ kind: 'overhang', cartons: 2, by: 5 });
    expect(s.ranked.layout.id).toBe(`manual:${spec.id}`);
    expect(t.r().result!.layouts.map((l) => l.layout.id)).not.toContain(s.ranked.layout.id);
    expect(s.ranked).toMatchObject({ rank: 0, explanation: '', score: { total: 0 } });
    // The calculated selection is untouched underneath.
    expect(selectSelected(t.r())).toBe(t.r().result!.layouts[0]);
  });

  it('selecting a calculated layout deselects the manual one', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft());
    t.r().selectManual(spec.id);
    t.r().select(1);
    expect(t.r().selectedManualId).toBeNull();
    expect(t.selected()!.ranked).toBe(t.r().result!.layouts[1]);
    t.r().selectManual(spec.id);
    t.r().selectManual(null);
    expect(t.selected()!.ranked).toBe(t.r().result!.layouts[1]);
  });

  it('a manual layout stays selected through a recalculation and is re-checked', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft());
    t.r().selectManual(spec.id);
    const layers = t.selected()!.ranked.layout.layers.length;
    t.change({ pallet: { ...t.current().pallet, height: 30 } });
    await t.calculate();
    expect(t.r().selectedManualId).toBe(spec.id);
    const s = t.selected()!;
    expect(s.ranked.manual!.id).toBe(spec.id);
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
    t.r().selectManual(a.id);
    t.manualLayouts.getState().remove(b.id);
    expect(t.r().selectedManualId).toBe(a.id);
    expect(t.r().selectedIndex).toBe(2);
    t.manualLayouts.getState().remove(a.id);
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
    t.r().selectManual(a.id);
    other.manualLayouts.getState().refresh();
    other.manualLayouts.getState().remove(a.id);
    t.manualLayouts.getState().refresh();
    expect(t.r()).toMatchObject({ selectedManualId: null, selectedIndex: 0 });

    const bare = manualStores();
    const b = bare.manualLayouts.getState().save(t.draft());
    bare.results.getState().selectManual(b.id);
    expect(
      selectSelectedLayout(bare.results.getState(), bare.manualLayouts.getState())!.ranked.manual!
        .id,
    ).toBe(b.id);
    bare.manualLayouts.getState().remove(b.id);
    expect(bare.results.getState().selectedManualId).toBeNull();
    expect(selectSelectedLayout(bare.results.getState(), bare.manualLayouts.getState())).toBeNull();
  });

  it('is stale while the inputs are invalid, and shows the last valid build', async () => {
    const t = await setup();
    const spec = t.manualLayouts.getState().save(t.draft());
    t.r().selectManual(spec.id);
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
    t.r().selectManual(spec.id);
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

    const payload = buildExportPayload(src.inputs, src.result, src.selectedIndex, NOW, src.stale);
    expect(payload.status).toBe('Current');
    expect(payload.selectedLayout).toBe(ranked);
    expect(payload.analytics).toEqual(analytics);
    expect(payload.notes).toEqual([]);
    expect(payload.comparison).toHaveLength(1);
    expect(payload.comparison[0]!.products).toBe(layout.totalProducts);
    const json = JSON.parse(JSON.stringify(payload)) as typeof payload;
    expect((json.selectedLayout as typeof ranked).manual).toMatchObject({
      id: spec.id,
      name: 'Dock 4',
      status: 'current',
    });
    expect(json.selectedLayout.layout.layers[0]!.kind).toBe('manual');
    expect(buildCsv(payload, 'in')).toContain(String(layout.totalProducts));
    expect(captionLines(payload, 'in').join(' ')).toContain(String(layout.totalProducts));

    const sheet = buildSheetContent({ ...src, jobName: 'Dock 4', now: NOW });
    expect(sheet.stale).toBe(false);
    expect(sheet.layoutNote).toBeNull();
    expect(sheet.summary.find((r) => r.label === 'Total boxes per pallet')!.value).toBe(
      String(layout.totalProducts),
    );
    // The manual layer and its turned twin are both drawn.
    expect(sheet.patterns).toHaveLength(2);
    expect(sheet.patterns[0]!.drawing.cartons).toHaveLength(OVERHANGING_CARTONS.length);
  });

  it('an out-of-date layout: exported as it was made and marked out of date', async () => {
    const t = await setup();
    const made = t.current();
    const spec = t.manualLayouts.getState().save(t.draft({ upperLayers: 'same' }), 'Old');
    t.r().selectManual(spec.id);
    const madeProducts = t.selected()!.ranked.layout.totalProducts;
    t.change({ product: { ...made.product, length: 13 } });
    await t.calculate();

    const s = t.selected()!;
    expect(s.ranked.manual!.status).toBe('outOfDate');
    expect(s.stale).toBe(true);
    // Its own inputs: the product it was made for, not the one the calculation now uses.
    expect(s.inputs.product).toEqual(made.product);
    expect(t.r().inputs!.product.length).toBe(13);
    expect(s.ranked.layout.carton.outer).toEqual(spec.madeFor.outer);
    expect(s.ranked.layout.totalProducts).toBe(madeProducts);

    const analytics = computeAnalytics(s.ranked.layout, s.inputs);
    expect(analytics.totals.products).toBe(madeProducts);
    expect(cartonPlacements(s.ranked.layout, s.inputs)).toHaveLength(s.ranked.layout.totalCartons);

    const src = t.source()!;
    expect(src.stale).toBe(true);
    expect(src.inputs).toBe(s.inputs);
    const payload = buildExportPayload(src.inputs, src.result, src.selectedIndex, NOW, src.stale);
    expect(payload.status).toBe(STALE_NOTE);
    expect(payload.inputs.product).toEqual(made.product);
    expect((payload.selectedLayout as typeof s.ranked).manual!.status).toBe('outOfDate');
    expect(payload.analytics).toEqual(analytics);
    expect(buildCsv(payload, 'in')).toContain(STALE_NOTE);
    const sheet = buildSheetContent({ ...src, jobName: '', now: NOW });
    expect(sheet.stale).toBe(true);
    expect(sheet.patterns).toHaveLength(1);
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
