import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { flush, makeStores, renderApp, summaryTile } from './testUtils';

const STALE = 'Showing the last valid result. Fix the highlighted fields to update.';
const HIDDEN_INVALID = 'A setting in Full view needs fixing before results can update.';
const NO_CARTON_FITS =
  'No carton fits: the product box (plus leeway and walls) is larger than the maximum carton dimensions.';
const DEFAULT_LOAD = '47.00 × 42.00 × 72.00 in (including pallet)';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

const renderBasic = (run?: Parameters<typeof renderApp>[0]) =>
  renderApp(run, { viewMode: 'basic' });

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByRole('textbox', { name: label });
}

function card() {
  return screen.getByRole('region', { name: 'What to build' });
}

async function retype(user: User, input: HTMLElement, text: string) {
  await user.clear(input);
  await user.type(input, text);
  await flush();
}

const USING_DEFAULTS = 'Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable.';

/** Basic mode whose draft is edited before the first render, so no result ever exists. */
async function renderBasicWithDraft(edits: [string, string][]) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const stores = makeStores(undefined, { viewMode: 'basic' });
  for (const [path, value] of edits) stores.inputs.getState().setField(path, value);
  render(<App stores={stores} />);
  await flush();
  return stores;
}

function fullRadio() {
  return screen.getByRole('radio', { name: 'Full' });
}

function tableRows() {
  return within(screen.getByRole('table', { name: 'Layout comparison' }))
    .getAllByRole('row')
    .slice(1);
}

