import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { MinStability } from '../domain/types';
import { autoMoreText, belowMinimumText, MIN_STABILITY_LABEL } from './minStability';
import { settingsSummary } from './settingsSummary';
import { optimize } from '../engine/optimize';
import { flush, renderApp, summaryTile } from './testUtils';

type App = Awaited<ReturnType<typeof renderApp>>;

/** The pinned pinwheel case: every layout is rated Fair, so nothing reaches Good. */
const ALL_FAIR: Record<string, string> = {
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

const BELOW = 'No layout reaches Good. Showing the most stable found.';
const BELOW_LIMITED =
  'No layout reaching Good was found before the search was stopped. Showing the most stable found.';
const MORE = 'Auto would give 15 more boxes.';

function control() {
  return screen.getByRole('radiogroup', { name: 'Minimum stability' });
}

function option(name: string) {
  return within(control()).getByRole('radio', { name });
}

function tableRows() {
  return within(screen.getByRole('table', { name: 'Layout comparison' }))
    .getAllByRole('row')
    .slice(1);
}

async function setMinimum(stores: App['stores'], m: MinStability) {
  act(() => stores.inputs.getState().setMinStability(m));
  await flush();
}

async function setFields(stores: App['stores'], values: Record<string, string>) {
  act(() => {
    for (const [path, value] of Object.entries(values))
      stores.inputs.getState().setField(path, value);
  });
  await flush();
}

describe('minimum stability wording', () => {
  it('names the three choices', () => {
    expect(MIN_STABILITY_LABEL).toEqual({
      auto: 'Auto',
      fair: 'Fair or better',
      good: 'Good only',
    });
  });

  it('says how many more boxes Auto would give, or nothing', () => {
    const result = { layouts: [{ layout: { totalProducts: 245 } }], autoBestProducts: 260 };
    expect(autoMoreText(result)).toBe(MORE);
    expect(autoMoreText({ ...result, autoBestProducts: 246 })).toBe('Auto would give 1 more box.');
    expect(autoMoreText({ ...result, autoBestProducts: 1245 })).toBe(
      'Auto would give 1000 more boxes.',
    );
    expect(autoMoreText({ layouts: result.layouts })).toBeNull();
    expect(autoMoreText({ layouts: [], autoBestProducts: 260 })).toBeNull();
  });

  it('says nothing reaches the minimum', () => {
    expect(belowMinimumText('good')).toBe(BELOW);
    expect(belowMinimumText('fair')).toBe('No layout reaches Fair. Showing the most stable found.');
  });

  it('says only that none was found when the search was limited', () => {
    expect(belowMinimumText('good', true)).toBe(BELOW_LIMITED);
    expect(belowMinimumText('fair', true)).toBe(
      'No layout reaching Fair was found before the search was stopped. Showing the most stable found.',
    );
  });

  it('is part of the settings sentence only when it is not Auto', () => {
    expect(settingsSummary(DEFAULT_INPUTS)).not.toContain('stability');
    expect(settingsSummary({ ...DEFAULT_INPUTS, minStability: 'fair' })).toBe(
      'Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable, minimum stability Fair or better.',
    );
    expect(settingsSummary({ ...DEFAULT_INPUTS, minStability: 'good' })).toContain(
      ', minimum stability Good only.',
    );
  });
});

describe('MinStabilityControl', () => {
  it('offers Auto, Fair or better and Good only in Full view, Auto chosen', async () => {
    await renderApp();
    expect(
      within(control())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Auto', 'Fair or better', 'Good only']);
    expect(option('Auto')).toBeChecked();
    expect(option('Good only')).not.toBeChecked();
    expect(screen.queryByText(/Auto would give/)).not.toBeInTheDocument();
    expect(screen.queryByText('Below your minimum')).not.toBeInTheDocument();
  });

  it('Good only changes the list and says what Auto would give', async () => {
    const { user, stores } = await renderApp();
    expect(summaryTile('Total boxes per pallet')).toBe('260');
    await user.click(option('Good only'));
    await flush();
    expect(option('Good only')).toBeChecked();
    expect(stores.inputs.getState().draft.minStability).toBe('good');
    expect(summaryTile('Total boxes per pallet')).toBe('245');
    const rows = tableRows();
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(within(row).getByText('Good')).toBeInTheDocument();
    expect(screen.getByText(MORE)).toBeInTheDocument();
    expect(screen.queryByText('Below your minimum')).not.toBeInTheDocument();
    expect(screen.queryByText(BELOW)).not.toBeInTheDocument();

    await user.click(option('Auto'));
    await flush();
    expect(summaryTile('Total boxes per pallet')).toBe('260');
    expect(screen.queryByText(MORE)).not.toBeInTheDocument();
  });

  it('moves between the choices with the arrow keys', async () => {
    const { user, stores } = await renderApp();
    option('Auto').focus();
    await user.keyboard('{ArrowRight}');
    expect(option('Fair or better')).toBeChecked();
    expect(option('Fair or better')).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(option('Auto')).toBeChecked();
    await user.keyboard('{ArrowLeft}');
    expect(stores.inputs.getState().draft.minStability).toBe('good');
    // Only the chosen one is in the tab order.
    expect(option('Good only')).toHaveAttribute('tabindex', '0');
    expect(option('Auto')).toHaveAttribute('tabindex', '-1');
  });

  it('nothing reaches the minimum: says so and marks every row', async () => {
    const { stores } = await renderApp();
    await setFields(stores, ALL_FAIR);
    await setMinimum(stores, 'good');
    expect(screen.getByText(BELOW)).toBeInTheDocument();
    const rows = tableRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getByText('Fair')).toBeInTheDocument();
      expect(within(row).getByText('Below your minimum')).toBeInTheDocument();
    }
    expect(summaryTile('Total boxes per pallet')).toBe('30');
    // Not an empty result.
    expect(screen.queryByText(/^No layout fits/)).not.toBeInTheDocument();

    await setMinimum(stores, 'fair');
    expect(screen.queryByText(BELOW)).not.toBeInTheDocument();
    expect(screen.queryByText('Below your minimum')).not.toBeInTheDocument();
  });

  it('a limited search that found nothing at the minimum does not claim that nothing reaches it', async () => {
    // The same result, but from a search that was cut short.
    const { stores } = await renderApp((i) => Promise.resolve({ ...optimize(i), truncated: true }));
    await setFields(stores, ALL_FAIR);
    await setMinimum(stores, 'good');
    expect(stores.results.getState().result).toMatchObject({ belowMinimum: true, truncated: true });
    expect(screen.getByText(BELOW_LIMITED)).toBeInTheDocument();
    expect(screen.queryByText(BELOW)).not.toBeInTheDocument();
    expect(
      screen.getByText('Search was limited to keep it fast; results may not be the best possible.'),
    ).toBeInTheDocument();
    // The layouts are still shown, each marked.
    for (const row of tableRows())
      expect(within(row).getByText('Below your minimum')).toBeInTheDocument();
  });
});

