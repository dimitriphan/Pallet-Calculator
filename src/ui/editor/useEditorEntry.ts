import { useEffect, useState } from 'react';
import type { EditorResult } from '../../store/manualEditorStore';
import { useManualEditor, useResults } from '../StoreContext';

/** The editor is offered at this width and above (spec 6.2b). CSS pixels. */
export const EDITOR_MIN_WIDTH = 768;

/** The one line, shown once near the entry buttons, that every disabled one is described by. */
export const EDITOR_ENTRY_REASON_ID = 'editor-entry-reason';

/** The button focus goes back to when the editor closes. */
export const DESIGN_OWN_ID = 'design-own-carton';

export const ENTRY_REASONS = {
  editing: 'Save or cancel the layout you are editing first.',
  narrow: `Editing by hand needs a wider screen (at least ${EDITOR_MIN_WIDTH} px across).`,
  noResult: 'There is no calculated layout to start from yet.',
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

export interface EditorEntry {
  /** Why the editor cannot be opened right now, or null when it can. */
  blocked: string | null;
  /** "Design my own carton": the best result's carton, at the Carton step. */
  openOwn(): EditorResult;
  /** "Edit layout by hand": a copy of the calculated layout at `index`. */
  openCalculated(index: number): EditorResult;
  /** Edit a saved manual layout again. */
  openSaved(id: string): EditorResult;
}

/** The ways into the editor and the reason, if any, that they are closed. */
export function useEditorEntry(): EditorEntry {
  const editing = useManualEditor((s) => s.session !== null);
  const openOwn = useManualEditor((s) => s.openOwn);
  const openFromCalculated = useManualEditor((s) => s.openFromCalculated);
  const openSaved = useManualEditor((s) => s.openSaved);
  const hasResult = useResults((s) => !!s.inputs && (s.result?.layouts.length ?? 0) > 0);
  const wide = useWideEnough();
  const blocked = editing
    ? ENTRY_REASONS.editing
    : !wide
      ? ENTRY_REASONS.narrow
      : !hasResult
        ? ENTRY_REASONS.noResult
        : null;
  return {
    blocked,
    openOwn,
    openCalculated: (index) => openFromCalculated(index),
    openSaved: (id) => openSaved(id),
  };
}
