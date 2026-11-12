import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculatedCartons } from '../../store/manualEditorStore';
import { useNoticesStore } from '../../store/noticesStore';
import { dimsText, pairText, weightText } from '../format';
import { flush, renderApp } from '../testUtils';
import { KEPT_UPRIGHT_REASON } from './CartonStep';
import { CARTON_BLOCKED_NOTE, REPLACE_LAYER_QUESTION } from './EditorBar';
import { ENTRY_REASONS } from './useEditorEntry';

type App = Awaited<ReturnType<typeof renderApp>>;

afterEach(() => {
  vi.unstubAllGlobals();
  useNoticesStore.setState({ notices: [] });
});

const session = (app: App) => app.stores.manualEditor.getState().session;
const design = (app: App) => session(app)!.design;
const button = (name: string | RegExp) =>
  // The header has its own "Save as new", for presets.
  name === 'Save as new'
    ? within(bar()).getByRole('button', { name })
    : screen.getByRole('button', { name });
const bar = () => screen.getByRole('region', { name: 'Editing by hand' });
const stepTab = (name: string) => within(bar()).getByRole('tab', { name: new RegExp(name) });
const panel = () => screen.getByRole('tabpanel');
const more = (side: string) => button(`One more: boxes along the carton's ${side}`);
const fewer = (side: string) => button(`One fewer: boxes along the carton's ${side}`);
const count = (side: string) => screen.getByRole('textbox', { name: `Boxes along the ${side}` });
const figure = (label: string) =>
  within(panel()).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
const flag = (kind: string) => panel().querySelector(`[data-flag="${kind}"]`);

async function setFields(app: App, values: Record<string, string>) {
  act(() => {
    for (const [path, value] of Object.entries(values))
      app.stores.inputs.getState().setField(path, value);
  });
  await flush();
}

async function openOwn(app: App) {
  await app.user.click(button('Design my own carton'));
  expect(session(app)).not.toBeNull();
}

