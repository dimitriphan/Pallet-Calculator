/** The editor fixes from the review of Tasks 5 and 6, on the whole app. */
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { madeForOf } from '../../engine/manual/build';
import { TEST_DESIGN } from '../../engine/manual/testSupport';
import { NOT_SAVED } from '../../persistence/localStorageRepository';
import { FakeStorage } from '../../persistence/testStorage';
import { nameAdjustedNotice } from '../../store/manualStores';
import { useNoticesStore } from '../../store/noticesStore';
import { flush, makeStores, renderApp } from '../testUtils';
import { STEP_NOTICES, USING_LAST_VALID } from './EditorBar';
import { EDITOR_BLOCKS } from './EditorBlocked';
import { LAYER_MESSAGES } from './layerActions';
import { ENTRY_REASONS } from './useEditorEntry';

type App = Awaited<ReturnType<typeof renderApp>>;

afterEach(() => {
  vi.unstubAllGlobals();
  useNoticesStore.setState({ notices: [] });
});

const editor = (app: App) => app.stores.manualEditor.getState();
const bar = () => screen.getByRole('region', { name: 'Editing by hand' });
const inBar = (name: string) => within(bar()).getByRole('button', { name });

describe('ways in while the result is behind the inputs (review I1)', () => {
  it('are off, saying to wait, from the moment an input changes until the result is back', async () => {
    const app = await renderApp();
    const own = screen.getByRole('button', { name: 'Design my own carton' });
    const row = screen.getByRole('button', { name: 'Edit layout 1 by hand' });
    const details = screen.getByRole('button', { name: 'Edit layout by hand' });
    expect(own).toBeEnabled();

    // Typed, and the 300 ms wait before the calculation has not passed.
    act(() => app.stores.inputs.getState().setField('product.height', '5'));
    expect(app.stores.results.getState()).toMatchObject({ status: 'ready', stale: false });
    for (const b of [own, row, details]) {
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(ENTRY_REASONS.waiting);
    }
    expect(ENTRY_REASONS.waiting).toBe('Wait for the calculation to finish.');
    // Whatever presses it, the store refuses too.
    expect(editor(app).openFromCalculated(0)).toEqual({ ok: false, reason: 'resultBehind' });

    await flush();
    expect(own).toBeEnabled();
    await app.user.click(own);
    expect(editor(app).session!.build.flags.some((f) => f.kind === 'overlap')).toBe(false);
  });

  it('say to fix the inputs while one is invalid', async () => {
    const app = await renderApp();
    act(() => app.stores.inputs.getState().setField('pallet.length', 'abc'));
    await flush();
    const own = screen.getByRole('button', { name: 'Design my own carton' });
    expect(own).toBeDisabled();
    expect(own).toHaveAccessibleDescription(ENTRY_REASONS.invalid);
  });
});

describe('saving when storage refuses (review I6)', () => {
  it('keeps the editor open with the message, and nothing is listed as saved', async () => {
    const app = await renderApp();
    act(() => {
      editor(app).openFromCalculated(0);
      editor(app).remove(0);
    });
    const real = app.stores.manualLayouts.getState().save;
    app.stores.manualLayouts.setState({ save: () => null });
    await app.user.click(inBar('Save'));
    expect(editor(app).session).not.toBeNull();
    expect(within(bar()).getByRole('alert')).toHaveTextContent(NOT_SAVED);
    expect(NOT_SAVED).toBe('Could not save: browser storage is full or unavailable.');
    expect(screen.queryByRole('region', { name: 'Your layouts' })).toBeNull();
    expect(app.stores.results.getState().selectedManualId).toBeNull();

    app.stores.manualLayouts.setState({ save: real });
    await app.user.click(inBar('Save'));
    expect(editor(app).session).toBeNull();
    expect(screen.getByRole('region', { name: 'Your layouts' })).toBeInTheDocument();
  });
});

describe('Cancel', () => {
  it('asks when only the name was changed (review M4)', async () => {
    const app = await renderApp();
    act(() => void editor(app).openFromCalculated(0));
    const name = screen.getByRole('textbox', { name: 'Layout name' });
    await app.user.clear(name);
    await app.user.type(name, 'Dock 4');
    await app.user.click(inBar('Cancel'));
    const dialog = screen.getByRole('dialog', { name: 'Discard your changes?' });
    await app.user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(editor(app).session!.name).toBe('Dock 4');
  });
});

