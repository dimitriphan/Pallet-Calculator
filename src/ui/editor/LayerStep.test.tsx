import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ManualCarton } from '../../engine/manual/layer';
import { useNoticesStore } from '../../store/noticesStore';
import { lengthText } from '../format';
import { flush, renderApp } from '../testUtils';
import {
  handleLayerKey,
  LAYER_MESSAGES,
  NEEDS_SELECTION,
  NUDGE_STEP,
  NUDGE_STEP_LARGE,
  refusalText,
  useLayerMessage,
  type LayerActions,
} from './layerActions';
import { RESET_QUESTION } from './LayerTools';
import { NOT_A_NUMBER, SELECT_TO_POSITION } from './SelectedCarton';

type App = Awaited<ReturnType<typeof renderApp>>;

afterEach(() => {
  useNoticesStore.setState({ notices: [] });
  useLayerMessage.getState().clear();
});

const session = (app: App) => app.stores.manualEditor.getState().session!;
const cartons = (app: App) => session(app).cartons;
const bar = () => screen.getByRole('region', { name: 'Editing by hand' });
const tools = () => within(bar()).getByRole('group', { name: 'Layer tools' });
const tool = (name: string) => within(tools()).getByRole('button', { name });
const panel = () => screen.getByRole('tabpanel');
const message = () => screen.getByTestId('layer-message');
const list = () => within(panel()).getByRole('list', { name: 'Cartons in the layer' });
const item = (k: number) => list().querySelector<HTMLButtonElement>(`[data-carton="${k}"]`)!;
const field = (name: string) => within(panel()).getByRole('textbox', { name });
const figure = (label: string) =>
  within(panel()).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

/** Opens the editor on calculated layout `n` (1-based), at the Pallet layer step. */
async function openLayer(n = 2): Promise<App> {
  const app = await renderApp();
  await app.user.click(screen.getByRole('button', { name: `Edit layout ${n} by hand` }));
  expect(session(app).step).toBe('layer');
  return app;
}

/** Leaves only carton 0 in the layer, selected: room to move and turn it. */
async function aloneOnThePallet(app: App) {
  while (cartons(app).length > 1) {
    await app.user.click(item(cartons(app).length - 1));
    await app.user.click(tool('Remove'));
  }
  await app.user.click(item(0));
  expect(session(app).selected).toBe(0);
}

