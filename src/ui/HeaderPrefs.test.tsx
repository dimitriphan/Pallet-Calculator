import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { optimize } from '../engine/optimize';
import { renderApp } from './testUtils';

afterEach(() => document.documentElement.classList.remove('harbor'));

describe('header preference controls', () => {
  it('shows the view switch and theme select after the existing controls', async () => {
    await renderApp();
    const actions = screen.getByTestId('header-actions');
    const group = screen.getByRole('radiogroup', { name: 'View' });
    const select = screen.getByRole('combobox', { name: 'Theme' });
    expect(actions.contains(group)).toBe(true);
    expect(actions.contains(select)).toBe(true);
    expect(screen.getByRole('radio', { name: 'Full' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Basic' })).toHaveAttribute('aria-checked', 'false');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Harbor',
      'Light',
    ]);
    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(
      exportBtn.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(group.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('choosing Harbor sets the harbor class on the document, and Light removes it', async () => {
    const { user, stores } = await renderApp();
    const select = screen.getByRole('combobox', { name: 'Theme' });
    await user.selectOptions(select, 'Harbor');
    expect(document.documentElement).toHaveClass('harbor');
    expect(stores.prefs.getState().theme).toBe('harbor');
    await user.selectOptions(select, 'Light');
    expect(document.documentElement).not.toHaveClass('harbor');
    expect(stores.prefs.getState().theme).toBe('light');
  });

  it('choosing Basic stores the preference without running the optimizer again', async () => {
    const run = vi.fn((i: Parameters<typeof optimize>[0]) => Promise.resolve(optimize(i)));
    const { user, stores } = await renderApp(run);
    const calls = run.mock.calls.length;
    await user.click(screen.getByRole('radio', { name: 'Basic' }));
    expect(stores.prefs.getState().viewMode).toBe('basic');
    expect(screen.getByRole('radio', { name: 'Basic' })).toHaveAttribute('aria-checked', 'true');
    expect(run.mock.calls.length).toBe(calls);
  });

  it('moves between view modes with the arrow keys', async () => {
    const { user, stores } = await renderApp();
    screen.getByRole('radio', { name: 'Full' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(stores.prefs.getState().viewMode).toBe('basic');
    expect(screen.getByRole('radio', { name: 'Basic' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(stores.prefs.getState().viewMode).toBe('full');
  });
});
