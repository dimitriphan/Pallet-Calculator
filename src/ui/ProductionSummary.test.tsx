import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../engine/analytics/analytics';
import { ProductionSummary } from './ProductionSummary';
import { StoreProvider } from './StoreContext';
import { flush, makeStores, renderApp, summaryTile } from './testUtils';

const LABELS = [
  'Boxes per carton',
  'Cartons per layer',
  'Layers',
  'Cartons per pallet',
  'Total boxes per pallet',
];

describe('ProductionSummary', () => {
  it('shows the analytics summary of the selected layout', async () => {
    const { stores } = await renderApp();
    const s = stores.results.getState();
    const expected = computeAnalytics(s.result!.layouts[0]!.layout, s.inputs!).summary;
    expect(LABELS.map(summaryTile)).toEqual([
      String(expected.boxesPerCarton),
      expected.cartonsPerLayer,
      String(expected.layers),
      String(expected.cartonsPerPallet),
      String(expected.totalBoxes),
    ]);
  });

  it('shows a dash in every tile when there is no layout', () => {
    render(
      <StoreProvider stores={makeStores()}>
        <ProductionSummary />
      </StoreProvider>,
    );
    expect(LABELS.map(summaryTile)).toEqual(['—', '—', '—', '—', '—']);
  });

  it('marks the summary, details and 3D slot "Out of date" while a field is invalid', async () => {
    const { user } = await renderApp();
    const summary = screen.getByRole('region', { name: 'Production summary' });
    const details = screen.getByRole('complementary', { name: 'Details' });
    const slot = screen.getByTestId('scene-slot');
    const badges = () =>
      [summary, details, slot].map((r) => within(r).queryAllByText('Out of date').length);
    expect(badges()).toEqual([0, 0, 0]);

    const length = within(screen.getByRole('group', { name: 'Pallet limitation' })).getByRole(
      'textbox',
      { name: 'Length' },
    );
    await user.clear(length);
    await user.type(length, 'abc');
    await flush();
    expect(badges()).toEqual([1, 1, 1]);
    // The old result stays on screen, dimmed.
    expect(summaryTile('Total boxes per pallet')).toBe('260');
    expect(summary.querySelector('dl')).toHaveClass('opacity-50');
    // Harbor never fades text: the values turn mist instead.
    expect(summary.querySelector('dl')).toHaveClass('dark:opacity-100');
    expect(summary.querySelector('dd')).toHaveClass('dark:text-harbor-mist');

    await user.clear(length);
    await user.type(length, '50');
    await flush();
    expect(badges()).toEqual([0, 0, 0]);
  });
});
