/** "Your layouts" (spec 6.4) and a selected manual layout wherever a layout is shown. */
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOT_SAVED } from '../persistence/localStorageRepository';
import { useNoticesStore } from '../store/noticesStore';
import { EDIT_OUT_OF_DATE } from './DetailsPanel';
import { ENTRY_REASONS } from './editor/useEditorEntry';
import { EXPORT_WHILE_EDITING } from './ExportMenu';
import { differenceText } from './manualDifference';
import { isBelowMinimum } from './minStability';
import { flush, renderApp, summaryTile } from './testUtils';

type App = Awaited<ReturnType<typeof renderApp>>;

afterEach(() => {
  vi.unstubAllGlobals();
  useNoticesStore.setState({ notices: [] });
});

const list = () => screen.getByRole('region', { name: 'Your layouts' });
const rows = () => within(list()).getAllByTestId('your-layout');
const row = (name: string) =>
  within(list())
    .getByRole('button', { name: `Show your layout ${name}` })
    .closest('li') as HTMLElement;
const action = (name: string, what: string) =>
  within(row(name)).getByRole('button', { name: `${what} ${name}` });
const manual = (app: App) => app.stores.manualLayouts.getState();
const editor = (app: App) => app.stores.manualEditor.getState();
const best = (app: App) => app.stores.results.getState().result!.layouts[0]!.layout;

/** Saves a hand-made copy of the best layout; `change` edits it first. */
function saveCopy(app: App, name: string, change?: () => void): string {
  let id = '';
  act(() => {
    editor(app).openFromCalculated(0);
    change?.();
    const saved = editor(app).save({ name });
    if (!saved.ok) throw new Error(`not saved: ${saved.reason}`);
    id = saved.id;
  });
  return id;
}

async function setField(app: App, path: string, value: string) {
  act(() => app.stores.inputs.getState().setField(path, value));
  await flush();
}