describe('minimum stability in Basic view', () => {
  it('has no control, and says nothing while the minimum is Auto', async () => {
    await renderApp(undefined, { viewMode: 'basic' });
    expect(screen.queryByRole('radiogroup', { name: 'Minimum stability' })).toBeNull();
    expect(screen.queryByText(/minimum stability/i)).not.toBeInTheDocument();
  });

  it('says a minimum is in force and what Auto would give', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    await setMinimum(stores, 'good');
    expect(screen.getByText(/fully rotatable, minimum stability Good only\./)).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(
      within(card).getByText('Minimum stability: Good only.', { exact: false }),
    ).toBeInTheDocument();
    expect(within(card).getByText(MORE, { exact: false })).toBeInTheDocument();
    expect(summaryTile('Total boxes per pallet')).toBe('245');
  });

  it('says a minimum is in force even when it costs no boxes', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    await setMinimum(stores, 'fair');
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(within(card).getByText('Minimum stability: Fair or better.')).toBeInTheDocument();
    expect(within(card).queryByText(/Auto would give/)).not.toBeInTheDocument();
  });

  it('marks the layout below the minimum when nothing reaches it', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    await setFields(stores, ALL_FAIR);
    await setMinimum(stores, 'good');
    expect(screen.getByText(BELOW)).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(within(card).getByText('Below your minimum')).toBeInTheDocument();
    expect(within(card).getByText('Stability: Fair')).toBeInTheDocument();
  });
});

describe('minimum stability in presets', () => {
  it('is saved with a new preset and restored when the preset is chosen', async () => {
    const { user, stores } = await renderApp();
    await user.click(option('Fair or better'));
    await flush();
    await user.click(screen.getByRole('button', { name: 'Save as new' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as new preset' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Steady');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(stores.presets.getState().presets.find((p) => p.name === 'Steady')).toMatchObject({
      minStability: 'fair',
    });

    const preset = screen.getByRole('combobox', { name: 'Preset' });
    await user.selectOptions(preset, 'Standard GMA 48 × 40 × 72');
    await flush();
    expect(option('Auto')).toBeChecked();
    await user.selectOptions(preset, 'Steady');
    await flush();
    expect(option('Fair or better')).toBeChecked();
  });

  it('can be edited in the preset form and shows in the preset list', async () => {
    const { user, stores } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage presets' });
    expect(within(dialog).queryByText(/minimum stability/)).not.toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Edit' })[0]!);
    const form = screen.getByRole('dialog', { name: 'Edit preset' });
    const group = within(form).getByRole('radiogroup', { name: 'Minimum stability' });
    expect(within(group).getByRole('radio', { name: 'Auto' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Good only' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(stores.presets.getState().presets[0]!.minStability).toBe('good');
    expect(
      within(screen.getByRole('dialog', { name: 'Manage presets' })).getByText(
        /minimum stability Good only/,
      ),
    ).toBeInTheDocument();
    // The inputs panel's own control is untouched by the form.
    expect(stores.inputs.getState().draft.minStability).toBe('auto');
  });
});
