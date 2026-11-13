import { useEffect, useState } from 'react';
import type { EditorResult } from '../../store/manualEditorStore';
import { sameInputs } from '../../store/resultsStore';
import { useManualEditor, useManualLayouts, useResults } from '../StoreContext';

/** The editor is offered at this width and above (spec 6.2b). CSS pixels. */
export const EDITOR_MIN_WIDTH = 768;

/** The one line, shown once near the entry buttons, that every disabled one is described by. */
export const EDITOR_ENTRY_REASON_ID = 'editor-entry-reason';

/** The button focus goes back to when the editor closes and what opened it is gone. */
export const DESIGN_OWN_ID = 'design-own-carton';

export const ENTRY_REASONS = {
  editing: 'Save or cancel the layout you are editing first.',
  narrow: `Editing by hand needs a wider screen (at least ${EDITOR_MIN_WIDTH} px across).`,
  noResult: 'There is no calculated layout to start from yet.',
  /** The result on screen is for other inputs than the ones typed: a calculation is due. */
  waiting: 'Wait for the calculation to finish.',
  invalid: 'Fix the highlighted fields first.',
  failed: 'The calculation failed. Retry it first.',
} as const;

/** Whether the window is wide enough to edit in; follows the window as it is resized. */
export function useWideEnough(): boolean {
  const query = `(min-width: ${EDITOR_MIN_WIDTH}px)`;
  const read = () =>
    // Where the width cannot be asked (tests, old browsers) the editor is offered.
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(query).matches;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const onChange = () => setWide(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return wide;
}

/** The control that last opened the editor: where the focus goes back to when it closes. */
let opener: HTMLElement | null = null;

/** Notes what has the focus as the editor's opener; call just before opening it. */
export function noteEditorOpener(): void {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

/**
 * Puts the focus back where editing started, now that the editor has closed: the control that
 * opened it when it is still there and can take the focus, else the first of `fallbackIds`
 * that is (the "Design my own carton" button in Full view, the card's heading in Basic view).
 */
export function returnEditorFocus(fallbackIds: readonly string[]): void {
  const candidates = [opener, ...fallbackIds.map((id) => document.getElementById(id))];
  opener = null;
  for (const el of candidates) {
    if (!el || !el.isConnected || (el as HTMLButtonElement).disabled) continue;
    el.focus();
    if (document.activeElement === el) return;
  }
}

export interface EditorEntry {
  /** Why no editor session can be opened right now (one is open, the window is narrow). */
  blocked: string | null;
  /**
   * Why nothing can be opened from a calculated layout right now: `blocked`, or there is no
   * result, or the result is behind the inputs (invalid, being recalculated, failed).
   */
  blockedCalculated: string | null;
  /** "Design my own carton": the best result's carton, at the Carton step. */
  openOwn(): EditorResult;
  /** "Edit layout by hand": a copy of the calculated layout at `index`. */
  openCalculated(index: number): EditorResult;
  /** Edit a saved manual layout again. */
  openSaved(id: string): EditorResult;
  /** "Rebuild" an out-of-date manual layout from the best calculated layout. */
  rebuild(id: string): EditorResult;
}

/** The ways into the editor and the reason, if any, that they are closed. */
export function useEditorEntry(): EditorEntry {
  const editing = useManualEditor((s) => s.session !== null);
  const openOwn = useManualEditor((s) => s.openOwn);
  const openFromCalculated = useManualEditor((s) => s.openFromCalculated);
  const openSaved = useManualEditor((s) => s.openSaved);
  const rebuild = useManualEditor((s) => s.rebuild);
  const hasResult = useResults((s) => !!s.inputs && (s.result?.layouts.length ?? 0) > 0);
  const status = useResults((s) => s.status);
  const stale = useResults((s) => s.stale);
  const made = useResults((s) => s.inputs);
  const current = useManualLayouts((m) => m.inputs);
  const invalid = useManualLayouts((m) => m.stale);
  const wide = useWideEnough();
  const blocked = editing ? ENTRY_REASONS.editing : !wide ? ENTRY_REASONS.narrow : null;
  // The result is for other inputs than the current valid ones until the calculation that
  // the change started (after a short wait) has come back.
  const behind = !!made && !!current && !sameInputs(made, current);
  const blockedCalculated =
    blocked ??
    (!hasResult
      ? ENTRY_REASONS.noResult
      : invalid
        ? ENTRY_REASONS.invalid
        : status === 'error'
          ? ENTRY_REASONS.failed
          : status === 'running' || stale || behind
            ? ENTRY_REASONS.waiting
            : null);
  const opening =
    <A extends unknown[]>(open: (...args: A) => EditorResult) =>
    (...args: A) => {
      noteEditorOpener();
      return open(...args);
    };
  return {
    blocked,
    blockedCalculated,
    openOwn: opening(openOwn),
    openCalculated: opening((index: number) => openFromCalculated(index)),
    openSaved: opening((id: string) => openSaved(id)),
    rebuild: opening(rebuild),
  };
}
