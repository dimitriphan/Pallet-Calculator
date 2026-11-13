import { useMemo } from 'react';
import { buildManualLayout, mixesLayerPatterns, specFromLayout } from '../../engine/manual/build';
import type { EditorSession } from '../../store/manualEditorStore';
import { fmtCount } from '../format';
import { useResults } from '../StoreContext';
import { NOTE_BOX } from './styles';

/**
 * What a calculated result that mixes layer patterns comes to as a hand-edited copy: the copy
 * stacks the bottom layer only, so it can hold a different number of boxes. Null when the
 * session was not opened from such a result (or its carton is no longer that result's).
 */
function useMixedNote(session: EditorSession): string | null {
  const result = useResults((s) => s.result);
  const made = useResults((s) => s.inputs);
  const { origin, design, inputs } = session;
  return useMemo(() => {
    if (origin.kind === 'saved' || !made) return null;
    const ranked =
      origin.kind === 'calculated'
        ? result?.layouts.find((r) => r.layout.id === origin.layoutId)
        : result?.layouts[0];
    if (!ranked || !mixesLayerPatterns(ranked.layout)) return null;
    const spec = specFromLayout(ranked.layout, made, 'draft', '');
    // A carton designed since is another carton: the note is about the copy as it started.
    if (!spec || JSON.stringify(spec.design) !== JSON.stringify(design)) return null;
    const started = buildManualLayout(spec, inputs).layout.totalProducts;
    const calculated = ranked.layout.totalProducts;
    return started === calculated
      ? 'This result mixes layer patterns. Editing by hand starts from its bottom layer.'
      : `This result mixes layer patterns. Editing by hand starts from its bottom layer: ${fmtCount(started)} boxes instead of ${fmtCount(calculated)}.`;
  }, [origin, design, inputs, result, made]);
}

/**
 * The note, on both steps while it applies: a layout saved straight from the Carton step is
 * the same stack of the bottom layer, and must not hold fewer boxes unexplained.
 */
export function MixedNote({ session }: { session: EditorSession }) {
  const mixed = useMixedNote(session);
  if (!mixed) return null;
  return (
    <p data-testid="mixed-note" className={NOTE_BOX}>
      {mixed}
    </p>
  );
}
