/** A selected manual layout reaches the 3D view, the analytics and the exports like any other. */
import { act, renderHook, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { computeAnalytics } from '../engine/analytics/analytics';
import { madeForOf } from '../engine/manual/build';
import { OVERHANGING_CARTONS, TEST_DESIGN } from '../engine/manual/testSupport';
import { unusedSpace } from '../engine/analytics/unusedSpace';
import { useSceneData } from '../scene/useSceneData';
import type { ManualLayoutDraft } from '../store/manualLayoutsStore';
import { StoreProvider, type ResolvedStores } from './StoreContext';
import { flush, makeStores, renderApp, summaryTile } from './testUtils';
import { useSelectedAnalytics } from './useSelectedAnalytics';
import { useSelectedLayout } from './useSelectedLayout';

const mocks = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../export/download', () => ({ downloadBlob: mocks.downloadBlob }));

function draftFor(stores: ResolvedStores, over: Partial<ManualLayoutDraft> = {}) {
  const parsed = stores.inputs.getState().parsed;
  if (!parsed.ok) throw new Error('invalid inputs');
  return {
    design: TEST_DESIGN,
    cartons: OVERHANGING_CARTONS,
    upperLayers: 'alternate' as const,
    madeFor: madeForOf(TEST_DESIGN, parsed.inputs),
    ...over,
  };
}

async function hooks() {
  const stores = makeStores();
  const parsed = stores.inputs.getState().parsed;
  if (!parsed.ok) throw new Error('invalid inputs');
  await stores.results.getState().request(parsed.inputs);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreProvider stores={stores}>{children}</StoreProvider>
  );
  const view = renderHook(
    () => ({
      scene: useSceneData(),
      selected: useSelectedLayout(),
      analytics: useSelectedAnalytics(),
    }),
    { wrapper },
  );
  return { stores, now: () => view.result.current, renders: view };
}