describe('Basic mode', () => {
  it('shows the sizes, boxes per carton, the settings sentence and what to build', async () => {
    await renderBasic();
    for (const legend of ['Pallet limitation', 'Product box', 'Maximum carton'])
      expect(screen.getByRole('group', { name: legend })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Desired boxes per carton' })).toBeInTheDocument();
    expect(
      screen.getByText('Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Usable stacking height: 67.00 in')).toBeInTheDocument();

    const c = within(card());
    expect(c.getByRole('heading', { name: 'What to build' })).toBeInTheDocument();
    const stack = c.getByRole('list');
    expect(stack.tagName).toBe('OL');
    expect(
      within(stack)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Layer 1: 10 cartons, product length side up',
      'Layers 2–7: 7 cartons each, product width side up',
    ]);
    expect(c.getByText('Outer size').nextElementSibling?.textContent).toBe(
      '21.00 × 13.00 × 9.00 in',
    );
    expect(c.getByText('Boxes per carton').nextElementSibling?.textContent).toBe('5');
    expect(c.getByText('Boxes inside').nextElementSibling?.textContent).toBe(
      "1 × 1 × 5 along the box's length × width × height",
    );
    expect(c.getByText(DEFAULT_LOAD)).toBeInTheDocument();
    expect(c.queryByText(/Showing layout/)).not.toBeInTheDocument();
  });

  it('explains how to build a pinwheel layer, and says nothing of it otherwise', async () => {
    const NOTE =
      'Pinwheel layer: build the four blocks around the centre gap as shown in the top view.';
    const { stores } = await renderBasic();
    expect(within(card()).queryByText(NOTE)).not.toBeInTheDocument();
    act(() => {
      for (const [path, value] of Object.entries({
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
      }))
        stores.inputs.getState().setField(path, value);
    });
    await flush();
    const c = within(card());
    expect(
      within(c.getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Layers 1–3: 10 cartons each, product height side up']);
    expect(c.getByText(NOTE)).toBeInTheDocument();
  });

  it('hides the analytical parts of the screen', async () => {
    const { user } = await renderBasic();
    expect(screen.queryByRole('table', { name: 'Layout comparison' })).not.toBeInTheDocument();
    expect(screen.queryByText('Layout comparison')).not.toBeInTheDocument();
    expect(screen.queryByText(/Score|Utilization/)).not.toBeInTheDocument();
    for (const tab of ['Analytics', 'Explanation', 'Selection'])
      expect(screen.queryByRole('tab', { name: tab })).not.toBeInTheDocument();
    for (const label of ['Box leeway', 'Desired box quantity'])
      expect(screen.queryByRole('textbox', { name: label })).not.toBeInTheDocument();
    expect(screen.queryByText('Product rotation')).not.toBeInTheDocument();
    for (const name of ['Scenarios', 'Manage', 'Save as new', 'Save to preset'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Preset' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export' }));
    const items = within(screen.getByRole('menu', { name: 'Export' })).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Build sheet (PDF)', 'PNG']);
    expect(screen.queryByText('JSON')).not.toBeInTheDocument();
    expect(screen.queryByText('CSV')).not.toBeInTheDocument();
  });

  it('keeps the production summary bar', async () => {
    await renderBasic();
    expect(summaryTile('Total boxes per pallet')).toBe('260');
  });

  it('switches to Full and back without recalculating', async () => {
    const run = vi.fn((i: Inputs) => Promise.resolve(optimize(i)));
    const { user, stores } = await renderBasic(run);
    const calls = run.mock.calls.length;
    const before = card().textContent;

    await user.click(screen.getByRole('button', { name: 'Change in Full view' }));
    expect(stores.prefs.getState().viewMode).toBe('full');
    expect(fullRadio()).toHaveFocus();
    expect(screen.getByRole('table', { name: 'Layout comparison' })).toBeInTheDocument();
    await flush();
    expect(run.mock.calls.length).toBe(calls);

    await user.click(screen.getByRole('radio', { name: 'Basic' }));
    await flush();
    expect(card().textContent).toBe(before);
    expect(run.mock.calls.length).toBe(calls);
  });

  it('notes a layout chosen in Full view and offers layout 1', async () => {
    const { user, stores } = await renderApp();
    await user.click(tableRows()[1] as HTMLElement);
    await user.click(screen.getByRole('radio', { name: 'Basic' }));

    const note = 'Showing layout 2, chosen in Full view. Layout 1 fits 260 boxes.';
    expect(within(card()).getByText(note)).toBeInTheDocument();
    await user.click(within(card()).getByRole('button', { name: 'Use layout 1' }));
    expect(stores.results.getState().selectedIndex).toBe(0);
    expect(within(card()).queryByText(note)).not.toBeInTheDocument();
    expect(within(card()).getByRole('heading', { name: 'What to build' })).toHaveFocus();
    expect(within(card()).getByText(DEFAULT_LOAD)).toBeInTheDocument();
    expect(
      within(card()).getByText('Layer 1: 10 cartons, product length side up'),
    ).toBeInTheDocument();
  });

  it('points to Full view when a hidden setting is invalid', async () => {
    const { user, stores } = await renderApp();
    await retype(user, screen.getByRole('textbox', { name: 'Box leeway' }), 'x');
    await user.click(screen.getByRole('radio', { name: 'Basic' }));

    expect(screen.getByText(HIDDEN_INVALID)).toBeInTheDocument();
    expect(screen.queryByText(/^Using /)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Full view' }));
    expect(stores.prefs.getState().viewMode).toBe('full');
    expect(fullRadio()).toHaveFocus();
    expect(screen.getByRole('table', { name: 'Layout comparison' })).toBeInTheDocument();
  });

  it('flags an invalid size and keeps the last card, marked out of date', async () => {
    const { user } = await renderBasic();
    const before = within(card()).getByRole('list').textContent;
    await retype(user, field('Pallet limitation', 'Length'), 'abc');

    expect(screen.getByText('Enter a number')).toBeInTheDocument();
    expect(screen.getByText(STALE)).toBeInTheDocument();
    expect(within(card()).getByRole('list').textContent).toBe(before);
    expect(within(card()).getByText(DEFAULT_LOAD)).toBeInTheDocument();
    // The sentence still describes the last valid settings.
    expect(
      screen.getByText('Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(HIDDEN_INVALID)).not.toBeInTheDocument();
  });

  it('explains when no carton fits and shows no carton rows', async () => {
    const { user } = await renderBasic();
    await retype(user, field('Product box', 'Length'), '30');
    expect(screen.getByText(NO_CARTON_FITS)).toBeInTheDocument();
    // The message says it all: no carton rows, no stack, and no empty card.
    expect(screen.queryByText('Outer size')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Enter the three sizes to see what to build.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What to build' })).not.toBeInTheDocument();
  });

  it('explains an unreachable boxes-per-carton count', async () => {
    const { user } = await renderBasic();
    await retype(user, screen.getByRole('textbox', { name: 'Desired boxes per carton' }), '7');
    expect(
      screen.getByText(
        'No carton holding exactly 7 boxes fits within the maximum carton dimensions. Counts that do fit: 6 and 8.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Outer size')).not.toBeInTheDocument();
  });

  it('hides the card and marks the summary out of date when a calculation fails', async () => {
    let fail = false;
    const run = (i: Inputs) =>
      fail ? Promise.reject(new Error('Calculation failed.')) : Promise.resolve(optimize(i));
    const { user } = await renderBasic(run);
    expect(card()).toBeInTheDocument();

    fail = true;
    await retype(user, field('Pallet limitation', 'Length'), '46');
    expect(screen.getByText('Calculation failed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What to build' })).not.toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Production summary' });
    expect(within(summary).getByText('Out of date')).toBeInTheDocument();
    expect(summary.querySelector('dl')).toHaveClass('opacity-50');
    // The error explains itself; the "fix the highlighted fields" notice would mislead.
    expect(screen.queryByText(STALE)).not.toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.queryByText('Calculation failed.')).not.toBeInTheDocument();
    expect(card()).toBeInTheDocument();
    expect(within(summary).queryByText('Out of date')).not.toBeInTheDocument();
  });

  it('asks for the sizes when there has never been a result', async () => {
    await renderBasicWithDraft([['pallet.length', 'abc']]);
    expect(
      within(card()).getByText('Enter the three sizes to see what to build.'),
    ).toBeInTheDocument();
  });

  it('shows no card while the first calculation runs', async () => {
    await renderBasic(() => new Promise(() => {}));
    expect(screen.getByText('Calculating…')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What to build' })).not.toBeInTheDocument();
  });

  it('describes the last valid settings when a visible and a hidden field are both invalid', async () => {
    const { user } = await renderApp();
    await retype(user, screen.getByRole('textbox', { name: 'Box leeway' }), 'x');
    await retype(user, field('Pallet limitation', 'Length'), 'abc');
    await user.click(screen.getByRole('radio', { name: 'Basic' }));

    expect(field('Pallet limitation', 'Length')).toHaveAccessibleDescription(
      expect.stringContaining('Enter a number'),
    );
    expect(screen.getByText(USING_DEFAULTS)).toBeInTheDocument();
    expect(screen.queryByText(HIDDEN_INVALID)).not.toBeInTheDocument();
  });

  it('says nothing about settings when both are invalid and there was never a result', async () => {
    await renderBasicWithDraft([
      ['leeway', 'x'],
      ['pallet.length', 'abc'],
    ]);
    expect(screen.queryByText(/^Using /)).not.toBeInTheDocument();
    expect(screen.queryByText(HIDDEN_INVALID)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Full view/ })).not.toBeInTheDocument();
  });

  it('points to Full view when no custom orientation is ticked', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const group = screen.getByRole('group', { name: 'Product rotation' });
    for (const box of within(group).getAllByRole('checkbox', {
      name: /^(LWH|LHW|WLH|WHL|HLW|HWL)$/,
    }))
      if ((box as HTMLInputElement).checked) await user.click(box);
    await flush();
    await user.click(screen.getByRole('radio', { name: 'Basic' }));
    expect(screen.getByText(HIDDEN_INVALID)).toBeInTheDocument();
  });

  it('keeps the same 3D slot when switching views', async () => {
    const { user } = await renderBasic();
    const slot = screen.getByTestId('scene-slot');
    const inner = slot.firstElementChild;
    expect(inner).not.toBeNull();
    await user.click(fullRadio());
    expect(screen.getByTestId('scene-slot')).toBe(slot);
    expect(slot.firstElementChild).toBe(inner);
    await user.click(screen.getByRole('radio', { name: 'Basic' }));
    expect(screen.getByTestId('scene-slot')).toBe(slot);
    expect(slot.firstElementChild).toBe(inner);
  });

  it('keeps an empty status live region above the card until there is news', async () => {
    const { user } = await renderBasic();
    const aside = screen.getByRole('complementary', { name: 'Details' });
    const region = within(aside).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    await retype(user, field('Pallet limitation', 'Length'), 'abc');
    expect(within(aside).getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(STALE);
  });
});

describe('Full mode status messages', () => {
  it('keeps an empty status live region under the comparison heading until there is news', async () => {
    const { user } = await renderApp();
    const section = screen
      .getByRole('heading', { name: 'Layout comparison' })
      .closest('section') as HTMLElement;
    const region = within(section).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass('empty:!mt-0');
    await retype(user, field('Pallet limitation', 'Height'), '4');
    expect(within(section).getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(STALE);
  });
});
