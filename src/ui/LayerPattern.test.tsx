import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { LayerPatternPref } from '../domain/types';
import {
  LAYER_PATTERN_LABEL,
  layerPatternText,
  PATTERN_FALLBACK,
  PATTERN_FALLBACK_LIMITED,
  patternFallbackText,
} from './layerPattern';
import { settingsSummary } from './settingsSummary';
import { optimize } from '../engine/optimize';
import { flush, renderApp, summaryTile } from './testUtils';

type App = Awaited<ReturnType<typeof renderApp>>;

/**
 * On the default pallet a 16 x 11 x 6 in box gives 92 boxes with straight cuts, and a pinwheel
 * layout of 92 that Auto throws away; the best layout of pinwheel layers alone holds 88.
 */
const TIE: Record<string, string> = {
  'product.length': '16',
  'product.width': '11',
  'product.height': '6',
};
/** No two sides of this carton fit side by side both ways on the pallet: no pinwheel. */
const NO_PINWHEEL: Record<string, string> = {
  'product.length': '30',
  'product.width': '25',
  'product.height': '20',
  'maxCarton.length': '31',
  'maxCarton.width': '26',
  'maxCarton.height': '21',
};
const MORE = 'Auto would give 4 more boxes.';

function control() {
  return screen.getByRole('radiogroup', { name: 'Layer pattern' });
}

function option(name: string) {
  return within(control()).getByRole('radio', { name });
}

function tableRows() {
  return within(screen.getByRole('table', { name: 'Layout comparison' }))
    .getAllByRole('row')
    .slice(1);
}

const isPinwheelRow = (row: HTMLElement) => within(row).queryByText('Pinwheel') !== null;

async function setPattern(stores: App['stores'], p: LayerPatternPref) {
  act(() => stores.inputs.getState().setLayerPattern(p));
  await flush();
}

async function setFields(stores: App['stores'], values: Record<string, string>) {
  act(() => {
    for (const [path, value] of Object.entries(values))
      stores.inputs.getState().setField(path, value);
  });
  await flush();
}

describe('layer pattern wording', () => {
  it('names the three choices', () => {
    expect(LAYER_PATTERN_LABEL).toEqual({
      auto: 'Auto',
      preferPinwheel: 'Prefer pinwheel',
      pinwheelOnly: 'Pinwheel only',
    });
    expect(layerPatternText('pinwheelOnly')).toBe('Layer pattern: Pinwheel only.');
  });

  it('says no pinwheel exists only for a fallback result, and only as far as it knows', () => {
    expect(PATTERN_FALLBACK).toBe(
      'No pinwheel layout exists for these sizes. Showing straight-cut layouts.',
    );
    const shown = { layouts: [{}], truncated: false };
    expect(patternFallbackText({ ...shown, patternFallback: true })).toBe(PATTERN_FALLBACK);
    expect(patternFallbackText(shown)).toBeNull();
    expect(
      patternFallbackText({ layouts: [], truncated: false, patternFallback: true }),
    ).toBeNull();
    // A limited search cannot say that none exists.
    expect(patternFallbackText({ ...shown, truncated: true, patternFallback: true })).toBe(
      PATTERN_FALLBACK_LIMITED,
    );
    expect(PATTERN_FALLBACK_LIMITED).toBe(
      'No pinwheel layout was found before the search was stopped. Showing straight-cut layouts.',
    );
  });

  it('is part of the settings sentence only when it is not Auto', () => {
    expect(settingsSummary(DEFAULT_INPUTS)).not.toContain('pattern');
    expect(settingsSummary({ ...DEFAULT_INPUTS, layerPattern: 'preferPinwheel' })).toBe(
      'Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable, layer pattern Prefer pinwheel.',
    );
    expect(
      settingsSummary({ ...DEFAULT_INPUTS, minStability: 'good', layerPattern: 'pinwheelOnly' }),
    ).toContain(', minimum stability Good only, layer pattern Pinwheel only.');
  });
});

