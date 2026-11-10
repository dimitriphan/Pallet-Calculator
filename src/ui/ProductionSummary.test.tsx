import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../engine/analytics/analytics';
import { ProductionSummary } from './ProductionSummary';
import { StoreProvider } from './StoreContext';
import { makeStores, renderApp, summaryTile } from './testUtils';

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
});