describe('ways into the editor', () => {
  it('"Design my own carton" opens the Carton step in place of the details', async () => {
    const app = await renderApp();
    expect(screen.queryByRole('region', { name: 'Editing by hand' })).toBeNull();
    await openOwn(app);

    expect(session(app)!.origin).toEqual({ kind: 'own' });
    expect(stepTab('Carton')).toHaveAttribute('aria-selected', 'true');
    expect(stepTab('Pallet layer')).toHaveAttribute('aria-selected', 'false');
    expect(panel()).toHaveAccessibleName(/Carton/);
    expect(within(panel()).getByRole('heading', { name: 'Carton' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Layout name' })).toHaveValue('Manual 1');
    // The keyboard user is taken into the editor.
    expect(within(bar()).getByRole('heading', { name: 'Editing by hand' })).toHaveFocus();
    // Not a saved layout: nothing to save a copy of.
    expect(within(bar()).queryByRole('button', { name: 'Save as new' })).toBeNull();
    // The details of the selected layout give way; the inputs and results stay.
    expect(screen.queryByRole('tab', { name: 'Analytics' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Inputs' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Layout comparison' })).toBeInTheDocument();
  });

  it('while editing, the ways in are off and say why', async () => {
    const app = await renderApp();
    await openOwn(app);
    const reason = screen.getByText(ENTRY_REASONS.editing);
    for (const b of [button('Design my own carton'), button('Edit layout 1 by hand')]) {
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute('aria-describedby', reason.id);
    }
  });

  it('"Edit layout by hand" on a row opens that layout at the Pallet layer step', async () => {
    const app = await renderApp();
    const layouts = app.stores.results.getState().result!.layouts;
    await app.user.click(button('Edit layout 2 by hand'));
    expect(session(app)!.origin).toEqual({ kind: 'calculated', layoutId: layouts[1]!.layout.id });
    expect(stepTab('Pallet layer')).toHaveAttribute('aria-selected', 'true');
    // The row was not selected by the click on its button.
    expect(app.stores.results.getState().selectedIndex).toBe(0);
    expect(figure('Cartons in the layer')).toBe(String(session(app)!.layer.length));
    expect(figure('Total boxes')).toBe(String(session(app)!.build.layout.totalProducts));
    expect(within(panel()).getByText(/Stability|Good|Fair|Poor/, { selector: 'dt' })).toBeTruthy();
  });

  it('a row button answers Enter without selecting the row', async () => {
    const app = await renderApp();
    button('Edit layout 2 by hand').focus();
    await app.user.keyboard('{Enter}');
    expect(session(app)).not.toBeNull();
    expect(app.stores.results.getState().selectedIndex).toBe(0);
  });

  it('the selected layout has "Edit layout by hand" among its details', async () => {
    const app = await renderApp();
    const rows = within(screen.getByRole('table', { name: 'Layout comparison' })).getAllByRole(
      'row',
    );
    await app.user.click(rows[3] as HTMLElement);
    await app.user.click(button('Edit layout by hand'));
    const layouts = app.stores.results.getState().result!.layouts;
    expect(session(app)!.origin).toEqual({ kind: 'calculated', layoutId: layouts[2]!.layout.id });
  });

  it('is not offered in Basic view', async () => {
    await renderApp(undefined, { viewMode: 'basic' });
    expect(screen.queryByRole('button', { name: 'Design my own carton' })).toBeNull();
    expect(screen.queryByRole('button', { name: /by hand/ })).toBeNull();
  });

  it('is off below 768 px, with the reason', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const app = await renderApp();
    const reason = screen.getByText(ENTRY_REASONS.narrow);
    expect(reason).toHaveTextContent('wider screen');
    for (const b of [
      button('Design my own carton'),
      button('Edit layout 1 by hand'),
      button('Edit layout by hand'),
    ]) {
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute('aria-describedby', reason.id);
    }
    await app.user.click(button('Design my own carton'));
    expect(session(app)).toBeNull();
  });

  it('is off, with the reason, when there is no layout to start from', async () => {
    const app = await renderApp();
    // A box no carton can hold: the result is empty.
    await setFields(app, { 'product.length': '100' });
    expect(app.stores.results.getState().result?.layouts).toEqual([]);
    const design = button('Design my own carton');
    expect(design).toBeDisabled();
    expect(design).toHaveAccessibleDescription(ENTRY_REASONS.noResult);
  });
});

describe('the Carton step', () => {
  it('changes the counts with minus, plus and typing, never below 1', async () => {
    const app = await renderApp();
    await openOwn(app);
    const start = design(app).counts;
    expect(count('length')).toHaveValue(String(start.length));
    for (const b of [more('length'), fewer('length')]) {
      expect(b.className).toContain('min-h-[44px]');
      expect(b.className).toContain('min-w-[44px]');
    }

    await app.user.click(more('length'));
    expect(design(app).counts.length).toBe(start.length + 1);
    expect(count('length')).toHaveValue(String(start.length + 1));
    expect(figure('Boxes per carton')).toBe(String(session(app)!.figures.boxesPerCarton));
    expect(figure('Outer size')).toBe(dimsText(session(app)!.figures.outer, 'in'));
    await app.user.click(fewer('length'));
    expect(design(app).counts.length).toBe(start.length);

    // The best carton is one box wide: there is nothing to take away.
    expect(design(app).counts.width).toBe(1);
    expect(fewer('width')).toBeDisabled();

    await app.user.clear(count('width'));
    expect(design(app).counts.width).toBe(1);
    await app.user.type(count('width'), '2');
    expect(design(app).counts.width).toBe(2);
    expect(figure('Boxes per carton')).toBe(String(start.length * 2 * start.height));

    // Nothing that is not a count of 1 or more is taken; leaving the field puts the count back.
    await app.user.clear(count('width'));
    await app.user.type(count('width'), '0');
    expect(design(app).counts.width).toBe(2);
    await app.user.tab();
    expect(count('width')).toHaveValue('2');
  });

  it('offers one pictured button per facing, named by what is up and how it is turned', async () => {
    const app = await renderApp();
    await openOwn(app);
    const group = screen.getByRole('radiogroup', { name: 'Box facing' });
    const facings = within(group).getAllByRole('radio');
    expect(facings).toHaveLength(session(app)!.facings.length);
    expect(facings).toHaveLength(6);
    for (const f of facings) {
      expect(f.querySelector('svg')).not.toBeNull();
      expect(f).toHaveAccessibleName(
        /^Box (length|width|height) up, (not turned|turned a quarter turn):/,
      );
      expect(f.className).toContain('min-h-[44px]');
    }
    expect(new Set(facings.map((f) => f.getAttribute('aria-label'))).size).toBe(6);
    expect(within(group).getByRole('radio', { checked: true })).toHaveAccessibleName(
      /^Box length up, turned a quarter turn/,
    );

    const flat = within(group).getByRole('radio', { name: /^Box height up, not turned/ });
    await app.user.click(flat);
    expect(design(app).facing).toBe('LWH');
    expect(flat).toHaveAttribute('aria-checked', 'true');
    expect(figure('Outer size')).toBe(dimsText(session(app)!.figures.outer, 'in'));

    // Arrow keys move the choice, as in any radio group.
    await app.user.keyboard('{ArrowRight}');
    expect(design(app).facing).toBe(session(app)!.facings[1]);
    expect(within(group).getByRole('radio', { checked: true })).toHaveFocus();
  });

  it('merges the facings of a box with equal sides', async () => {
    const app = await renderApp();
    await setFields(app, { 'product.length': '6', 'product.width': '6', 'product.height': '6' });
    await openOwn(app);
    expect(
      within(screen.getByRole('radiogroup', { name: 'Box facing' })).getAllByRole('radio'),
    ).toHaveLength(1);
  });

  it('chooses which side of the carton is down, with the footprint and height each gives', async () => {
    const app = await renderApp();
    await openOwn(app);
    const group = screen.getByRole('radiogroup', { name: 'Carton on the pallet' });
    const { outer } = session(app)!.figures;
    const base = within(group).getByRole('radio', { name: /On its base/ });
    expect(base).toHaveAttribute('aria-checked', 'true');
    expect(base).toHaveTextContent(pairText(outer.length, outer.width, 'in'));
    const side = within(group).getByRole('radio', { name: /On its side/ });
    expect(side).toHaveTextContent(
      pairText(Math.max(outer.length, outer.height), Math.min(outer.length, outer.height), 'in'),
    );
    expect(side).toHaveTextContent('9.00 in high');

    await app.user.click(side);
    expect(design(app).sideDown).toBe('side');
    expect(side).toHaveAttribute('aria-checked', 'true');
    // The carton itself is the same carton.
    expect(session(app)!.figures.outer).toEqual(outer);
  });

  it('keeps the carton on its base, saying why, when Keep cartons upright is on', async () => {
    const app = await renderApp();
    act(() => app.stores.inputs.getState().setKeepCartonsUpright(true));
    await flush();
    await openOwn(app);
    const group = screen.getByRole('radiogroup', { name: 'Carton on the pallet' });
    expect(group).toHaveAccessibleDescription(KEPT_UPRIGHT_REASON);
    expect(within(group).getByRole('radio', { name: /On its base/ })).toBeEnabled();
    for (const name of [/On its side/, /On its end/])
      expect(within(group).getByRole('radio', { name })).toBeDisabled();
    await app.user.click(within(group).getByRole('radio', { name: /On its side/ }));
    expect(design(app).sideDown).toBe('base');
  });

  it('starts again from a calculated carton', async () => {
    const app = await renderApp();
    await openOwn(app);
    const offered = calculatedCartons(app.stores.results.getState().result).slice(0, 5);
    const list = screen.getByRole('list', { name: 'Use a calculated carton' });
    const items = within(list).getAllByRole('button');
    expect(items).toHaveLength(offered.length);
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]).toHaveAttribute('aria-pressed', 'true');
    expect(items[1]).toHaveAttribute('aria-pressed', 'false');
    expect(items[1]).toHaveTextContent(
      `${offered[1]!.carton.boxesPerCarton} ${offered[1]!.carton.boxesPerCarton === 1 ? 'box' : 'boxes'}`,
    );

    await app.user.click(more('height'));
    expect(items[0]).toHaveAttribute('aria-pressed', 'false');
    await app.user.click(items[1] as HTMLElement);
    expect(design(app)).toEqual(offered[1]!.design);
    expect(items[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the live figures in the unit, the weight only when weights are given', async () => {
    const app = await renderApp();
    await openOwn(app);
    const f = () => session(app)!.figures;
    expect(figure('Boxes per carton')).toBe('5');
    expect(figure('Outer size')).toBe('21.00 × 9.00 × 13.00 in');
    expect(figure('Inner size')).toBe('20.50 × 8.50 × 12.50 in');
    expect(figure('Boxes fill')).toBe('78.14%');
    expect(within(panel()).queryByText('Carton weight')).toBeNull();
    // Said politely after each change.
    const spoken = within(panel()).getByRole('status');
    expect(spoken).toHaveTextContent('Boxes per carton: 5. Outer size: 21.00 × 9.00 × 13.00 in');

    await setFields(app, { 'weights.productBox': '2' });
    expect(figure('Carton weight')).toBe(weightText(f().weight!, 'in'));
    expect(f().weight).toBe(10);

    await app.user.selectOptions(screen.getByRole('combobox', { name: 'Units' }), 'cm');
    await flush();
    expect(figure('Outer size')).toBe(dimsText(f().outer, 'cm'));
    expect(figure('Outer size')).toMatch(/ cm$/);
    expect(figure('Carton weight')).toMatch(/ kg$/);
  });

  it('flags a carton over the maximum size at once, in the error style, and still saves', async () => {
    const app = await renderApp();
    await openOwn(app);
    expect(within(panel()).queryByRole('list', { name: 'Carton flags' })).toBeNull();
    // Six boxes of 4 in and the walls make 25 in against a maximum of 24 in.
    await app.user.click(more('length'));
    const over = flag('overMaximum');
    expect(over).toHaveTextContent(
      'Carton is over the maximum carton size by 1.00 in (longest side)',
    );
    expect(over).toHaveAttribute('data-tone', 'error');
    expect(over?.className).toContain('text-red-800');
    expect(over?.className).toContain('dark:text-harbor-coral-text');
    expect(within(panel()).getByRole('status')).toHaveTextContent('over the maximum carton size');
    expect(button('Save')).toBeEnabled();
    expect(stepTab('Pallet layer')).not.toHaveAttribute('aria-disabled');
  });

  it('notes a facing the rotation inputs would not allow', async () => {
    const app = await renderApp();
    await openOwn(app);
    expect(flag('orientationNotAllowed')).toBeNull();
    // The best carton stands the box on its end; "Keep upright" would not.
    act(() => app.stores.inputs.getState().setRotationMode('upright'));
    await flush();
    const note = flag('orientationNotAllowed');
    expect(note).toHaveTextContent(/rotation setting does not allow/);
    expect(note).toHaveAttribute('data-tone', 'note');
    expect(note?.className).not.toContain('red');
    expect(button('Save')).toBeEnabled();
  });

  it('blocks the Pallet layer step and Save for a carton too big for the footprint', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.clear(count('width'));
    await app.user.type(count('width'), '30');
    expect(session(app)!.cartonFlags.blocked).toBe('footprint');
    expect(flag('blocked')).toHaveTextContent(
      'Carton is too big for the allowed footprint, whichever way it is turned. Change the carton to go on to the pallet layer or to save.',
    );
    // Said once, not again in the list under it.
    expect(flag('cannotFit')).toBeNull();
    expect(flag('overMaximum')).not.toBeNull();

    const save = button('Save');
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(CARTON_BLOCKED_NOTE);
    const layer = stepTab('Pallet layer');
    expect(layer).toHaveAttribute('aria-disabled', 'true');
    expect(layer).toHaveAccessibleDescription(CARTON_BLOCKED_NOTE);
    await app.user.click(layer);
    expect(session(app)!.step).toBe('carton');
    expect(screen.queryByRole('dialog')).toBeNull();

    // Back inside the footprint, both come back.
    await app.user.clear(count('width'));
    await app.user.type(count('width'), '1');
    expect(button('Save')).toBeEnabled();
    expect(stepTab('Pallet layer')).not.toHaveAttribute('aria-disabled');
    expect(flag('blocked')).toBeNull();
  });

  it('blocks a carton taller than the stacking height, saying by how much', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.clear(count('height'));
    await app.user.type(count('height'), '9');
    const s = session(app)!;
    expect(s.cartonFlags.blocked).toBe('height');
    expect(flag('blocked')).toHaveTextContent(
      `Carton is taller than the stacking height by ${
        dimsText({ length: s.cartonFlags.overHeightBy!, width: 0, height: 0 }, 'in').split(
          ' × ',
        )[0]!
      } in`,
    );
    expect(button('Save')).toBeDisabled();
  });
});