describe('"Your layouts"', () => {
  it('shows nothing but the way in while there are no manual layouts', async () => {
    await renderApp();
    expect(screen.queryByRole('region', { name: 'Your layouts' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Design my own carton' })).toBeEnabled();
  });

  it('lists each layout above the calculated results with its badge, figures and rating', async () => {
    const app = await renderApp();
    saveCopy(app, 'Dock 4');
    const table = screen.getByRole('table', { name: 'Layout comparison' });
    expect(list().compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const r = row('Dock 4');
    // The copy's own figures (a result that mixes layer patterns is copied from its bottom layer).
    const b = manual(app).entries[0]!.build.layout;
    expect(within(r).getByText('Manual')).toBeInTheDocument();
    expect(r).toHaveTextContent(
      `${b.totalProducts} boxes · ${b.totalCartons} cartons · ${b.layers.length} layers`,
    );
    expect(within(r).getByText(/^Stability: (Good|Fair|Poor)$/)).toBeInTheDocument();
    expect(within(r).getByTestId('difference')).toHaveTextContent(
      differenceText(b.totalProducts, best(app).totalProducts),
    );
    // No weight until a box weight is given.
    expect(r).not.toHaveTextContent(' lb');
    await setField(app, 'weights.productBox', '2');
    expect(row('Dock 4')).toHaveTextContent(/ · [\d,.]+ lb/);
  });

  it('says how the boxes compare with the best calculated layout, and nothing while that is behind', async () => {
    const app = await renderApp();
    saveCopy(app, 'Fewer', () => editor(app).remove(0));
    const fewer = best(app).totalProducts - manual(app).entries[0]!.build.layout.totalProducts;
    expect(fewer).toBeGreaterThan(0);
    expect(within(row('Fewer')).getByTestId('difference')).toHaveTextContent(
      `${fewer} fewer than the best calculated layout`,
    );
    expect(differenceText(248, 260)).toBe('12 fewer than the best calculated layout');
    expect(differenceText(260, 260)).toBe('Same as the best calculated layout');
    expect(differenceText(265, 260)).toBe('5 more than the best calculated layout');

    // An invalid input: the calculated result is out of date, so nothing is compared with it.
    act(() => app.stores.inputs.getState().setField('pallet.length', 'abc'));
    await flush();
    expect(within(row('Fewer')).queryByTestId('difference')).toBeNull();
  });

  it('shows the flags in the error style and "Below your minimum" under the setting', async () => {
    const app = await renderApp();
    saveCopy(app, 'Flagged', () => {
      editor(app).move(0, { x: -3, y: editor(app).session!.cartons[0]!.y }, { snap: false });
    });
    const flags = within(row('Flagged')).getByRole('list', { name: 'Flags of Flagged' });
    const flag = within(flags).getByText(
      /1 carton overhangs the allowed footprint by up to 3\.00 in/,
    );
    expect(flag).toHaveAttribute('data-tone', 'error');
    expect(flag.className).toContain('text-red-800');
    expect(flag.className).toContain('dark:text-harbor-coral-text');

    const entry = () => manual(app).entries[0]!;
    expect(within(row('Flagged')).queryByText('Below your minimum')).toBeNull();
    const rating = entry().build.layout.stability!.rating;
    // A minimum the layout does not reach: it is kept (the user made it) and marked.
    act(() =>
      app.stores.inputs
        .getState()
        .replaceInputs({ ...app.stores.manualLayouts.getState().inputs!, minStability: 'good' }),
    );
    await flush();
    const marked = isBelowMinimum(entry().build.layout.stability!.rating, 'good');
    expect(rating === 'good' ? !marked : marked).toBe(true);
    expect(within(row('Flagged')).queryAllByText('Below your minimum')).toHaveLength(
      marked ? 1 : 0,
    );
    expect(isBelowMinimum('poor', 'fair')).toBe(true);
    expect(isBelowMinimum('fair', 'fair')).toBe(false);
    expect(isBelowMinimum('fair', 'good')).toBe(true);
    expect(isBelowMinimum('poor', 'auto')).toBe(false);
    expect(isBelowMinimum(undefined, 'good')).toBe(false);
  });

  it('selects on click and from the keyboard, and the summary follows', async () => {
    const app = await renderApp();
    const id = saveCopy(app, 'Short', () => editor(app).remove(0));
    act(() => app.stores.results.getState().select(0));
    const full = summaryTile('Total boxes per pallet');
    const show = within(list()).getByRole('button', { name: 'Show your layout Short' });
    expect(show).toHaveAttribute('aria-pressed', 'false');

    show.focus();
    await app.user.keyboard('{Enter}');
    expect(app.stores.results.getState().selectedManualId).toBe(id);
    expect(show).toHaveAttribute('aria-pressed', 'true');
    expect(row('Short')).toHaveAttribute('data-selected', 'true');
    expect(summaryTile('Total boxes per pallet')).toBe(
      String(manual(app).entries[0]!.build.layout.totalProducts),
    );
    expect(summaryTile('Total boxes per pallet')).not.toBe(full);
    // No calculated row is selected meanwhile.
    const table = screen.getByRole('table', { name: 'Layout comparison' });
    expect(within(table).queryByRole('row', { selected: true })).toBeNull();
  });

  it('renames in place: Enter keeps the name, Escape the old one, focus back on Rename', async () => {
    const app = await renderApp();
    const id = saveCopy(app, 'First');
    await app.user.click(action('First', 'Rename'));
    const field = screen.getByRole('textbox', { name: 'New name for First' });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('First');
    await app.user.clear(field);
    await app.user.type(field, 'Top shelf{Enter}');
    expect(manual(app).specs[0]).toMatchObject({ id, name: 'Top shelf' });
    expect(action('Top shelf', 'Rename')).toHaveFocus();

    await app.user.click(action('Top shelf', 'Rename'));
    await app.user.type(screen.getByRole('textbox', { name: 'New name for Top shelf' }), 'xx');
    await app.user.keyboard('{Escape}');
    expect(manual(app).specs[0]!.name).toBe('Top shelf');
    expect(action('Top shelf', 'Rename')).toHaveFocus();

    // A blank name is not taken.
    await app.user.click(action('Top shelf', 'Rename'));
    await app.user.clear(screen.getByRole('textbox', { name: 'New name for Top shelf' }));
    await app.user.keyboard('{Enter}');
    expect(manual(app).specs[0]!.name).toBe('Top shelf');
  });

  it('duplicates, focusing the copy, and deletes only after a confirmation', async () => {
    const app = await renderApp();
    saveCopy(app, 'One');
    await app.user.click(action('One', 'Duplicate'));
    expect(manual(app).specs.map((s) => s.name)).toEqual(['One', 'One (copy)']);
    expect(
      within(list()).getByRole('button', { name: 'Show your layout One (copy)' }),
    ).toHaveFocus();

    await app.user.click(action('One (copy)', 'Delete'));
    const dialog = screen.getByRole('dialog', { name: 'Delete this layout?' });
    expect(dialog).toHaveTextContent('“One (copy)” will be removed from your layouts.');
    await app.user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(manual(app).specs).toHaveLength(2);

    await app.user.click(action('One (copy)', 'Delete'));
    await app.user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete layout' }),
    );
    expect(manual(app).specs.map((s) => s.name)).toEqual(['One']);
    // The focus goes to the layout that is left; with none left, to where editing starts.
    expect(within(list()).getByRole('button', { name: 'Show your layout One' })).toHaveFocus();
    await app.user.click(action('One', 'Delete'));
    await app.user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete layout' }),
    );
    expect(screen.queryByRole('region', { name: 'Your layouts' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Design my own carton' })).toHaveFocus();
  });

  it('Edit opens the editor on the layout and Save as new is offered', async () => {
    const app = await renderApp();
    const id = saveCopy(app, 'Mine');
    await app.user.click(action('Mine', 'Edit'));
    expect(editor(app).session!.origin).toEqual({ kind: 'saved', id });
    // While editing, every way in is off and says why.
    expect(action('Mine', 'Edit')).toBeDisabled();
    expect(action('Mine', 'Edit')).toHaveAccessibleDescription(ENTRY_REASONS.editing);
    act(() => editor(app).cancel());
    // Closing the editor returns the focus to the control that opened it.
    expect(action('Mine', 'Edit')).toHaveFocus();
  });

  it('an out-of-date layout is greyed, says what it was made for, and offers Discard and Rebuild', async () => {
    const app = await renderApp();
    const id = saveCopy(app, 'Old');
    await setField(app, 'product.height', '5');
    const r = row('Old');
    expect(r).toHaveAttribute('data-status', 'outOfDate');
    expect(within(r).getByText('Out of date')).toBeInTheDocument();
    expect(within(r).getByTestId('made-for')).toHaveTextContent(
      'Made for a product of 12.00 × 8.00 × 4.00 in. The inputs have changed since.',
    );
    expect(within(r).getByText('Old', { selector: 'span' }).className).toContain('text-gray-600');
    // Not compared, not rated against the minimum, and not editable as it stands.
    expect(within(r).queryByTestId('difference')).toBeNull();
    expect(within(r).queryByRole('button', { name: 'Edit Old' })).toBeNull();
    expect(within(r).queryByRole('button', { name: 'Rename Old' })).toBeNull();

    await app.user.click(action('Old', 'Rebuild'));
    expect(editor(app).session).toMatchObject({
      origin: { kind: 'saved', id },
      name: 'Old',
      step: 'carton',
    });
    act(() => editor(app).cancel());

    await app.user.click(action('Old', 'Discard'));
    await app.user.click(
      within(screen.getByRole('dialog', { name: 'Discard this layout?' })).getByRole('button', {
        name: 'Discard layout',
      }),
    );
    expect(manual(app).specs).toEqual([]);
  });

  it('a change that cannot be stored is said and nothing changes', async () => {
    const app = await renderApp();
    saveCopy(app, 'Kept');
    const notices: string[] = [];
    // The stores of a rendered app use a fake storage: make the store itself refuse.
    const state = manual(app);
    const real = { duplicate: state.duplicate, remove: state.remove };
    app.stores.manualLayouts.setState({
      duplicate: () => {
        notices.push(NOT_SAVED);
        return null;
      },
      remove: () => {
        notices.push(NOT_SAVED);
        return false;
      },
    });
    await app.user.click(action('Kept', 'Duplicate'));
    await app.user.click(action('Kept', 'Delete'));
    await app.user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete layout' }),
    );
    expect(notices).toHaveLength(2);
    expect(rows()).toHaveLength(1);
    expect(within(list()).getByRole('button', { name: 'Show your layout Kept' })).toHaveFocus();
    app.stores.manualLayouts.setState(real);
  });

  it('Basic view lists them to select and look at, with nothing to change them', async () => {
    const app = await renderApp(undefined, { viewMode: 'basic' });
    const id = saveCopy(app, 'Dock 4', () => editor(app).remove(0));
    act(() => app.stores.results.getState().select(0));
    expect(
      within(list()).queryByRole('button', { name: /^(Edit|Rename|Duplicate|Delete)/ }),
    ).toBeNull();
    await app.user.click(within(list()).getByRole('button', { name: 'Show your layout Dock 4' }));
    expect(app.stores.results.getState().selectedManualId).toBe(id);

    const card = screen.getByRole('region', { name: 'What to build' });
    const note = within(card).getByTestId('your-layout-note');
    expect(note).toHaveTextContent('Your layout: Dock 4');
    expect(note).toHaveTextContent(`Calculated layout 1 fits ${best(app).totalProducts} boxes.`);
    expect(card).not.toHaveTextContent(/Showing layout \d/);
    expect(card).not.toHaveTextContent('Layout 0');
    // The build sheet can still be printed from here.
    await app.user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: 'Build sheet (PDF)' })).toBeEnabled();
    await app.user.keyboard('{Escape}');

    await app.user.click(within(note).getByRole('button', { name: 'Use calculated layout 1' }));
    expect(app.stores.results.getState()).toMatchObject({
      selectedManualId: null,
      selectedIndex: 0,
    });
    expect(within(card).queryByTestId('your-layout-note')).toBeNull();
    expect(within(card).getByRole('heading', { name: 'What to build' })).toHaveFocus();
  });
});

describe('a selected manual layout', () => {
  it('has an Explanation of what it is, never a score or a rank', async () => {
    const app = await renderApp();
    saveCopy(app, 'Dock 4', () => {
      editor(app).remove(0);
      editor(app).setUpperLayers('alternate');
    });
    await app.user.click(screen.getByRole('tab', { name: 'Explanation' }));
    const panel = screen.getByRole('tabpanel');
    const text = panel.textContent ?? '';
    expect(within(panel).getByTestId('manual-explanation')).toBeInTheDocument();
    expect(text).toContain('Dock 4');
    expect(text).toContain('By hand, in the editor');
    expect(text).toContain('Alternate layers turned');
    expect(text).toMatch(/\d+ fewer than the best calculated layout/);
    expect(text).toContain('not ranked against the calculated layouts and has no score');
    expect(text).not.toMatch(/Score of layout|Final score|Layout 0|layout 0/);
    expect(within(panel).queryByRole('table')).toBeNull();

    // A calculated layout still explains its score.
    act(() => app.stores.results.getState().select(0));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Score of layout 1');
  });

  it('lists its flags and its Below-minimum mark in the Explanation', async () => {
    const app = await renderApp();
    saveCopy(app, 'Wide', () => {
      editor(app).move(0, { x: -3, y: editor(app).session!.cartons[0]!.y }, { snap: false });
    });
    await app.user.click(screen.getByRole('tab', { name: 'Explanation' }));
    const flags = within(screen.getByRole('tabpanel')).getByRole('list', { name: 'Layout flags' });
    expect(flags).toHaveTextContent('1 carton overhangs the allowed footprint by up to 3.00 in');
  });

  it('out of date: no flags anywhere, the note and what it was made for instead (F16)', async () => {
    const app = await renderApp();
    const id = saveCopy(app, 'Wide', () => {
      editor(app).move(0, { x: -3, y: editor(app).session!.cartons[0]!.y }, { snap: false });
    });
    await app.user.click(screen.getByRole('tab', { name: 'Explanation' }));
    expect(
      within(screen.getByRole('tabpanel')).getByRole('list', { name: 'Layout flags' }),
    ).toBeInTheDocument();
    await setField(app, 'product.height', '5');
    const entry = manual(app).entries.find((e) => e.spec.id === id)!;
    expect(entry.build.status).toBe('outOfDate');
    expect(entry.ranked.manual.flags).toEqual([]);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).queryByRole('list', { name: 'Layout flags' })).toBeNull();
    expect(panel).not.toHaveTextContent('overhangs the allowed footprint');
    expect(panel).toHaveTextContent('Out of date');
    expect(panel).toHaveTextContent('It was made for a product of 12.00 × 8.00 × 4.00 in');
    expect(within(row('Wide')).queryByRole('list')).toBeNull();
    expect(within(row('Wide')).getByTestId('made-for')).toHaveTextContent(
      'Made for a product of 12.00 × 8.00 × 4.00 in',
    );
  });

  it('says "no effect" beside Alternate layers turned when no layer is turned (F10)', async () => {
    const app = await renderApp();
    // The best layout's bottom layer is two rows of five: the same after a half turn.
    saveCopy(app, 'Symmetric', () => editor(app).setUpperLayers('alternate'));
    expect(manual(app).entries[0]!.ranked.manual.upperLayersNoEffect).toBe(true);
    await app.user.click(screen.getByRole('tab', { name: 'Explanation' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Alternate layers turned (no effect: the layer is the same after a half turn)',
    );
    await app.user.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Layers turned half a turn (180°)None');
    // In the editor, beside the choice.
    await app.user.click(action('Symmetric', 'Edit'));
    const upper = screen.getByRole('radiogroup', { name: 'Upper layers' });
    expect(upper).toHaveAccessibleDescription(
      'Alternate layers turned: no effect: the layer is the same after a half turn.',
    );
    act(() => {
      editor(app).remove(0);
    });
    expect(screen.queryByTestId('upper-layers-note')).toBeNull();
    expect(upper).not.toHaveAccessibleDescription();
  });

  it('shows the carton volume outside the allowed footprint in Analytics (F11)', async () => {
    const app = await renderApp();
    saveCopy(app, 'Inside');
    await app.user.click(screen.getByRole('tab', { name: 'Analytics' }));
    const label = 'Carton volume outside the allowed footprint';
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(label);
    saveCopy(app, 'Wide', () => {
      editor(app).move(0, { x: -3, y: editor(app).session!.cartons[0]!.y }, { snap: false });
    });
    const panel = screen.getByRole('tabpanel');
    const dt = within(panel).getByText(label, { selector: 'dt' });
    // 3 in of a 21 in deep, 13 in high carton, in each of 5 layers.
    expect(dt.nextElementSibling).toHaveTextContent('4095.00 in³');
    const used = within(panel).getByText('Volume used', { selector: 'dt' }).nextElementSibling;
    expect(used).toHaveTextContent(/^\d+\.\d\d in³$/);
  });

  it('is marked Out of date wherever its numbers show when it is (review I3)', async () => {
    const app = await renderApp();
    saveCopy(app, 'Old');
    const made = String(manual(app).entries[0]!.build.layout.totalProducts);
    await setField(app, 'product.height', '5');
    // The calculation is current, yet the manual layout shown is not.
    expect(app.stores.results.getState().stale).toBe(false);
    const summary = screen.getByRole('region', { name: 'Production summary' });
    expect(summaryTile('Total boxes per pallet')).toBe(made);
    expect(within(summary).getByText('Out of date')).toBeInTheDocument();
    expect(summary.querySelector('dl')).toHaveClass('opacity-50');
    expect(
      within(screen.getByRole('complementary', { name: 'Details' })).getAllByText('Out of date')
        .length,
    ).toBeGreaterThan(0);
    expect(within(screen.getByTestId('scene-slot')).getByText('Out of date')).toBeInTheDocument();

    // It cannot be edited as it stands, and the button says why.
    const edit = screen.getByRole('button', { name: 'Edit layout by hand' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute('title', EDIT_OUT_OF_DATE);
    expect(edit).toHaveAccessibleDescription(EDIT_OUT_OF_DATE);

    // A calculated layout selected again: nothing is out of date.
    act(() => app.stores.results.getState().select(0));
    expect(within(summary).queryByText('Out of date')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit layout by hand' })).toBeEnabled();
  });

  it('Basic view: the notes about the calculated result are not said of it', async () => {
    const app = await renderApp(undefined, { viewMode: 'basic' });
    saveCopy(app, 'Mine');
    act(() => app.stores.results.getState().select(0));
    // "Good only" where nothing calculated reaches Good: the calculated result is below it.
    act(() =>
      app.stores.inputs
        .getState()
        .replaceInputs({ ...app.stores.results.getState().inputs!, minStability: 'good' }),
    );
    await flush();
    const result = app.stores.results.getState().result!;
    const aside = screen.getByRole('complementary', { name: 'Details' });
    const status = () => within(aside).getAllByRole('status')[0]!;
    const note = /No layout reaches Good|Auto would give/;
    if (result.belowMinimum) expect(status()).toHaveTextContent(note);

    await app.user.click(within(list()).getByRole('button', { name: 'Show your layout Mine' }));
    expect(status()).not.toHaveTextContent(note);
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(card).not.toHaveTextContent('Minimum stability:');
    const rating = manual(app).entries[0]!.build.layout.stability!.rating;
    expect(within(card).queryAllByText('Below your minimum')).toHaveLength(
      rating === 'good' ? 0 : 1,
    );
  });
});

describe('while the editor is open', () => {
  it('the summary shows the layout being edited, marked Editing (review M3)', async () => {
    const app = await renderApp();
    const total = summaryTile('Total boxes per pallet');
    act(() => {
      editor(app).openFromCalculated(0);
      editor(app).remove(0);
    });
    const summary = screen.getByRole('region', { name: 'Production summary' });
    expect(within(summary).getByTestId('summary-editing')).toHaveTextContent('Editing');
    expect(summaryTile('Total boxes per pallet')).toBe(
      String(editor(app).session!.build.layout.totalProducts),
    );
    expect(summaryTile('Total boxes per pallet')).not.toBe(total);
    act(() => editor(app).cancel());
    expect(within(summary).queryByTestId('summary-editing')).toBeNull();
    expect(summaryTile('Total boxes per pallet')).toBe(total);
  });

  it('nothing is exported, and the menu says why', async () => {
    const app = await renderApp();
    act(() => void editor(app).openFromCalculated(0));
    await app.user.click(screen.getByRole('button', { name: 'Export' }));
    const menu = screen.getByRole('menu', { name: 'Export' });
    expect(menu).toHaveTextContent(EXPORT_WHILE_EDITING);
    for (const item of within(menu).getAllByRole('menuitem')) {
      expect(item).toBeDisabled();
      expect(item).toHaveAttribute('title', EXPORT_WHILE_EDITING);
    }
  });
});