describe('LayerPatternControl', () => {
  it('offers Auto, Prefer pinwheel and Pinwheel only after the minimum stability, Auto chosen', async () => {
    await renderApp();
    expect(
      within(control())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Auto', 'Prefer pinwheel', 'Pinwheel only']);
    expect(option('Auto')).toBeChecked();
    const groups = screen.getAllByRole('radiogroup').map((g) => g.getAttribute('aria-labelledby'));
    const names = groups.map((id) => document.getElementById(id!)?.textContent);
    expect(names.indexOf('Layer pattern')).toBe(names.indexOf('Minimum stability') + 1);
    expect(screen.queryByText(/Auto would give/)).not.toBeInTheDocument();
    expect(screen.queryByText(PATTERN_FALLBACK)).not.toBeInTheDocument();
  });

  it('Prefer pinwheel puts the tying pinwheel layout first, with the same boxes', async () => {
    const { user, stores } = await renderApp();
    await setFields(stores, TIE);
    expect(summaryTile('Total boxes per pallet')).toBe('92');
    expect(isPinwheelRow(tableRows()[0]!)).toBe(false);

    await user.click(option('Prefer pinwheel'));
    await flush();
    expect(option('Prefer pinwheel')).toBeChecked();
    expect(stores.inputs.getState().draft.layerPattern).toBe('preferPinwheel');
    expect(summaryTile('Total boxes per pallet')).toBe('92');
    const rows = tableRows();
    expect(isPinwheelRow(rows[0]!)).toBe(true);
    // The straight-cut alternative is still listed below.
    expect(isPinwheelRow(rows[1]!)).toBe(false);
    expect(within(rows[1]!).getByText('92')).toBeInTheDocument();
    expect(screen.queryByText(/Auto would give/)).not.toBeInTheDocument();
  });

  it('Pinwheel only lists pinwheel layouts alone and says what Auto would give', async () => {
    const { user, stores } = await renderApp();
    await setFields(stores, TIE);
    await user.click(option('Pinwheel only'));
    await flush();
    expect(summaryTile('Total boxes per pallet')).toBe('88');
    const rows = tableRows();
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(isPinwheelRow(row)).toBe(true);
    expect(screen.getByText(MORE)).toBeInTheDocument();
    expect(screen.queryByText(PATTERN_FALLBACK)).not.toBeInTheDocument();

    await user.click(option('Auto'));
    await flush();
    expect(summaryTile('Total boxes per pallet')).toBe('92');
    expect(screen.queryByText(MORE)).not.toBeInTheDocument();
  });

  it('Pinwheel only where no pinwheel exists: says so and shows the straight-cut layouts', async () => {
    const { stores } = await renderApp();
    await setFields(stores, NO_PINWHEEL);
    const auto = summaryTile('Total boxes per pallet');
    expect(screen.queryByText(PATTERN_FALLBACK)).not.toBeInTheDocument();
    await setPattern(stores, 'pinwheelOnly');
    expect(screen.getByText(PATTERN_FALLBACK)).toBeInTheDocument();
    expect(summaryTile('Total boxes per pallet')).toBe(auto);
    const rows = tableRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(isPinwheelRow(row)).toBe(false);
    expect(screen.queryByText(/Auto would give/)).not.toBeInTheDocument();
    // Not an empty result, and not said under Prefer pinwheel.
    expect(screen.queryByText(/^No layout fits/)).not.toBeInTheDocument();
    await setPattern(stores, 'preferPinwheel');
    expect(screen.queryByText(PATTERN_FALLBACK)).not.toBeInTheDocument();
  });

  it('moves between the choices with the arrow keys', async () => {
    const { user, stores } = await renderApp();
    option('Auto').focus();
    await user.keyboard('{ArrowRight}');
    expect(option('Prefer pinwheel')).toBeChecked();
    expect(option('Prefer pinwheel')).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(stores.inputs.getState().draft.layerPattern).toBe('pinwheelOnly');
    expect(option('Pinwheel only')).toHaveAttribute('tabindex', '0');
    expect(option('Auto')).toHaveAttribute('tabindex', '-1');
  });

  it('works together with the minimum stability', async () => {
    const { stores } = await renderApp();
    await setPattern(stores, 'pinwheelOnly');
    act(() => stores.inputs.getState().setMinStability('fair'));
    await flush();
    const rows = tableRows();
    for (const row of rows) {
      expect(isPinwheelRow(row)).toBe(true);
      expect(within(row).queryByText('Poor')).not.toBeInTheDocument();
    }
    expect(screen.getByText(/^Auto would give \d+ more boxes\.$/)).toBeInTheDocument();
  });

  it('a limited search that found no pinwheel does not claim that none exists', async () => {
    const { stores } = await renderApp((i) => Promise.resolve({ ...optimize(i), truncated: true }));
    await setFields(stores, NO_PINWHEEL);
    await setPattern(stores, 'pinwheelOnly');
    expect(screen.getByText(PATTERN_FALLBACK_LIMITED)).toBeInTheDocument();
    expect(screen.queryByText(PATTERN_FALLBACK)).not.toBeInTheDocument();
  });
});

describe('layer pattern in Basic view', () => {
  it('has no control, and says nothing while the setting is Auto', async () => {
    await renderApp(undefined, { viewMode: 'basic' });
    expect(screen.queryByRole('radiogroup', { name: 'Layer pattern' })).toBeNull();
    expect(screen.queryByText(/layer pattern/i)).not.toBeInTheDocument();
  });

  it('says the setting is in force and what Auto would give', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    await setFields(stores, TIE);
    await setPattern(stores, 'pinwheelOnly');
    expect(screen.getByText(/fully rotatable, layer pattern Pinwheel only\./)).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(
      within(card).getByText('Layer pattern: Pinwheel only.', { exact: false }),
    ).toBeInTheDocument();
    expect(within(card).getByText(MORE, { exact: false })).toBeInTheDocument();
    expect(summaryTile('Total boxes per pallet')).toBe('88');
  });

  it('says Prefer pinwheel is in force, which costs no boxes', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    await setPattern(stores, 'preferPinwheel');
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(within(card).getByText('Layer pattern: Prefer pinwheel.')).toBeInTheDocument();
    expect(within(card).queryByText(/Auto would give/)).not.toBeInTheDocument();
  });

  it('names both settings on one line when both are in force', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    act(() => stores.inputs.getState().setMinStability('fair'));
    await setPattern(stores, 'preferPinwheel');
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(
      within(card).getByText('Minimum stability: Fair or better. Layer pattern: Prefer pinwheel.'),
    ).toBeInTheDocument();
  });

  it('says when the straight-cut layouts are shown instead', async () => {
    const { stores } = await renderApp(undefined, { viewMode: 'basic' });
    await setFields(stores, NO_PINWHEEL);
    await setPattern(stores, 'pinwheelOnly');
    expect(screen.getByText(PATTERN_FALLBACK)).toBeInTheDocument();
  });
});

