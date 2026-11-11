import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './testUtils';

const dividersIn = (root: Element) => root.querySelectorAll('.root-divider');

const inputsPanel = () => screen.getByRole('complementary', { name: 'Inputs' });

describe('root dividers', () => {
  it('separates the three size groups in Basic', async () => {
    await renderApp(undefined, { viewMode: 'basic' });
    expect(dividersIn(inputsPanel())).toHaveLength(2);
  });

  it('separates the six input groups in Full', async () => {
    await renderApp();
    // Pallet | product | maximum carton | packing | weight | product rotation.
    expect(dividersIn(inputsPanel())).toHaveLength(5);
  });

  it('separates the five analytics groups (Stability added in Round 4)', async () => {
    await renderApp();
    expect(dividersIn(screen.getByRole('tabpanel'))).toHaveLength(4);
  });

  it('separates the three sections of the "What to build" card', async () => {
    await renderApp(undefined, { viewMode: 'basic' });
    expect(dividersIn(screen.getByRole('region', { name: 'What to build' }))).toHaveLength(2);
  });

  it('is decorative and never inside the table, header, or summary bar', async () => {
    await renderApp();
    for (const divider of document.querySelectorAll('.root-divider'))
      expect(divider).toHaveAttribute('aria-hidden', 'true');
    expect(dividersIn(screen.getByRole('table', { name: 'Layout comparison' }))).toHaveLength(0);
    expect(dividersIn(screen.getByRole('banner'))).toHaveLength(0);
    expect(dividersIn(screen.getByRole('region', { name: 'Production summary' }))).toHaveLength(0);
  });
});

/** Elements that can take focus: controls, table rows, the tab panel. */
const FOCUSABLE = 'button, input, select, textarea, summary, a[href], [tabindex]';

/** Focusable elements that would show no corner ticks on keyboard focus. */
function unmarked(root: ParentNode = document): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !(el.tabIndex < 0 && el.tagName !== 'BUTTON')) // only focused by script
    .filter((el) => !el.matches('.focus-ticks, .focus-ticks-inset, .focus-ticks-row'))
    .filter((el) => !el.closest('.focus-ticks-within'))
    .map((el) => el.outerHTML.slice(0, 120));
}

describe('focus ticks', () => {
  it('mark every focusable element in Full', async () => {
    await renderApp();
    expect(unmarked()).toEqual([]);
  });

  it('mark every focusable element in Basic', async () => {
    await renderApp(undefined, { viewMode: 'basic' });
    expect(unmarked()).toEqual([]);
  });

  it('mark the export menu items and the build sheet field', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0);
    expect(unmarked()).toEqual([]);
    await user.click(screen.getByRole('menuitem', { name: 'Build sheet (PDF)' }));
    expect(unmarked(screen.getByRole('dialog'))).toEqual([]);
  });

  it('mark the controls of the scenario and preset dialogs', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Scenarios' }));
    const drawer = screen.getByRole('dialog', { name: 'Scenarios' });
    await user.click(within(drawer).getByRole('button', { name: 'Save current' }));
    expect(unmarked(drawer)).toEqual([]);
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    const presets = screen.getByRole('dialog');
    await user.click(within(presets).getAllByRole('button', { name: 'Edit' })[0] as HTMLElement);
    expect(unmarked(presets)).toEqual([]);
  });

  it('replace every focus ring and focus border utility', async () => {
    await renderApp();
    const classes = Array.from(document.querySelectorAll('[class]'))
      .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
      .filter((c) =>
        /(^|:)ring(-|$)|focus(-visible|-within)?:border-|focus-visible:outline-\w/.test(c),
      );
    expect(classes).toEqual([]);
  });
});
