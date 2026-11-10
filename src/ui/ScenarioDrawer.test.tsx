import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { flush, renderApp } from './testUtils';

type Rendered = Awaited<ReturnType<typeof renderApp>>;

function tableRows() {
  return within(screen.getByRole('table', { name: 'Layout comparison' }))
    .getAllByRole('row')
    .map((r) => r.textContent);
}

async function openDrawer(user: Rendered['user']) {
  await user.click(screen.getByRole('button', { name: 'Scenarios' }));
  return screen.getByRole('dialog', { name: 'Scenarios' });
}

async function saveCurrent(user: Rendered['user'], drawer: HTMLElement, name: string) {
  await user.click(within(drawer).getByRole('button', { name: 'Save current' }));
  const field = within(drawer).getByRole('textbox', { name: 'Name' });
  await user.clear(field);
  await user.type(field, name);
  await user.click(within(drawer).getByRole('button', { name: 'Save' }));
}

function row(drawer: HTMLElement, name: string) {
  return within(drawer).getByText(name).closest('li') as HTMLElement;
}

describe('ScenarioDrawer', () => {
  it('proposes a dated default name and saves the current result', async () => {
    const { user, stores } = await renderApp();
    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: 'Save current' }));
    expect(
      (within(drawer).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value,
    ).toMatch(/^Scenario \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));

    const saved = stores.scenarios.getState().scenarios;
    expect(saved).toHaveLength(1);
    const total = saved[0]!.result.layouts[0]!.layout.totalProducts;
    const item = within(drawer).getAllByRole('listitem')[0]!;
    expect(item).toHaveTextContent(`${total} products`);
    expect(item).toHaveTextContent(new Date(saved[0]!.savedAt).toLocaleString());
  });

  it('disables Save current while there is no ready result', async () => {
    const { user } = await renderApp(() => new Promise(() => {}));
    const drawer = await openDrawer(user);
    expect(within(drawer).getByRole('button', { name: 'Save current' })).toBeDisabled();
  });

  it('loads inputs, layouts and selected layout without running the optimizer again', async () => {
    const run = vi.fn((i: Inputs) => Promise.resolve(optimize(i)));
    const { user, stores } = await renderApp(run);
    stores.results.getState().select(1);
    const before = tableRows();
    const result = stores.results.getState().result;

    let drawer = await openDrawer(user);
    await saveCurrent(user, drawer, 'Baseline');
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));

    const length = within(screen.getByRole('group', { name: 'Product box' })).getByRole('textbox', {
      name: 'Length',
    });
    await user.clear(length);
    await user.type(length, '10');
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    expect(stores.results.getState().selectedIndex).toBe(0);

    drawer = await openDrawer(user);
    await user.click(within(row(drawer, 'Baseline')).getByRole('button', { name: 'Load' }));
    await flush();

    expect(length).toHaveValue('12');
    expect(stores.results.getState().selectedIndex).toBe(1);
    expect(stores.results.getState().result).toEqual(result);
    expect(tableRows()).toEqual(before);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('renames and duplicates a scenario', async () => {
    const { user, stores } = await renderApp();
    const drawer = await openDrawer(user);
    await saveCurrent(user, drawer, 'First');

    await user.click(within(row(drawer, 'First')).getByRole('button', { name: 'Rename' }));
    const field = within(drawer).getByRole('textbox', { name: 'Name' });
    await user.clear(field);
    await user.type(field, 'Renamed');
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(within(drawer).getByText('Renamed')).toBeInTheDocument();
    expect(within(drawer).queryByText('First')).not.toBeInTheDocument();

    await user.click(within(row(drawer, 'Renamed')).getByRole('button', { name: 'Duplicate' }));
    expect(within(drawer).getByText('Renamed (copy)')).toBeInTheDocument();
    expect(stores.scenarios.getState().scenarios).toHaveLength(2);
  });

  it('asks before deleting a scenario', async () => {
    const { user, stores } = await renderApp();
    const drawer = await openDrawer(user);
    await saveCurrent(user, drawer, 'Doomed');

    await user.click(within(row(drawer, 'Doomed')).getByRole('button', { name: 'Delete' }));
    expect(within(drawer).getByText('Delete scenario “Doomed”?')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Cancel' }));
    expect(stores.scenarios.getState().scenarios).toHaveLength(1);

    await user.click(within(row(drawer, 'Doomed')).getByRole('button', { name: 'Delete' }));
    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    expect(stores.scenarios.getState().scenarios).toHaveLength(0);
    expect(within(drawer).queryByText('Doomed')).not.toBeInTheDocument();
  });

  it('closes with the Close button and returns focus to Scenarios', async () => {
    const { user } = await renderApp();
    const opener = screen.getByRole('button', { name: 'Scenarios' });
    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