describe('layer pattern in presets', () => {
  it('is saved with a new preset and restored when the preset is chosen', async () => {
    const { user, stores } = await renderApp();
    await user.click(option('Prefer pinwheel'));
    await flush();
    await user.click(screen.getByRole('button', { name: 'Save as new' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as new preset' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Pinwheels');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(stores.presets.getState().presets.find((p) => p.name === 'Pinwheels')).toMatchObject({
      layerPattern: 'preferPinwheel',
    });

    const preset = screen.getByRole('combobox', { name: 'Preset' });
    await user.selectOptions(preset, 'Standard GMA 48 × 40 × 72');
    await flush();
    expect(option('Auto')).toBeChecked();
    await user.selectOptions(preset, 'Pinwheels');
    await flush();
    expect(option('Prefer pinwheel')).toBeChecked();
  });

  it('can be edited in the preset form and shows in the preset list', async () => {
    const { user, stores } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage presets' });
    expect(within(dialog).queryByText(/layer pattern/)).not.toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Edit' })[0]!);
    const form = screen.getByRole('dialog', { name: 'Edit preset' });
    const group = within(form).getByRole('radiogroup', { name: 'Layer pattern' });
    expect(within(group).getByRole('radio', { name: 'Auto' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Pinwheel only' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(stores.presets.getState().presets[0]!.layerPattern).toBe('pinwheelOnly');
    expect(
      within(screen.getByRole('dialog', { name: 'Manage presets' })).getByText(
        /layer pattern Pinwheel only/,
      ),
    ).toBeInTheDocument();
    expect(stores.inputs.getState().draft.layerPattern).toBe('auto');
  });
});
