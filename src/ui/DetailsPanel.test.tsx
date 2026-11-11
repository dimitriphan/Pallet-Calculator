import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cartonPlacements } from '../engine/packing/positions';
import { formatNumber } from '../engine/units/units';
import { flush, renderApp } from './testUtils';

describe('DetailsPanel', () => {
  it('has Analytics, Explanation and Selection tabs', async () => {
    const { user } = await renderApp();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Analytics', 'Explanation', 'Selection']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await user.click(tabs[2] as HTMLElement);
    expect(screen.getByRole('tab', { name: 'Selection' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Click an object in the 3D view to see its details.',
    );
  });

  it('lists the analytics groups, with the maximum quantity when a target is set', async () => {
    const { user } = await renderApp();
    const panel = screen.getByRole('tabpanel');
    for (const h of ['Product', 'Carton', 'Pallet', 'Final results'])
      expect(within(panel).getByRole('heading', { name: h })).toBeInTheDocument();
    expect(within(panel).queryByText('Maximum quantity possible')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Desired box quantity' }), '10');
    await flush();
    expect(
      within(screen.getByRole('tabpanel')).getByText('Maximum quantity possible'),
    ).toBeInTheDocument();
  });

  it('lists the stability rating, its warnings and every check with its value', async () => {
    await renderApp();
    const section = screen.getByRole('heading', { name: 'Stability' }).closest('section')!;
    const s = within(section);
    const value = (label: string) =>
      s.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(value('Rating')).toBe('Stability: Fair');
    expect(
      s.getByText('Stack is tall for its base (1.6 times its shorter side).'),
    ).toBeInTheDocument();
    // 67 in of stack over the 42 in side of the bottom layer.
    expect(value('Stack height ÷ shorter side of base')).toBe('1.60');
    // Layer 1 stands 13 in tall on a 9 in side.
    expect(value('Carton height ÷ shorter base side, worst layer')).toBe('1.44 (layer 1)');
    // Layer 2 (two 13 x 42 columns and a 21 x 39 block: 47 x 42, 1911 in²) centred on layer 1
    // (45 x 42): 1 in overhangs on each side, 42 + 39 in² unsupported: 1830 / 1911 = 95.8%.
    expect(value('Least support from the layer below')).toBe('95% (layer 2)');
    expect(value('Most identical layers in straight columns')).toBe('1');
    expect(value('Layers turned half a turn (180°)')).toBe('3, 5, 7');
  });

  it('shows how the boxes sit inside the carton', async () => {
    await renderApp();
    const carton = screen.getByRole('heading', { name: 'Carton' }).closest('section')!;
    const value = (label: string) =>
      within(carton).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(value('Boxes along product length × width × height')).toBe('1 × 1 × 5');
    expect(value('Product side facing up')).toBe('Length up: 1 layer; Width up: 6 layers');
  });

  it('shows score contributions of the selected layout to two decimals', async () => {
    const { user, stores } = await renderApp();
    await user.click(screen.getByRole('tab', { name: 'Explanation' }));
    const panel = screen.getByRole('tabpanel');
    const selected = stores.results.getState().result!.layouts[0]!;
    const { score } = selected;
    const contribution = (name: string) => {
      const cells = within(
        within(panel).getByRole('row', { name: new RegExp(`^${name}`) }),
      ).getAllByRole('cell');
      return cells[cells.length - 1]?.textContent;
    };
    expect(contribution('Quantity')).toBe(formatNumber(score.quantityContribution));
    expect(contribution('Utilization')).toBe(formatNumber(score.utilizationContribution));
    expect(contribution('Space')).toBe(formatNumber(score.spaceContribution));
    expect(panel).toHaveTextContent(formatNumber(score.total));
    expect(panel).toHaveTextContent(selected.explanation);
  });

  it('describes a selected carton', async () => {
    const { user, stores } = await renderApp();
    await user.click(screen.getByRole('tab', { name: 'Selection' }));
    act(() => stores.scene.getState().setSelection({ kind: 'carton', cartonIndex: 0 }));
    const s = stores.results.getState();
    const layout = s.result!.layouts[0]!.layout;
    const carton = cartonPlacements(layout, s.inputs!)[0]!;
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent(
      `${formatNumber(carton.dx)} × ${formatNumber(carton.dy)} × ${formatNumber(carton.dz)}`,
    );
    expect(panel).toHaveTextContent(`${formatNumber(layout.carton.utilization * 100)}%`);
  });

  it('labels product coordinates from the load corner and the pallet top', async () => {
    const { user, stores } = await renderApp();
    await user.click(screen.getByRole('tab', { name: 'Selection' }));
    act(() =>
      stores.scene.getState().setSelection({ kind: 'product', cartonIndex: 0, productIndex: 0 }),
    );
    const panel = screen.getByRole('tabpanel');
    for (const label of ['X (from load corner)', 'Y (from load corner)', 'Z (above pallet top)'])
      expect(within(panel).getByText(label)).toBeInTheDocument();
  });
});
