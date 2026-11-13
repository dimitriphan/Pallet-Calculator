import { useId, useState } from 'react';
import { atLeftFront, fromLeftFront } from '../../scene/editorGeometry';
import type { EditorSession } from '../../store/manualEditorStore';
import { fmtCount, formatLength, toInches, unitLabel } from '../format';
import { useManualEditor } from '../StoreContext';
import { useUnit } from '../useUnit';
import { LAYER_MESSAGES } from './layerActions';
import { HINT, SECTION_TITLE } from './styles';

export const NOT_A_NUMBER = 'Enter a number';
export const SELECT_TO_POSITION = 'Select a carton to see and type its position.';

type Edge = 'left' | 'front';
const LABEL: Record<Edge, string> = { left: 'From left edge', front: 'From front edge' };

/**
 * Where the selected carton is: its distances from the left and front edges of the allowed
 * footprint, in the display unit, each in a field that can be typed into. A typed distance is
 * applied on Enter or on leaving the field, exactly as typed (no snapping); one that would put
 * the carton over another is refused and the field goes back.
 */
export function SelectedCarton({ session }: { session: EditorSession }) {
  const unit = useUnit();
  const ids = useId();
  const move = useManualEditor((s) => s.move);
  const { cartons, base, usable, selected } = session;
  const carton = selected === null ? undefined : cartons[selected];
  // What is being typed, and the carton and place it was typed for: a draft for another
  // carton, or for a place the carton has since left, is dropped.
  const at = carton ? fromLeftFront(carton, base, usable) : null;
  const where = carton ? `${selected}:${carton.x}:${carton.y}:${carton.rotated}` : '';
  const [draft, setDraft] = useState<{ where: string; edge: Edge; text: string } | null>(null);
  const [error, setError] = useState<{ where: string; text: string } | null>(null);
  const shownError = error && error.where === where ? error.text : null;
  const errorId = `${ids}error`;
  const hintId = `${ids}hint`;

  const shown = (edge: Edge) => (at ? formatLength(at[edge], unit) : '');
  const text = (edge: Edge) =>
    draft && draft.where === where && draft.edge === edge ? draft.text : shown(edge);

  const apply = (edge: Edge) => {
    if (!carton || !at || selected === null || !draft || draft.where !== where) return;
    if (draft.edge !== edge) return;
    setDraft(null);
    // Left as it was shown: the place is kept exactly, not cut to the digits the field shows.
    if (draft.text.trim() === shown(edge)) return;
    // A distance may be negative: the carton then lies outside the footprint, and is flagged.
    const typed = draft.text.trim().replace(',', '.');
    const value = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(typed) ? Number(typed) : NaN;
    if (!Number.isFinite(value)) {
      setError({ where, text: NOT_A_NUMBER });
      return;
    }
    const to = atLeftFront(carton, base, usable, { ...at, [edge]: toInches(value, unit) });
    const result = move(selected, to, { snap: false });
    setError(
      result.ok
        ? null
        : { where, text: result.reason === 'overlap' ? LAYER_MESSAGES.overlap : NOT_A_NUMBER },
    );
  };

  return (
    <section className="space-y-1" data-testid="selected-carton">
      <h3 className={SECTION_TITLE}>
        {carton && selected !== null
          ? `Carton ${fmtCount(selected + 1)} of ${fmtCount(cartons.length)}${carton.rotated ? ', turned' : ''}`
          : 'Selected carton'}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {(['left', 'front'] as const).map((edge) => (
          <div key={edge}>
            <label
              htmlFor={`${ids}${edge}`}
              className="mb-0.5 block text-xs text-gray-700 dark:text-harbor-mist"
            >
              {LABEL[edge]}
            </label>
            <div
              className={`focus-ticks-within flex items-center border ${
                carton
                  ? 'border-gray-300 bg-white dark:border-harbor-foam dark:bg-harbor-raised'
                  : 'border-gray-200 bg-gray-50 dark:border-dashed dark:border-harbor-foam dark:bg-harbor-panel'
              }`}
            >
              <input
                id={`${ids}${edge}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={!carton}
                value={text(edge)}
                aria-invalid={shownError ? 'true' : 'false'}
                aria-describedby={carton ? (shownError ? errorId : undefined) : hintId}
                onChange={(e) => {
                  setError(null);
                  setDraft({ where, edge, text: e.target.value });
                }}
                onBlur={() => apply(edge)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') apply(edge);
                  else if (e.key === 'Escape' && draft) {
                    // Only the typing is given up; the editor's own Escape is not wanted here.
                    e.stopPropagation();
                    setDraft(null);
                  }
                }}
                onFocus={(e) => e.target.select()}
                className="min-h-[42px] w-full min-w-0 bg-transparent px-2 text-base tabular-nums text-gray-900 focus:outline-none disabled:cursor-not-allowed dark:text-harbor-foam"
              />
              <span className="pr-2 text-xs text-gray-600 dark:text-harbor-mist" aria-hidden="true">
                {unitLabel(unit)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!carton && (
        <p id={hintId} className={HINT}>
          {SELECT_TO_POSITION}
        </p>
      )}
      <p
        id={errorId}
        role="status"
        data-testid="position-message"
        className="text-sm text-red-800 empty:hidden dark:text-harbor-coral-text"
      >
        {shownError}
      </p>
    </section>
  );
}