describe('the scene data and analytics hooks', () => {
  it('give the calculated layout with the inputs of its calculation, as before', async () => {
    const { stores, now } = await hooks();
    const r = stores.results.getState();
    expect(now().scene.layout).toBe(r.result!.layouts[0]!.layout);
    expect(now().scene.inputs).toBe(r.inputs);
    expect(now().selected!.ranked.manual).toBeUndefined();
    expect(now().analytics!.analytics).toEqual(
      computeAnalytics(r.result!.layouts[0]!.layout, r.inputs!),
    );
    act(() => stores.results.getState().select(1));
    expect(now().scene.layout).toBe(r.result!.layouts[1]!.layout);
  });

  it('give a selected manual layout that overhangs: placements, bounds, analytics, unused space', async () => {
    const { stores, now } = await hooks();
    const before = now().selected;
    let id = '';
    act(() => {
      id = stores.manualLayouts.getState().save(draftFor(stores), 'Dock 4').id;
    });
    // Saving one does not select it or disturb what is shown.
    expect(now().selected).toBe(before);
    act(() => stores.results.getState().selectManual(id));

    const entry = stores.manualLayouts.getState().entries[0]!;
    const { scene, selected, analytics } = now();
    expect(scene.layout).toBe(entry.build.layout);
    expect(scene.inputs).toBe(entry.build.inputs);
    expect(scene.cartons).toHaveLength(entry.build.layout.totalCartons);
    expect(scene.cartons.some((c) => c.x < 0)).toBe(true);
    for (const b of [scene.bounds, scene.measured]) {
      for (const v of [...b.min, ...b.max]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(selected!.ranked.manual).toMatchObject({ id, name: 'Dock 4', status: 'current' });
    expect(selected!.ranked.manual!.flags.map((f) => f.kind)).toContain('overhang');
    expect(selected!.stale).toBe(false);
    expect(analytics!.ranked).toBe(entry.ranked);
    expect(analytics!.analytics).toEqual(computeAnalytics(entry.build.layout, entry.build.inputs));
    expect(analytics!.analytics.totals.products).toBe(entry.build.layout.totalProducts);
    // What the unused-space overlay draws from the same layout and inputs.
    const unused = unusedSpace(scene.layout!, scene.inputs!);
    expect(unused.gapVolume).toBeGreaterThan(0);
    expect(unused.gaps.every((g) => g.dx > 0 && g.dy > 0 && g.dz > 0)).toBe(true);

    // The same objects from one render to the next while nothing changed.
    const again = now();
    act(() => stores.scene.getState().toggle('showGrid'));
    expect(now().selected).toBe(again.selected);
    expect(now().scene.cartons).toBe(again.scene.cartons);

    // Re-checked at once when an input changes, without waiting for the search.
    act(() => stores.inputs.getState().setField('pallet.height', '30'));
    expect(now().scene.layout!.layers.length).toBeLessThan(entry.build.layout.layers.length);
    expect(now().scene.inputs!.pallet.height).toBe(30);

    act(() => stores.manualLayouts.getState().remove(id));
    expect(now().scene.layout).toBe(stores.results.getState().result!.layouts[0]!.layout);
  });

  it('give an out-of-date manual layout as it was made, marked stale', async () => {
    const { stores, now } = await hooks();
    let id = '';
    act(() => {
      id = stores.manualLayouts.getState().save(draftFor(stores)).id;
      stores.results.getState().selectManual(id);
    });
    const made = now().scene;
    act(() => stores.inputs.getState().setField('product.length', '13'));
    const { scene, selected, analytics } = now();
    expect(selected!.ranked.manual!.status).toBe('outOfDate');
    expect(selected!.stale).toBe(true);
    expect(scene.inputs!.product.length).toBe(12);
    expect(scene.layout!.carton).toEqual(made.layout!.carton);
    expect(scene.cartons).toHaveLength(made.cartons.length);
    expect(analytics!.analytics.totals.products).toBe(made.layout!.totalProducts);
    expect(analytics!.inputs).toBe(scene.inputs);
  });

  it('show the last valid build, stale, while the inputs are invalid', async () => {
    const { stores, now } = await hooks();
    act(() => {
      const { id } = stores.manualLayouts.getState().save(draftFor(stores));
      stores.results.getState().selectManual(id);
    });
    const before = now();
    act(() => stores.inputs.getState().setField('pallet.width', '0'));
    expect(now().selected!.stale).toBe(true);
    expect(now().scene.layout).toBe(before.scene.layout);
    expect(now().scene.cartons).toBe(before.scene.cartons);
  });
});

describe('in the app', () => {
  const selectManual = (stores: ResolvedStores, over?: Partial<ManualLayoutDraft>) => {
    const spec = stores.manualLayouts.getState().save(draftFor(stores, over), 'Dock 4');
    act(() => stores.results.getState().selectManual(spec.id));
    return stores.manualLayouts.getState().entries.find((e) => e.spec.id === spec.id)!;
  };

  it('the summary shows the selected manual layout and no calculated row is selected', async () => {
    const { stores } = await renderApp();
    const table = screen.getByRole('table', { name: 'Layout comparison' });
    const selectedRows = () =>
      within(table)
        .getAllByRole('row')
        .filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(selectedRows()).toHaveLength(1);
    const entry = selectManual(stores);
    await flush();
    expect(summaryTile('Total boxes per pallet')).toBe(String(entry.build.layout.totalProducts));
    expect(selectedRows()).toHaveLength(0);
    act(() => stores.results.getState().select(0));
    expect(selectedRows()).toHaveLength(1);
    expect(summaryTile('Total boxes per pallet')).toBe(
      String(stores.results.getState().result!.layouts[0]!.layout.totalProducts),
    );
  });

  it('the JSON and CSV exports are of the selected manual layout', async () => {
    mocks.downloadBlob.mockReset();
    const { user, stores } = await renderApp();
    const entry = selectManual(stores);
    await flush();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));
    const [blob] = mocks.downloadBlob.mock.calls[0] as [Blob, string];
    const parsed = JSON.parse(await blob.text()) as {
      status: string;
      selectedLayout: {
        layout: { id: string };
        manual: { name: string; flags: { kind: string }[] };
      };
      analytics: { totals: { products: number } };
      comparison: unknown[];
    };
    expect(parsed.selectedLayout.layout.id).toBe(entry.build.layout.id);
    expect(parsed.selectedLayout.manual.name).toBe('Dock 4');
    expect(parsed.selectedLayout.manual.flags.map((f) => f.kind)).toContain('overhang');
    expect(parsed.analytics.totals.products).toBe(entry.build.layout.totalProducts);
    expect(parsed.comparison).toHaveLength(1);
    expect(parsed.status).toBe('Current');

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    const [csv] = mocks.downloadBlob.mock.calls[1] as [Blob, string];
    expect(await csv.text()).toContain(String(entry.build.layout.totalProducts));
  });

  it('a scenario is saved with the manual layouts and loading it puts them back', async () => {
    const { user, stores } = await renderApp();
    const manual = () => stores.manualLayouts.getState();
    const kept = selectManual(stores).spec;
    await flush();
    await user.click(screen.getByRole('button', { name: 'Scenarios' }));
    const drawer = screen.getByRole('dialog', { name: 'Scenarios' });
    await user.click(within(drawer).getByRole('button', { name: 'Save current' }));
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    const scenario = stores.scenarios.getState().scenarios[0]!;
    expect(scenario.manualLayouts).toEqual([kept]);

    // Afterwards: the saved one is renamed, and another is added.
    act(() => {
      manual().rename(kept.id, 'Changed');
      manual().save(draftFor(stores, { upperLayers: 'same' }));
    });
    expect(manual().specs).toHaveLength(2);
    await user.click(within(drawer).getByRole('button', { name: 'Load' }));
    await flush();
    // Replaced, as the inputs and the result are: exactly what the scenario held.
    expect(manual().specs).toEqual([kept]);
    // The scenario's calculated selection shows; the manual one is not selected.
    expect(stores.results.getState()).toMatchObject({ selectedManualId: null, selectedIndex: 0 });
  });

  it('loading a scenario saved before manual layouts existed leaves them as they are', async () => {
    const { user, stores } = await renderApp();
    const r = stores.results.getState();
    act(() => {
      stores.scenarios.getState().save('Old', r.inputs!, r.result!, 0);
    });
    const kept = selectManual(stores).spec;
    await user.click(screen.getByRole('button', { name: 'Scenarios' }));
    const drawer = screen.getByRole('dialog', { name: 'Scenarios' });
    await user.click(within(drawer).getByRole('button', { name: 'Load' }));
    await flush();
    expect(stores.manualLayouts.getState().specs).toEqual([kept]);
  });
});