describe('the editor shell', () => {
  it('goes to the Pallet layer step and back, by mouse and by keyboard', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(stepTab('Pallet layer'));
    expect(session(app)!.step).toBe('layer');
    expect(stepTab('Pallet layer')).toHaveAttribute('aria-selected', 'true');
    expect(panel()).toHaveAccessibleName(/Pallet layer/);
    expect(figure('Layers')).toBe(String(session(app)!.build.layout.layers.length));

    // Arrow keys move between the tabs; Enter goes to the step.
    stepTab('Pallet layer').focus();
    await app.user.keyboard('{ArrowLeft}');
    expect(stepTab('Carton')).toHaveFocus();
    expect(session(app)!.step).toBe('layer');
    await app.user.keyboard('{Enter}');
    expect(session(app)!.step).toBe('carton');
  });

  it('loads the best layer for a changed carton when the layer was not edited by hand', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(more('width'));
    expect(session(app)!.layerPending).toBe(true);
    await app.user.click(stepTab('Pallet layer'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session(app)!.step).toBe('layer');
    expect(session(app)!.layerPending).toBe(false);
  });

  it('undoes and redoes', async () => {
    const app = await renderApp();
    await openOwn(app);
    const start = design(app).counts.length;
    expect(button('Undo')).toBeDisabled();
    expect(button('Redo')).toBeDisabled();
    await app.user.click(more('length'));
    await app.user.click(button('Undo'));
    expect(design(app).counts.length).toBe(start);
    expect(count('length')).toHaveValue(String(start));
    await app.user.click(button('Redo'));
    expect(design(app).counts.length).toBe(start + 1);
  });

  it('cancels at once when nothing changed, and gives the focus back', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(button('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session(app)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Editing by hand' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Analytics' })).toBeInTheDocument();
    expect(button('Design my own carton')).toHaveFocus();
    expect(app.stores.manualLayouts.getState().specs).toEqual([]);
  });

  it('asks before discarding changes', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(more('length'));
    await app.user.click(button('Cancel'));
    const dialog = screen.getByRole('dialog', { name: 'Discard your changes?' });
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();

    await app.user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session(app)).not.toBeNull();
    // Focus goes back to the button that asked.
    expect(button('Cancel')).toHaveFocus();

    await app.user.click(button('Cancel'));
    await app.user.click(button('Discard changes'));
    expect(session(app)).toBeNull();
    expect(app.stores.manualLayouts.getState().specs).toEqual([]);
  });

  it('saves the layout under its name into the manual layouts', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(more('width'));
    const name = screen.getByRole('textbox', { name: 'Layout name' });
    await app.user.clear(name);
    await app.user.type(name, 'Top shelf');
    const working = session(app)!;
    await app.user.click(button('Save'));

    const { specs, entries } = app.stores.manualLayouts.getState();
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      name: 'Top shelf',
      design: working.design,
      cartons: working.layer,
    });
    expect(entries[0]!.build.layout.totalProducts).toBe(working.build.layout.totalProducts);
    expect(session(app)).toBeNull();
    // The saved layout is the one shown, and the user is told it was kept.
    expect(app.stores.results.getState().selectedManualId).toBe(specs[0]!.id);
    expect(screen.getByText('Saved “Top shelf” to your layouts.')).toBeInTheDocument();
  });

  it('asks before replacing a hand-edited layer, on the way to the Pallet layer step', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(button('Save'));
    // The saved layout is selected: its layer is the user's own from here on.
    await app.user.click(button('Edit layout by hand'));
    expect(session(app)!.origin.kind).toBe('saved');
    expect(session(app)!.step).toBe('layer');
    expect(button('Save as new')).toBeInTheDocument();

    await app.user.click(stepTab('Carton'));
    await app.user.click(more('width'));
    expect(session(app)!.layerPending).toBe(true);

    await app.user.click(stepTab('Pallet layer'));
    let dialog = screen.getByRole('dialog', { name: 'Replace the layer?' });
    expect(dialog).toHaveTextContent(REPLACE_LAYER_QUESTION);
    expect(session(app)!.step).toBe('carton');
    await app.user.click(within(dialog).getByRole('button', { name: 'Keep my layer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session(app)!.step).toBe('carton');
    expect(session(app)!.layerPending).toBe(true);

    await app.user.click(stepTab('Pallet layer'));
    dialog = screen.getByRole('dialog', { name: 'Replace the layer?' });
    await app.user.click(within(dialog).getByRole('button', { name: 'Replace layer' }));
    expect(session(app)!.step).toBe('layer');
    expect(session(app)!.layerPending).toBe(false);
    expect(session(app)!.layerEdited).toBe(false);
  });

  it('asks the same before saving, then saves over the layout or as a new one', async () => {
    const app = await renderApp();
    await openOwn(app);
    await app.user.click(button('Save'));
    const first = app.stores.manualLayouts.getState().specs[0]!;

    await app.user.click(button('Edit layout by hand'));
    await app.user.click(stepTab('Carton'));
    await app.user.click(more('width'));
    await app.user.click(button('Save'));
    expect(screen.getByRole('dialog')).toHaveTextContent(REPLACE_LAYER_QUESTION);
    expect(app.stores.manualLayouts.getState().specs[0]).toEqual(first);
    await app.user.click(button('Replace layer'));
    let specs = app.stores.manualLayouts.getState().specs;
    expect(specs).toHaveLength(1);
    expect(specs[0]!.id).toBe(first.id);
    expect(specs[0]!.design.counts.width).toBe(first.design.counts.width + 1);
    expect(session(app)).toBeNull();

    await app.user.click(button('Edit layout by hand'));
    await app.user.click(button('Save as new'));
    specs = app.stores.manualLayouts.getState().specs;
    expect(specs.map((s) => s.name)).toEqual(['Manual 1', 'Manual 2']);
  });

  it('follows the inputs while it is open', async () => {
    const app = await renderApp();
    await openOwn(app);
    expect(figure('Outer size')).toBe('21.00 × 9.00 × 13.00 in');
    await setFields(app, { wallThickness: '0.5' });
    expect(figure('Outer size')).toBe('21.50 × 9.50 × 13.50 in');
  });
});
