import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Inputs } from '../domain/types';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { flush, renderApp, summaryTile } from './testUtils';

type Stores = Awaited<ReturnType<typeof renderApp>>['stores'];

/** The pinned pinwheel case, typed into the fields. */
const PINWHEEL_FIELDS: Record<string, string> = {
  'pallet.length': '48',
  'pallet.width': '40',
  'pallet.height': '60',
  'product.length': '16.5',
  'product.width': '10.5',
  'product.height': '18',
  'maxCarton.length': '16.5',
  'maxCarton.width': '10.5',
  'maxCarton.height': '18',
  leeway: '0',
  wallThickness: '0',
};

async function setFields(stores: Stores, values: Record<string, string>) {
  act(() => {
    for (const [path, value] of Object.entries(values))
      stores.inputs.getState().setField(path, value);
  });
  await flush();
}

function tableRows() {
  return within(screen.getByRole('table', { name: 'Layout comparison' }))
    .getAllByRole('row')
    .slice(1);
}

async function setTarget(user: Awaited<ReturnType<typeof renderApp>>['user'], value: string) {
  const target = screen.getByRole('textbox', { name: 'Desired box quantity' });
  await user.clear(target);
  await user.type(target, value);
  await flush();
}

describe('LayoutComparisonTable', () => {
  it('selects a row on click and the summary follows it', async () => {
    const { user, stores } = await renderApp();
    const rows = tableRows();
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');

    await user.click(rows[1] as HTMLElement);
    expect(tableRows()[1]).toHaveAttribute('aria-selected', 'true');
    expect(tableRows()[0]).toHaveAttribute('aria-selected', 'false');
    expect(tableRows()[1]).toHaveAttribute('aria-current', 'true');
    expect(tableRows()[0]).not.toHaveAttribute('aria-current');

    const s = stores.results.getState();
    const expected = computeAnalytics(s.result!.layouts[1]!.layout, s.inputs!).summary;
    expect(summaryTile('Boxes per carton')).toBe(String(expected.boxesPerCarton));
    expect(summaryTile('Cartons per layer')).toBe(expected.cartonsPerLayer);
    expect(summaryTile('Layers')).toBe(String(expected.layers));
    expect(summaryTile('Cartons per pallet')).toBe(String(expected.cartonsPerPallet));
    expect(summaryTile('Total boxes per pallet')).toBe(String(expected.totalBoxes));
  });

  it('selects a row with Enter and Space', async () => {
    const { user } = await renderApp();
    (tableRows()[1] as HTMLElement).focus();
    await user.keyboard('{Enter}');
    expect(tableRows()[1]).toHaveAttribute('aria-selected', 'true');
    (tableRows()[0] as HTMLElement).focus();
    await user.keyboard(' ');
    expect(tableRows()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the target status beside the product count', async () => {
    const { user } = await renderApp();
    expect(screen.queryByText(/^Target /)).not.toBeInTheDocument();
    await setTarget(user, '1');
    expect(within(tableRows()[0] as HTMLElement).getByText('Target exceeded')).toBeInTheDocument();
    await setTarget(user, '999999');
    expect(
      within(tableRows()[0] as HTMLElement).getByText('Target not achievable'),
    ).toBeInTheDocument();
  });

  it('shows the comparison columns', async () => {
    await renderApp();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      '#',
      'Carton (in)',
      'Products',
      'Cartons',
      'Layers',
      'Utilization',
      'Remaining volume (in³)',
      'Score',
    ]);
  });

  it('marks a layout with a pinwheel layer "Pinwheel" in the Layers column', async () => {
    const { stores } = await renderApp();
    expect(screen.queryByText('Pinwheel')).not.toBeInTheDocument();
    await setFields(stores, PINWHEEL_FIELDS);
    const layouts = stores.results.getState().result!.layouts;
    expect(layouts[0]!.layout.totalProducts).toBe(30);
    const rows = tableRows();
    layouts.forEach(({ layout }, k) => {
      const pinwheel = layout.layers.some((l) => l.kind === 'pinwheel');
      const cells = within(rows[k] as HTMLElement).getAllByRole('cell');
      // The Layers cell: the layer count, with the badge only for a pinwheel layout.
      expect(cells[4]?.textContent).toBe(`${layout.layers.length}${pinwheel ? 'Pinwheel' : ''}`);
    });
    expect(within(rows[0] as HTMLElement).getByText('Pinwheel')).toBeInTheDocument();
    // The headers are unchanged.
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
  });

  it('shows a stored result whose layers have no kind as before, without "Pinwheel"', async () => {
    const stripKinds = (i: Inputs) => {
      const r = structuredClone(optimize(i));
      for (const { layout } of r.layouts) for (const layer of layout.layers) delete layer.kind;
      return Promise.resolve(r);
    };
    const { stores } = await renderApp(stripKinds);
    await setFields(stores, PINWHEEL_FIELDS);
    expect(tableRows().length).toBeGreaterThan(1);
    expect(screen.queryByText('Pinwheel')).not.toBeInTheDocument();
    expect(within(tableRows()[0] as HTMLElement).getAllByRole('cell')[4]?.textContent).toBe('3');
  });

  it('says the search was limited without blaming the time limit', async () => {
    await renderApp((i: Inputs) => Promise.resolve({ ...optimize(i), truncated: true }));
    expect(
      screen.getByText('Search was limited to keep it fast; results may not be the best possible.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/time limit/)).not.toBeInTheDocument();
  });
});