describe('focus', () => {
  it('goes to Redo when the last Undo disables Undo, and back the other way', async () => {
    const app = await renderApp();
    act(() => {
      editor(app).openFromCalculated(0);
      editor(app).remove(0);
    });
    await app.user.click(inBar('Undo'));
    expect(inBar('Undo')).toBeDisabled();
    expect(inBar('Redo')).toHaveFocus();
    await app.user.click(inBar('Redo'));
    expect(inBar('Redo')).toBeDisabled();
    expect(inBar('Undo')).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('goes to Add carton when Remove takes the selection away', async () => {
    const app = await renderApp();
    act(() => {
      editor(app).openFromCalculated(0);
      editor(app).select(0);
    });
    await app.user.click(inBar('Remove'));
    expect(inBar('Remove')).toBeDisabled();
    expect(inBar('Add carton')).toHaveFocus();
  });

  it('returns to the control that opened the editor when it closes', async () => {
    const app = await renderApp();
    const row = screen.getByRole('button', { name: 'Edit layout 2 by hand' });
    await app.user.click(row);
    expect(editor(app).session).not.toBeNull();
    await app.user.click(inBar('Cancel'));
    expect(row).toHaveFocus();

    // Opened by something that is gone afterwards: the fallback takes it.
    act(() => void editor(app).openFromCalculated(0));
    act(() => editor(app).cancel());
    expect(document.activeElement).not.toBe(document.body);
  });

  it('in Basic view goes to the card heading when the editor closes', async () => {
    const app = await renderApp(undefined, { viewMode: 'basic' });
    act(() => void editor(app).openFromCalculated(0));
    const blocked = screen.getByTestId('editor-blocked');
    await app.user.click(within(blocked).getByRole('button', { name: 'Stop editing' }));
    expect(editor(app).session).toBeNull();
    expect(screen.getByRole('heading', { name: 'What to build' })).toHaveFocus();
  });
});

describe('a session that cannot be worked in', () => {
  it('Basic view: a blocking notice, the session kept, and the way back', async () => {
    const app = await renderApp();
    act(() => {
      editor(app).openFromCalculated(0);
      editor(app).remove(0);
    });
    const before = editor(app).session!.cartons;
    act(() => app.stores.prefs.getState().setViewMode('basic'));
    const blocked = screen.getByTestId('editor-blocked');
    expect(within(blocked).getByRole('heading')).toHaveTextContent('Editing is in Full view');
    expect(within(blocked).getByRole('heading')).toHaveFocus();
    expect(blocked).toHaveTextContent(EDITOR_BLOCKS.basic.text);
    // Nothing of the editor is left half-usable.
    expect(screen.queryByRole('region', { name: 'Editing by hand' })).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(editor(app).session!.cartons).toBe(before);

    // Stopping asks first: there are unsaved changes.
    await app.user.click(within(blocked).getByRole('button', { name: 'Stop editing' }));
    await app.user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep the layout' }),
    );
    expect(editor(app).session).not.toBeNull();

    await app.user.click(within(blocked).getByRole('button', { name: 'Switch to Full view' }));
    expect(screen.queryByTestId('editor-blocked')).toBeNull();
    expect(bar()).toBeInTheDocument();
    expect(editor(app).session!.cartons).toBe(before);
  });

  it('below 768 px: "Editing needs a wider screen"', async () => {
    let narrow = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return !narrow;
      },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }));
    const app = await renderApp();
    act(() => void editor(app).openFromCalculated(0));
    expect(screen.queryByTestId('editor-blocked')).toBeNull();
    act(() => {
      narrow = true;
      listeners.forEach((l) => l());
    });
    const blocked = screen.getByTestId('editor-blocked');
    expect(blocked).toHaveTextContent('Editing needs a wider screen');
    expect(within(blocked).queryByRole('button', { name: 'Switch to Full view' })).toBeNull();
    expect(editor(app).session).not.toBeNull();
    act(() => {
      narrow = false;
      listeners.forEach((l) => l());
    });
    expect(screen.queryByTestId('editor-blocked')).toBeNull();
    expect(bar()).toBeInTheDocument();
  });
});

