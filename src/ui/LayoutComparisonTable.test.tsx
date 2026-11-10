import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Inputs } from '../domain/types';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { flush, renderApp, summaryTile } from './testUtils';

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

  it('says the search was limited without blaming the time limit', async () => {
    await renderApp((i: Inputs) => Promise.resolve({ ...optimize(i), truncated: true }));
    expect(
      screen.getByText('Search was limited to keep it fast; results may not be the best possible.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/time limit/)).not.toBeInTheDocument();
  });
});
