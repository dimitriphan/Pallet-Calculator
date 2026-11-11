import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { flush, renderApp, type StoreOptions } from './testUtils';

type Stores = Awaited<ReturnType<typeof renderApp>>['stores'];

const BOX = 'Weight per product box';
const MAX = 'Maximum pallet weight';
const CARTON = 'Empty carton weight';
const PALLET = 'Pallet weight';
const BOX_NEEDED = 'Enter the weight of one product box to use a maximum pallet weight.';
const MAX_TOO_LOW = "The maximum must be more than the pallet's own weight.";
const OVER_WEIGHT = 'Nothing fits: one layer is already over the maximum pallet weight.';

const render = (viewMode: StoreOptions['viewMode'] = 'full') => renderApp(undefined, { viewMode });

function weightGroup() {
  return screen.getByRole('group', { name: 'Weight' });
}

function weightField(label: string) {
  return within(weightGroup()).getByRole('textbox', { name: label });
}

/** The unit suffix shown after a field. */
function suffixOf(label: string) {
  return weightField(label).nextElementSibling?.textContent;
}

async function setWeights(stores: Stores, values: Record<string, string>) {
  act(() => {
    for (const [key, value] of Object.entries(values))
      stores.inputs.getState().setField(`weights.${key}`, value);
  });
  await flush();
}

function card() {
  return screen.getByRole('region', { name: 'What to build' });
}

function table() {
  return screen.getByRole('table', { name: 'Layout comparison' });
}

function analyticsValue(label: string) {
  return within(screen.getByRole('tabpanel')).getByText(label, { selector: 'dt' })
    .nextElementSibling?.textContent;
}