describe('inputs changed mid-session', () => {
  it('back at the Carton step with the reason when the carton no longer fits', async () => {
    const app = await renderApp();
    act(() => void editor(app).openFromCalculated(0));
    expect(editor(app).session!.step).toBe('layer');
    act(() => app.stores.inputs.getState().setField('pallet.height', '7'));
    await flush();
    expect(editor(app).session!.step).toBe('carton');
    expect(within(bar()).getByTestId('step-notice')).toHaveTextContent(STEP_NOTICES.cartonBlocked);
    expect(within(bar()).getByRole('tab', { name: /Carton/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('says the editor is on the last valid inputs while one is invalid', async () => {
    const app = await renderApp();
    act(() => void editor(app).openFromCalculated(0));
    expect(within(bar()).queryByTestId('last-valid-note')).toBeNull();
    act(() => app.stores.inputs.getState().setField('pallet.length', 'abc'));
    await flush();
    expect(within(bar()).getByTestId('last-valid-note')).toHaveTextContent(USING_LAST_VALID);
    act(() => app.stores.inputs.getState().setField('pallet.length', '50'));
    await flush();
    expect(within(bar()).queryByTestId('last-valid-note')).toBeNull();
  });
});

describe('Turn 90°', () => {
  it('says there is no room when the turn would only fit outside the footprint', async () => {
    const app = await renderApp();
    let id = '';
    act(() => {
      id = app.stores.manualLayouts.getState().save({
        design: TEST_DESIGN,
        cartons: [
          { x: 33, y: 17, rotated: true },
          { x: 8, y: 17, rotated: false },
        ],
        frame: 'pallet',
        upperLayers: 'same',
        madeFor: madeForOf(TEST_DESIGN, app.stores.manualLayouts.getState().inputs!),
      })!.id;
      editor(app).openSaved(id);
      editor(app).select(0);
    });
    await app.user.click(inBar('Turn 90°'));
    expect(screen.getByTestId('layer-message')).toHaveTextContent(
      'No room to turn this carton here. Move it first.',
    );
    expect(LAYER_MESSAGES.turnNoRoom).toBe('No room to turn this carton here. Move it first.');
    expect(editor(app).session!.canUndo).toBe(false);
  });
});

describe('the final review of round 5', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('asks before the page is left with unsaved work, and only then (F8)', async () => {
    const app = await renderApp();
    expect(unload()).toBe(false);
    await app.user.click(screen.getByRole('button', { name: 'Edit layout 2 by hand' }));
    // Open and unchanged: nothing would be lost.
    expect(unload()).toBe(false);
    act(() => {
      editor(app).remove(0);
    });
    expect(editor(app).session!.dirty).toBe(true);
    expect(unload()).toBe(true);
    act(() => {
      editor(app).undo();
    });
    expect(unload()).toBe(false);
    act(() => {
      editor(app).remove(0);
    });
    expect(unload()).toBe(true);
    await app.user.click(inBar('Save'));
    expect(editor(app).session).toBeNull();
    expect(unload()).toBe(false);
    // Cancelled with changes: the guard goes with the session.
    await app.user.click(screen.getByRole('button', { name: 'Edit layout 2 by hand' }));
    act(() => {
      editor(app).remove(0);
      editor(app).cancel();
    });
    expect(unload()).toBe(false);
  });

  it('Save says when another tab changed the layout, and offers Save as new or Overwrite (F9)', async () => {
    const manualStorage = new FakeStorage();
    const app = await renderApp(undefined, { manualStorage });
    const other = makeStores(undefined, { manualStorage }).manualLayouts.getState;
    const open = async () => {
      let id = '';
      act(() => {
        editor(app).openFromCalculated(1);
        const saved = editor(app).save({ name: `Dock ${manual(app).specs.length + 1}` });
        if (saved.ok) id = saved.id;
        editor(app).openSaved(id);
        editor(app).remove(0);
      });
      return id;
    };
    const manual = (a: App) => a.stores.manualLayouts.getState();

    // Changed elsewhere, then "Save as new": both are kept.
    const first = await open();
    act(() => {
      other().refresh();
      other().rename(first, 'Theirs');
    });
    await app.user.click(inBar('Save'));
    const alert = screen.getByTestId('changed-elsewhere');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('This layout was changed in another tab.');
    expect(editor(app).session).not.toBeNull();
    expect(manual(app).specs.map((s) => s.name)).toEqual(['Theirs']);
    await app.user.click(within(alert).getByRole('button', { name: 'Save as new' }));
    expect(editor(app).session).toBeNull();
    expect(manual(app).specs.map((s) => s.name)).toEqual(['Theirs', 'Manual 1']);

    // Changed elsewhere, then "Overwrite": this tab's version takes its place.
    const second = await open();
    act(() => {
      other().refresh();
      other().rename(second, 'Theirs too');
    });
    await app.user.click(inBar('Save'));
    await app.user.click(
      within(screen.getByTestId('changed-elsewhere')).getByRole('button', { name: 'Overwrite' }),
    );
    expect(editor(app).session).toBeNull();
    expect(manual(app).specs.map((s) => s.name)).toEqual(['Theirs', 'Manual 1', 'Dock 3']);

    // Deleted elsewhere: said, and not saved again unasked.
    const third = await open();
    act(() => {
      other().refresh();
      other().remove(third);
    });
    await app.user.click(inBar('Save'));
    const gone = screen.getByTestId('changed-elsewhere');
    expect(gone).toHaveTextContent(/^This layout was deleted in another tab\. Save it again\?/);
    expect(gone).not.toHaveTextContent('keeps both');
    expect(within(gone).queryByRole('button', { name: 'Overwrite' })).toBeNull();
    expect(manual(app).specs.some((s) => s.id === third)).toBe(false);
    expect(editor(app).session).not.toBeNull();
    // "Not now" leaves the editor open with the work in it; "Save again" saves it.
    await app.user.click(within(gone).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('changed-elsewhere')).toBeNull();
    expect(editor(app).session).not.toBeNull();
    const before = manual(app).specs.length;
    await app.user.click(inBar('Save'));
    await app.user.click(
      within(screen.getByTestId('changed-elsewhere')).getByRole('button', { name: 'Save again' }),
    );
    expect(editor(app).session).toBeNull();
    expect(manual(app).specs).toHaveLength(before + 1);
  });

  it('the mixed-pattern note is on the Carton step too while it applies (F12)', async () => {
    const app = await renderApp();
    await app.user.click(screen.getByRole('button', { name: 'Design my own carton' }));
    expect(editor(app).session!.step).toBe('carton');
    const note = 'Editing by hand starts from its bottom layer: 250 boxes instead of 260.';
    expect(screen.getByTestId('mixed-note')).toHaveTextContent(note);
    // Saved straight from here it holds 250, as the note said.
    await app.user.click(inBar('Save'));
    expect(app.stores.manualLayouts.getState().entries[0]!.build.layout.totalProducts).toBe(250);
    // Another carton is another layout: the note goes.
    await app.user.click(screen.getByRole('button', { name: 'Design my own carton' }));
    await app.user.click(
      screen.getByRole('button', { name: "One more: boxes along the carton's height" }),
    );
    expect(screen.queryByTestId('mixed-note')).toBeNull();
  });

  it('a taken name is made different, and a notice says so (F14)', async () => {
    const said: string[] = [];
    const app = await renderApp(undefined, { onNotice: (m) => said.push(m) });
    for (let k = 0; k < 2; k++) {
      await app.user.click(screen.getByRole('button', { name: 'Edit layout 2 by hand' }));
      await app.user.clear(screen.getByRole('textbox', { name: 'Layout name' }));
      await app.user.type(screen.getByRole('textbox', { name: 'Layout name' }), 'Dock');
      await app.user.click(inBar('Save'));
    }
    expect(app.stores.manualLayouts.getState().specs.map((s) => s.name)).toEqual([
      'Dock',
      'Dock (2)',
    ]);
    expect(said).toEqual([nameAdjustedNotice('Dock', 'Dock (2)')]);
    expect(said[0]).toBe('Another layout is already named “Dock”. This one was named “Dock (2)”.');
    // Every button that names a layout names one layout.
    expect(screen.getAllByRole('button', { name: 'Edit Dock' })).toHaveLength(1);
    await app.user.click(screen.getByRole('button', { name: 'Duplicate Dock' }));
    await app.user.click(screen.getByRole('button', { name: 'Duplicate Dock' }));
    const names = app.stores.manualLayouts.getState().specs.map((s) => s.name);
    expect(names).toEqual(['Dock', 'Dock (2)', 'Dock (copy)', 'Dock (copy) (2)']);
  });
});