describe('the layer tools', () => {
  it('are in the bar, each at least 44 px high by its class', async () => {
    await openLayer();
    for (const name of ['Add carton', 'Turn 90°', 'Remove', 'Reset'])
      expect(tool(name).className).toContain('min-h-[44px]');
    expect(within(bar()).getByRole('checkbox', { name: 'Snapping' })).toBeChecked();
    const upper = within(bar()).getByRole('radiogroup', { name: 'Upper layers' });
    expect(
      within(upper)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['All the same', 'Alternate layers turned']);
  });

  it('keeps Turn and Remove off, with the reason, until a carton is selected', async () => {
    const app = await openLayer();
    const reason = within(bar()).getByText(NEEDS_SELECTION);
    for (const name of ['Turn 90°', 'Remove']) {
      expect(tool(name)).toBeDisabled();
      expect(tool(name)).toHaveAttribute('aria-describedby', reason.id);
    }
    await app.user.click(item(0));
    expect(session(app).selected).toBe(0);
    expect(tool('Turn 90°')).toBeEnabled();
    expect(tool('Remove')).toBeEnabled();
    expect(within(bar()).queryByText(NEEDS_SELECTION)).toBeNull();
  });

  it('says so when there is no room for another carton, and adds one when there is', async () => {
    const app = await openLayer();
    const full = cartons(app).length;
    await app.user.click(tool('Add carton'));
    expect(cartons(app)).toHaveLength(full);
    expect(message()).toHaveTextContent(LAYER_MESSAGES.noFreeSpot);
    expect(message()).toHaveAttribute('role', 'status');

    await app.user.click(item(0));
    await app.user.click(tool('Remove'));
    expect(cartons(app)).toHaveLength(full - 1);
    expect(session(app).selected).toBeNull();
    // The message goes when the layer changes.
    expect(message()).toBeEmptyDOMElement();
    expect(figure('Cartons in the layer')).toBe(String(full - 1));

    await app.user.click(tool('Add carton'));
    expect(cartons(app)).toHaveLength(full);
    // The new carton is the selected one.
    expect(session(app).selected).toBe(full - 1);
    expect(item(full - 1)).toHaveAttribute('aria-pressed', 'true');
    expect(message()).toBeEmptyDOMElement();
  });

  it('refuses a turn that would overlap, and turns a carton that has room', async () => {
    const app = await openLayer();
    // A carton in the middle of a row: turned, it is over a neighbour wherever it is put.
    await app.user.click(item(2));
    const before = cartons(app);
    await app.user.click(tool('Turn 90°'));
    expect(cartons(app)).toBe(before);
    expect(message()).toHaveTextContent(LAYER_MESSAGES.turnRefused);

    await aloneOnThePallet(app);
    await app.user.click(tool('Turn 90°'));
    expect(cartons(app)[0]!.rotated).toBe(!before[0]!.rotated);
    expect(message()).toBeEmptyDOMElement();
    expect(item(0)).toHaveAttribute('data-turned', String(!before[0]!.rotated));
  });

  it('asks before resetting a changed layer, and is off for an unchanged one', async () => {
    const app = await openLayer();
    const start = cartons(app);
    expect(tool('Reset')).toBeDisabled();
    expect(tool('Reset')).toHaveAccessibleDescription('The layer is as it started.');

    await app.user.click(item(0));
    await app.user.click(tool('Remove'));
    expect(tool('Reset')).toBeEnabled();
    await app.user.click(tool('Reset'));
    const dialog = screen.getByRole('dialog', { name: 'Reset the layer?' });
    expect(dialog).toHaveTextContent(RESET_QUESTION);
    expect(within(dialog).getByRole('button', { name: 'Keep my layer' })).toHaveFocus();
    await app.user.click(within(dialog).getByRole('button', { name: 'Keep my layer' }));
    expect(cartons(app)).toHaveLength(start.length - 1);

    await app.user.click(tool('Reset'));
    await app.user.click(screen.getByRole('button', { name: 'Reset layer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cartons(app)).toEqual(start);
    expect(tool('Reset')).toBeDisabled();
    // Reset is one step of undo.
    await app.user.click(within(bar()).getByRole('button', { name: 'Undo' }));
    expect(cartons(app)).toHaveLength(start.length - 1);
  });

  it('switches snapping and the upper layers, and the figures follow', async () => {
    const app = await openLayer();
    await app.user.click(within(bar()).getByRole('checkbox', { name: 'Snapping' }));
    expect(session(app).snapping).toBe(false);
    await app.user.click(within(bar()).getByRole('checkbox', { name: 'Snapping' }));
    expect(session(app).snapping).toBe(true);

    // Off centre, so that a turned layer is a different layer.
    await aloneOnThePallet(app);
    const radio = (name: string) => within(bar()).getByRole('radio', { name });
    const was = session(app).upperLayers;
    const other = was === 'same' ? 'Alternate layers turned' : 'All the same';
    await app.user.click(radio(other));
    expect(session(app).upperLayers).not.toBe(was);
    expect(radio(other)).toHaveAttribute('aria-checked', 'true');
    const turned = () => session(app).build.layout.layers.some((l) => l.turned);
    expect(turned()).toBe(session(app).upperLayers === 'alternate');
    // The arrow keys move the choice, as in any radio group.
    radio(other).focus();
    await app.user.keyboard('{ArrowLeft}');
    expect(session(app).upperLayers).toBe(was);
    // What the layout comes to is shown, with every stability warning in words.
    expect(figure('Layers')).toBe(String(session(app).build.layout.layers.length));
    const warnings = session(app).build.layout.stability!.warnings;
    expect(warnings.length).toBeGreaterThan(0);
    expect(
      within(within(panel()).getByRole('list', { name: 'Stability warnings' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(warnings.length);
  });
});

describe('the carton list', () => {
  it('names every carton by where it is, and selects with a click', async () => {
    const app = await openLayer();
    const { usable, base } = session(app);
    const all = cartons(app);
    expect(within(list()).getAllByRole('button')).toHaveLength(all.length);
    all.forEach((c, k) => {
      const depth = c.rotated ? base.a : base.b;
      const name = `Carton ${k + 1}: ${lengthText(c.x, 'in')} from left, ${lengthText(
        usable.y - c.y - depth,
        'in',
      )} from front${c.rotated ? ', turned' : ''}`;
      expect(item(k)).toHaveAccessibleName(name);
      expect(item(k)).toHaveAttribute('data-x', String(c.x));
      expect(item(k)).toHaveAttribute('data-y', String(c.y));
      expect(item(k)).toHaveAttribute('aria-pressed', 'false');
    });
    expect(list()).toHaveAttribute('data-footprint-length', String(usable.x));
    expect(within(panel()).getByText('No carton is selected.')).toBeInTheDocument();

    await app.user.click(item(2));
    expect(session(app).selected).toBe(2);
    expect(item(2)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('carton-selected')).toHaveTextContent(/^Carton 3: /);
    // One stop in the tab order: the selected carton.
    expect(
      within(list())
        .getAllByRole('button')
        .filter((b) => b.tabIndex === 0),
    ).toEqual([item(2)]);
    // A second click lets it go.
    await app.user.click(item(2));
    expect(session(app).selected).toBeNull();
  });

  it('marks a carton outside the footprint, as the flag does', async () => {
    const app = await openLayer();
    await aloneOnThePallet(app);
    act(() => {
      app.stores.manualEditor.getState().move(0, { x: -1.5, y: 0 }, { snap: false });
    });
    expect(item(0)).toHaveAttribute('data-outside', 'true');
    expect(item(0)).toHaveAccessibleName(/outside the allowed footprint$/);
    const flags = within(panel()).getByRole('list', { name: 'Layout flags' });
    expect(flags).toHaveTextContent('1 carton overhangs the allowed footprint by up to 1.50 in');
  });
});

describe('the layer keys', () => {
  it('move the selected carton by a quarter, or one with Shift, and refuse an overlap', async () => {
    const app = await openLayer();
    await aloneOnThePallet(app);
    const at = (): ManualCarton => cartons(app)[0]!;
    const start = at();
    item(0).focus();
    await app.user.keyboard('{ArrowRight}');
    expect(at()).toMatchObject({ x: start.x + NUDGE_STEP, y: start.y });
    await app.user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(at().x).toBe(start.x + NUDGE_STEP + NUDGE_STEP_LARGE);
    await app.user.keyboard('{ArrowLeft}');
    expect(at().x).toBe(start.x + NUDGE_STEP_LARGE);
    // Down is toward the front (the greatest y); up is away from it.
    await app.user.keyboard('{ArrowDown}');
    expect(at().y).toBe(start.y + NUDGE_STEP);
    await app.user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(at().y).toBe(start.y + NUDGE_STEP - NUDGE_STEP_LARGE);
    expect(NUDGE_STEP).toBe(0.25);
    expect(NUDGE_STEP_LARGE).toBe(1);
    // The list follows.
    expect(item(0)).toHaveAttribute('data-x', String(at().x));

    // A second carton, then into it: refused, with the message.
    await app.user.click(tool('Add carton'));
    expect(session(app).selected).toBe(1);
    const second = cartons(app)[1]!;
    act(() => {
      app.stores.manualEditor.getState().select(0);
      app.stores.manualEditor.getState().move(0, { x: second.x, y: second.y }, { snap: false });
    });
    expect(at()).not.toMatchObject({ x: second.x, y: second.y });
  });

  it('refuse a move into another carton with the message', async () => {
    const app = await openLayer();
    await app.user.click(item(0));
    const before = cartons(app);
    // Carton 0 has a neighbour on one side at least: one of the four ways is refused.
    const refused: string[] = [];
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
      item(0).focus();
      await app.user.keyboard(`{${key}}`);
      if (cartons(app) === before) refused.push(message().textContent ?? '');
      else await app.user.keyboard('{Control>}z{/Control}');
    }
    expect(refused.length).toBeGreaterThan(0);
    expect(new Set(refused)).toEqual(new Set([LAYER_MESSAGES.overlap]));
  });

  it('remove, turn, cycle the selection, undo and redo', async () => {
    const app = await openLayer();
    const count = cartons(app).length;
    item(0).focus();
    // Nothing is selected yet: the next carton is the first, the previous the last.
    await app.user.keyboard(']');
    expect(session(app).selected).toBe(0);
    await app.user.keyboard(']');
    expect(session(app).selected).toBe(1);
    // The focus goes with the selection.
    expect(item(1)).toHaveFocus();
    await app.user.keyboard('[[[[');
    expect(session(app).selected).toBe(count - 1);
    expect(item(count - 1)).toHaveFocus();

    await app.user.keyboard('{Delete}');
    expect(cartons(app)).toHaveLength(count - 1);
    await app.user.keyboard('{Control>}z{/Control}');
    expect(cartons(app)).toHaveLength(count);
    await app.user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(cartons(app)).toHaveLength(count - 1);
    await app.user.keyboard('{Control>}z{/Control}');
    await app.user.keyboard('{Control>}y{/Control}');
    expect(cartons(app)).toHaveLength(count - 1);
    await app.user.keyboard('{Meta>}z{/Meta}');
    expect(cartons(app)).toHaveLength(count);

    await aloneOnThePallet(app);
    item(0).focus();
    const was = cartons(app)[0]!.rotated;
    await app.user.keyboard('r');
    expect(cartons(app)[0]!.rotated).toBe(!was);
    await app.user.keyboard('{Backspace}');
    expect(cartons(app)).toHaveLength(0);
    // An empty layer cannot be saved, and says so.
    expect(within(bar()).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByTestId('carton-selected')).toHaveTextContent('The layer has no cartons');
    // The focus is still in the list, so the next key lands: undo brings the carton back.
    expect(list()).toHaveFocus();
    await app.user.keyboard('{Control>}z{/Control}');
    expect(cartons(app)).toHaveLength(1);
    expect(item(0)).toHaveFocus();
  });

  it('say that a carton must be selected first', async () => {
    const app = await openLayer();
    const before = cartons(app);
    item(0).focus();
    await app.user.keyboard('{ArrowLeft}');
    expect(cartons(app)).toBe(before);
    expect(message()).toHaveTextContent(LAYER_MESSAGES.noSelection);
  });

  it('are left alone while a text field has the focus', async () => {
    const app = await openLayer();
    await app.user.click(item(0));
    const before = cartons(app);
    const name = within(bar()).getByRole('textbox', { name: 'Layout name' });
    await app.user.click(name);
    await app.user.keyboard('r{Backspace}{ArrowLeft}[[{Delete}');
    await app.user.keyboard(']');
    expect(cartons(app)).toBe(before);
    expect(session(app).selected).toBe(0);
    await app.user.click(field('From left edge'));
    await app.user.keyboard('{ArrowLeft}{Delete}r');
    expect(cartons(app)).toBe(before);
    expect(session(app).selected).toBe(0);
  });

  it('handleLayerKey ignores keys it does not own and typing targets', () => {
    const calls: string[] = [];
    const actions = new Proxy({} as LayerActions, {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push(`${name}(${args.join(',')})`);
          return true;
        },
    });
    const press = (key: string, more: Partial<KeyboardEventInit> = {}, target?: Element) => {
      let prevented = false;
      const handled = handleLayerKey(
        {
          key,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          ...more,
          target: target ?? document.body,
          preventDefault: () => {
            prevented = true;
          },
        },
        actions,
        0,
      );
      expect(prevented).toBe(handled);
      return handled;
    };
    expect(press('Tab')).toBe(false);
    expect(press('a')).toBe(false);
    expect(press('ArrowLeft', { altKey: true })).toBe(false);
    expect(press('r', { ctrlKey: true })).toBe(false);
    expect(press('r', {}, document.createElement('input'))).toBe(false);
    expect(press('Delete', {}, document.createElement('textarea'))).toBe(false);
    expect(calls).toEqual([]);
    expect(press('R')).toBe(true);
    expect(press('ArrowUp', { shiftKey: true })).toBe(true);
    expect(press('Z', { metaKey: true, shiftKey: true })).toBe(true);
    expect(press('y', { ctrlKey: true })).toBe(true);
    expect(press('Escape')).toBe(true);
    expect(calls).toEqual(['turn()', 'nudge(0,-1)', 'redo()', 'redo()', 'select()']);
    // With nothing selected Escape is not the layer's key.
    expect(
      handleLayerKey(
        {
          key: 'Escape',
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: null,
          preventDefault: () => {},
        },
        actions,
        null,
      ),
    ).toBe(false);
  });

  it('refusalText words the refusals the layer can give', () => {
    expect(refusalText({ ok: true })).toBeNull();
    expect(refusalText({ ok: false, reason: 'noFreeSpot' })).toBe(
      'No free space for another carton inside the footprint',
    );
    expect(refusalText({ ok: false, reason: 'turnRefused' })).toBe(
      'Cannot turn: it would overlap another carton',
    );
    expect(refusalText({ ok: false, reason: 'overlap' })).toBe('Cartons cannot overlap');
    expect(refusalText({ ok: false, reason: 'nothingToUndo' })).toBeNull();
  });
});

describe('the position fields', () => {
  it('are off until a carton is selected, then show where it is', async () => {
    const app = await openLayer();
    expect(field('From left edge')).toBeDisabled();
    expect(field('From front edge')).toBeDisabled();
    expect(field('From left edge')).toHaveAccessibleDescription(SELECT_TO_POSITION);
    await app.user.click(item(0));
    const { usable, base } = session(app);
    const c = cartons(app)[0]!;
    const depth = c.rotated ? base.a : base.b;
    expect(field('From left edge')).toHaveValue(lengthText(c.x, 'in').replace(' in', ''));
    expect(field('From front edge')).toHaveValue(
      lengthText(usable.y - c.y - depth, 'in').replace(' in', ''),
    );
    expect(within(screen.getByTestId('selected-carton')).getByRole('heading')).toHaveTextContent(
      `Carton 1 of ${cartons(app).length}`,
    );
  });

  it('apply a typed distance on Enter and on leaving the field, exactly as typed', async () => {
    const app = await openLayer();
    await aloneOnThePallet(app);
    const { usable, base } = session(app);
    const depth = () => (cartons(app)[0]!.rotated ? base.a : base.b);
    await app.user.clear(field('From left edge'));
    await app.user.type(field('From left edge'), '3.3{Enter}');
    // Not snapped to the edge 0.3 away... nor to anything else.
    expect(cartons(app)[0]!.x).toBeCloseTo(3.3, 12);
    expect(field('From left edge')).toHaveValue('3.30');

    await app.user.clear(field('From front edge'));
    await app.user.type(field('From front edge'), '2');
    await app.user.tab();
    expect(cartons(app)[0]!.y).toBeCloseTo(usable.y - depth() - 2, 12);
    expect(field('From front edge')).toHaveValue('2.00');

    // Leaving a field as it was shown changes nothing (the place is not rounded).
    act(() => {
      app.stores.manualEditor.getState().move(0, { x: 1.23456, y: 4 }, { snap: false });
    });
    await app.user.click(field('From left edge'));
    await app.user.tab();
    expect(cartons(app)[0]!.x).toBe(1.23456);

    // A negative distance is outside the footprint: allowed, and flagged.
    await app.user.clear(field('From left edge'));
    await app.user.type(field('From left edge'), '-2{Enter}');
    expect(cartons(app)[0]!.x).toBe(-2);
    expect(within(panel()).getByRole('list', { name: 'Layout flags' })).toHaveTextContent(
      'overhangs the allowed footprint by up to 2.00 in',
    );
  });

  it('refuse a place over another carton, and what is not a number, with a message', async () => {
    const app = await openLayer();
    await app.user.click(item(0));
    const before = cartons(app);
    const other = before[1]!;
    const shown = (field('From left edge') as HTMLInputElement).value;
    // Carton 1 is beside carton 0, in the same row: half an inch off its left edge is over it.
    expect(other.y).toBe(before[0]!.y);
    await app.user.clear(field('From left edge'));
    await app.user.type(field('From left edge'), `${other.x + 0.5}{Enter}`);
    expect(cartons(app)).toBe(before);
    expect(screen.getByTestId('position-message')).toHaveTextContent(LAYER_MESSAGES.overlap);
    expect(field('From left edge')).toHaveValue(shown);
    expect(field('From left edge')).toHaveAccessibleDescription(LAYER_MESSAGES.overlap);
    expect(field('From left edge')).toHaveAttribute('aria-invalid', 'true');

    await app.user.clear(field('From left edge'));
    await app.user.type(field('From left edge'), 'abc{Enter}');
    expect(cartons(app)).toBe(before);
    expect(screen.getByTestId('position-message')).toHaveTextContent(NOT_A_NUMBER);
    expect(field('From left edge')).toHaveValue(shown);
  });

  it('show and take the display unit', async () => {
    const app = await openLayer();
    await aloneOnThePallet(app);
    await app.user.selectOptions(screen.getByRole('combobox', { name: 'Units' }), 'cm');
    await flush();
    const x = cartons(app)[0]!.x;
    expect(field('From left edge')).toHaveValue(lengthText(x, 'cm').replace(' cm', ''));
    await app.user.clear(field('From left edge'));
    await app.user.type(field('From left edge'), '2.54{Enter}');
    expect(cartons(app)[0]!.x).toBeCloseTo(1, 12);
    expect(item(0)).toHaveAccessibleName(/^Carton 1: 2\.5 cm from left/);
  });

  it('Escape gives up what was typed', async () => {
    const app = await openLayer();
    await app.user.click(item(0));
    const before = cartons(app);
    const shown = (field('From left edge') as HTMLInputElement).value;
    await app.user.clear(field('From left edge'));
    await app.user.type(field('From left edge'), '40{Escape}');
    expect(field('From left edge')).toHaveValue(shown);
    fireEvent.blur(field('From left edge'));
    expect(cartons(app)).toBe(before);
    expect(session(app).selected).toBe(0);
  });
});

describe('the mixed-pattern note', () => {
  it('says what a result that mixes layer patterns comes to as a copy', async () => {
    const app = await openLayer(1);
    const best = app.stores.results.getState().result!.layouts[0]!.layout;
    const built = session(app).build.layout.totalProducts;
    // The default best result mixes patterns: 260 boxes, 250 as a stack of its bottom layer.
    expect(best.totalProducts).toBe(260);
    expect(built).toBe(250);
    expect(screen.getByTestId('mixed-note')).toHaveTextContent(
      'This result mixes layer patterns. Editing by hand starts from its bottom layer: 250 boxes instead of 260.',
    );
    // It stays what the copy started as, whatever is then done to the layer.
    await app.user.click(item(0));
    await app.user.click(tool('Remove'));
    expect(screen.getByTestId('mixed-note')).toHaveTextContent('250 boxes instead of 260');
  });

  it('is not shown for a result of one pattern', async () => {
    await openLayer(2);
    expect(screen.queryByTestId('mixed-note')).toBeNull();
  });
});