describe('weight inputs', () => {
  it('shows the box weight and maximum in Basic view', async () => {
    await render('basic');
    expect(weightField(BOX)).toHaveValue('');
    expect(weightField(MAX)).toHaveValue('');
    expect(within(weightGroup()).queryByRole('textbox', { name: CARTON })).toBeNull();
    expect(within(weightGroup()).queryByRole('textbox', { name: PALLET })).toBeNull();
    expect(suffixOf(BOX)).toBe('lb');
  });

  it('adds the empty carton and pallet weights in Full view, in lb', async () => {
    await render();
    const names = within(weightGroup())
      .getAllByRole('textbox')
      .map((f) => (f as HTMLInputElement).labels?.[0]?.textContent);
    expect(names).toEqual([BOX, MAX, CARTON, PALLET]);
    expect(weightField(CARTON)).toHaveValue('0');
    expect(weightField(PALLET)).toHaveValue('40');
    for (const label of names) expect(suffixOf(label!)).toBe('lb');
  });

  it('shows the weights in kg with cm or mm', async () => {
    const { stores } = await render();
    act(() => stores.inputs.getState().setUnit('cm'));
    expect(suffixOf(BOX)).toBe('kg');
    expect(suffixOf(PALLET)).toBe('kg');
    expect(weightField(PALLET)).toHaveValue('18.1');
    act(() => stores.inputs.getState().setUnit('mm'));
    expect(suffixOf(MAX)).toBe('kg');
  });

  it('asks for the box weight when only a maximum is set', async () => {
    const { user } = await render();
    await user.type(weightField(MAX), '1500');
    await flush();
    expect(weightField(BOX)).toHaveAttribute('aria-invalid', 'true');
    expect(weightField(BOX)).toHaveAccessibleDescription(BOX_NEEDED);
    expect(weightField(MAX)).toHaveAttribute('aria-invalid', 'false');
  });

  it('needs the maximum above the pallet weight', async () => {
    const { stores } = await render();
    await setWeights(stores, { productBox: '2', maxPallet: '40' });
    expect(weightField(MAX)).toHaveAccessibleDescription(MAX_TOO_LOW);
    await setWeights(stores, { pallet: '30' });
    expect(weightField(MAX)).toHaveAttribute('aria-invalid', 'false');
  });

  it('needs positive weights, and a carton and pallet of zero or more', async () => {
    const { stores } = await render();
    await setWeights(stores, { productBox: '0', maxPallet: '0', emptyCarton: '-1', pallet: '' });
    expect(weightField(BOX)).toHaveAccessibleDescription('Must be greater than 0');
    expect(weightField(MAX)).toHaveAccessibleDescription('Must be greater than 0');
    expect(weightField(CARTON)).toHaveAccessibleDescription('Enter a number');
    expect(weightField(PALLET)).toHaveAccessibleDescription('Required');
    await setWeights(stores, { productBox: '2', maxPallet: '', emptyCarton: '0', pallet: '0' });
    for (const label of [BOX, MAX, CARTON, PALLET])
      expect(weightField(label)).toHaveAttribute('aria-invalid', 'false');
  });

  it('points Basic view to Full view when a hidden weight is invalid', async () => {
    const { stores } = await render('basic');
    await setWeights(stores, { pallet: 'abc' });
    expect(
      screen.getByText('A setting in Full view needs fixing before results can update.', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });
});

describe('weight results', () => {
  it('shows nothing about weight while the box weight is blank', async () => {
    const { stores } = await render();
    expect(within(table()).queryByRole('columnheader', { name: /Weight/ })).toBeNull();
    expect(
      within(screen.getByRole('tabpanel')).queryByRole('heading', { name: 'Weight' }),
    ).toBeNull();
    expect(screen.queryByText(/by weight/)).toBeNull();
    // A maximum alone changes nothing on screen but its own field message.
    await setWeights(stores, { emptyCarton: '1', pallet: '45' });
    expect(within(table()).queryByRole('columnheader', { name: /Weight/ })).toBeNull();
    expect(screen.queryByText(/weight/i, { selector: 'dt, th, h3' })).toBeNull();
  });

  it('adds a Weight column and marks layouts limited by weight', async () => {
    const { stores } = await render();
    // Box 2 lb, carton 1 lb, maximum 290 lb: the winner is 108 boxes in 13 lb cartons, two
    // layers fewer than would fit, at 40 + 18 x 13 = 274 lb.
    await setWeights(stores, { productBox: '2', emptyCarton: '1', maxPallet: '290' });
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toContain('Weight (lb)');
    const first = within(table()).getAllByRole('row')[1]!;
    expect(first).toHaveTextContent('274.0');
    expect(first).toHaveTextContent('Limited by weight: 2 layers removed');
    // The note sits under the products, so the Weight column stays narrow.
    const cells = within(first).getAllByRole('cell');
    expect(cells[headers.indexOf('Weight (lb)')]).toHaveTextContent(/^274\.0$/);
    expect(cells[headers.indexOf('Products')]).toHaveTextContent(
      /^108\s*Limited by weight: 2 layers removed$/,
    );
    const result = stores.results.getState().result!;
    for (const r of result.layouts) expect(r.layout.totalProducts).toBeLessThanOrEqual(108);
  });

  it('shows weight per layer and centre of mass height in Analytics', async () => {
    const { stores } = await render();
    await setWeights(stores, { productBox: '2', emptyCarton: '1', maxPallet: '290' });
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { name: 'Weight' })).toBeInTheDocument();
    expect(analyticsValue('Total weight')).toBe('274.0 lb');
    expect(analyticsValue('Maximum pallet weight')).toBe('290.0 lb');
    expect(analyticsValue('Weight per carton')).toBe('13.0 lb');
    expect(analyticsValue('Layers removed for weight')).toBe('2');
    expect(analyticsValue('Room for more cartons by weight')).toBe('1');
    const layout = stores.results.getState().result!.layouts[0]!.layout;
    const perLayer = analyticsValue('Weight per layer');
    expect(perLayer).toContain(layout.layers.length === 1 ? 'Layer 1' : 'Layers 1');
    expect(perLayer).toMatch(/lb/);
    expect(analyticsValue('Centre of mass height above floor')).toMatch(/^\d+\.\d{2} in$/);
  });

  it('shows weight in kg in Analytics with cm', async () => {
    const { stores } = await render();
    await setWeights(stores, { productBox: '2', emptyCarton: '1', maxPallet: '290' });
    act(() => stores.inputs.getState().setUnit('cm'));
    // 274 lb = 124.28 kg.
    expect(analyticsValue('Total weight')).toBe('124.3 kg');
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toContain('Weight (kg)');
    expect(analyticsValue('Centre of mass height above floor')).toMatch(/^\d+\.\d cm$/);
  });

  it('gives the totals, the trim and the room left on the What to build card', async () => {
    const { stores } = await render('basic');
    await setWeights(stores, { productBox: '2', emptyCarton: '1', maxPallet: '290' });
    const c = card();
    const value = (label: string) =>
      within(c).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(value('Total weight')).toBe('274.0 lb');
    expect(value('Weight per carton')).toBe('13.0 lb');
    expect(c).toHaveTextContent('Limited by weight: 2 layers removed');
    expect(c).toHaveTextContent('Room for 1 more carton by weight');
  });

  it('says how many more cartons the maximum allows only when it trimmed the load', async () => {
    const { stores } = await render('basic');
    // Unlimited winner: 612 lb; 680 lb would allow 6 more cartons of 11 lb, but the height is
    // the limit, so nothing is said about room.
    await setWeights(stores, { productBox: '2', emptyCarton: '1', maxPallet: '680' });
    expect(card()).not.toHaveTextContent('Room for');
    expect(card()).not.toHaveTextContent('Limited by weight');
    // 290 lb removes two layers (274 lb): room for 1 more 13 lb carton.
    await setWeights(stores, { maxPallet: '290' });
    expect(card()).toHaveTextContent('Limited by weight: 2 layers removed');
    expect(card()).toHaveTextContent('Room for 1 more carton by weight');
    await setWeights(stores, { maxPallet: '612' });
    expect(card()).not.toHaveTextContent('Room for');
    await setWeights(stores, { maxPallet: '' });
    expect(card()).not.toHaveTextContent('Room for');
    expect(within(card()).getByText('Total weight', { selector: 'dt' })).toBeInTheDocument();
  });

  it('explains when one layer is already over the maximum', async () => {
    const { stores } = await render('basic');
    await setWeights(stores, { productBox: '50', maxPallet: '100' });
    expect(screen.getByText(OVER_WEIGHT)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What to build' })).toBeNull();
  });
});
