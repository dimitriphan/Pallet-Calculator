import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { FakeStorage } from '../persistence/testStorage';
import { createInputsStore } from '../store/inputsStore';
import { flush, makeStores, renderApp } from './testUtils';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

function units() {
  return screen.getByRole('combobox', { name: 'Units' });
}

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByRole('textbox', { name: label });
}

/** The unit suffix shown after a field. */
function suffixOf(input: HTMLElement): string | null | undefined {
  return input.nextElementSibling?.textContent;
}

async function choose(user: User, unit: string) {
  await user.selectOptions(units(), unit);
  await flush();
}

describe('UnitControl', () => {
  it('renders a Units select with in, cm and mm after the theme', async () => {
    await renderApp();
    const select = units();
    expect(screen.getByTestId('header-actions').contains(select)).toBe(true);
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'in',
      'cm',
      'mm',
    ]);
    expect(select).toHaveValue('in');
  });

  it('switches fields, the pallet notice, the table and analytics to centimetres', async () => {
    const { user, stores } = await renderApp();
    await choose(user, 'cm');
    expect(stores.inputs.getState().unit).toBe('cm');
    expect(stores.prefs.getState().unit).toBe('cm');

    const height = field('Pallet limitation', 'Height');
    expect(height).toHaveValue('182.9');
    expect(suffixOf(height)).toBe('cm');
    expect(suffixOf(field('Packing', 'Box leeway'))).toBe('cm');
    expect(suffixOf(screen.getByRole('textbox', { name: 'Desired box quantity' }))).toBe('boxes');
    expect(
      screen.getByText(
        'A 12.7-cm pallet is automatically included. Available stacking height has been reduced by 12.7 cm.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Usable stacking height: 170.2 cm')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Layout comparison' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toContain('Carton (cm)');
    expect(headers).toContain('Remaining volume (cm³)');
    const first = within(table).getAllByRole('row')[1]!;
    expect(within(first).getAllByRole('cell')[1]?.textContent).toBe('53.3 × 33.0 × 22.9');

    const panel = screen.getByRole('tabpanel');
    const value = (label: string) =>
      within(panel).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(value('Outer dimensions')).toBe('53.3 × 33.0 × 22.9 cm');
    expect(value('Usable stacking height')).toBe('170.2 cm');
    expect(value('Total load height (with pallet)')).toBe('182.9 cm');
    expect(value('Volume available')).toMatch(/^\d+\.\d cm³$/);
    expect(value('Remaining footprint (fullest layer)')).toMatch(/^\d+\.\d cm²$/);
  });

  it('shows the What to build card in millimetres in Basic view', async () => {
    const { user } = await renderApp(undefined, { viewMode: 'basic' });
    await choose(user, 'mm');
    const card = within(screen.getByRole('region', { name: 'What to build' }));
    expect(card.getByText('Outer size').nextElementSibling?.textContent).toBe('533 × 330 × 229 mm');
    expect(card.getByText('1194 × 1067 × 1829 mm (including pallet)')).toBeInTheDocument();
    expect(
      screen.getByText('Using 13 mm leeway, 6 mm carton walls, no overhang, fully rotatable.'),
    ).toBeInTheDocument();
  });

  it('does not recalculate or mark the result out of date', async () => {
    const { user, stores } = await renderApp();
    const request = vi.fn(stores.results.getState().request);
    stores.results.setState({ request });
    const before = stores.inputs.getState().parsed;
    for (const unit of ['cm', 'mm', 'in', 'mm']) await choose(user, unit);
    expect(request).not.toHaveBeenCalled();
    expect(stores.inputs.getState().parsed).toBe(before);
    expect(stores.results.getState().stale).toBe(false);
    expect(screen.queryByText('Out of date')).not.toBeInTheDocument();
  });

  it('restores the text typed when switching back', async () => {
    const { user } = await renderApp();
    const length = field('Product box', 'Length');
    await user.clear(length);
    await user.type(length, '12.0');
    await flush();
    await choose(user, 'mm');
    expect(field('Product box', 'Length')).toHaveValue('305');
    await choose(user, 'in');
    expect(field('Product box', 'Length')).toHaveValue('12.0');
  });

  it('shows validation limits in the display unit', async () => {
    const { user } = await renderApp();
    await choose(user, 'cm');
    const height = field('Pallet limitation', 'Height');
    await user.clear(height);
    await user.type(height, '10');
    await flush();
    const message = 'Pallet height must be greater than 12.7 cm';
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(height).toHaveAccessibleDescription(expect.stringContaining(message));
    await choose(user, 'mm');
    expect(screen.getByText('Pallet height must be greater than 127 mm')).toBeInTheDocument();
    await choose(user, 'in');
    expect(screen.getByText('Pallet height must be greater than 5 inches')).toBeInTheDocument();
  });

  it('keeps a preset unmodified across switches and edits presets in the unit', async () => {
    const { user, stores } = await renderApp();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Preset' }),
      'Standard GMA 48 × 40 × 72',
    );
    await flush();
    await choose(user, 'cm');
    expect(field('Pallet limitation', 'Length')).toHaveValue('121.9');
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    const dialog = screen.getByRole('dialog', { name: /presets/i });
    const row = within(dialog).getByText('Standard GMA 48 × 40 × 72').closest('li')!;
    expect(row).toHaveTextContent('Pallet 121.9 × 101.6 × 182.9 cm · leeway 1.3 cm');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const edit = screen.getByRole('dialog', { name: 'Edit preset' });
    const width = within(within(edit).getByRole('group', { name: 'Pallet limitation' })).getByRole(
      'textbox',
      { name: 'Width' },
    );
    expect(width).toHaveValue('101.6');
    expect(width.nextElementSibling?.textContent).toBe('cm');
    const before = stores.presets.getState().presets.find((p) => p.name.startsWith('Standard'))!;
    await user.click(within(edit).getByRole('button', { name: 'Save' }));
    const after = stores.presets.getState().presets.find((p) => p.id === before.id)!;
    // Saved without edits: the exact inch values are kept, not the rounded centimetres.
    expect(after.pallet).toEqual(before.pallet);
    expect(after.leeway).toBe(before.leeway);
  });

  it('on startup the unit the inputs were remembered in wins over the preference', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const storage = new FakeStorage();
    createInputsStore(storage).getState().setUnit('mm');
    const stores = { ...makeStores(), inputs: createInputsStore(storage) };
    expect(stores.prefs.getState().unit).toBe('in');
    render(<App stores={stores} />);
    await flush();
    expect(stores.prefs.getState().unit).toBe('mm');
    expect(units()).toHaveValue('mm');
    expect(field('Pallet limitation', 'Length')).toHaveValue('1270');
  });
});
