import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { UpperLayers } from '../../engine/manual/build';
import type { EditorSession } from '../../store/manualEditorStore';
import { ConfirmDialog } from './ConfirmDialog';
import { NEEDS_SELECTION, useLayerActions, useLayerMessage } from './layerActions';
import { useFocusHandOff } from '../useFocusHandOff';
import { EDITOR_BUTTON } from './styles';

export const UPPER_LAYERS: readonly UpperLayers[] = ['same', 'alternate'];
export const UPPER_LAYERS_LABEL: Record<UpperLayers, string> = {
  same: 'All the same',
  alternate: 'Alternate layers turned',
};

export const RESET_QUESTION =
  'Every carton goes back to where it was when this layer was loaded. Undo brings your layer back.';
const NOTHING_TO_RESET = 'The layer is as it started.';

/**
 * The Pallet layer step's row of tools, in the editor bar above the 3D view (spec 6.2b): add,
 * turn, remove and reset, the snapping switch and what the upper layers do, with the one line
 * that says why something was refused.
 */
export function LayerTools({ session }: { session: EditorSession }) {
  const ids = useId();
  const actions = useLayerActions();
  const message = useLayerMessage((s) => s.text);
  const [confirmReset, setConfirmReset] = useState(false);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const none = session.selected === null;
  const addButton = useRef<HTMLButtonElement>(null);
  // Turn and Remove go off with the selection (Remove takes it away): the focus goes to Add.
  const turnButton = useFocusHandOff(none, () => [addButton.current]);
  const removeButton = useFocusHandOff(none, () => [addButton.current]);
  // After a reset Reset is off, and the dialog cannot hand the focus back to it.
  const wasAsking = useRef(false);
  useEffect(() => {
    if (wasAsking.current && !confirmReset && !session.layerChanged) addButton.current?.focus();
    wasAsking.current = confirmReset;
  }, [confirmReset, session.layerChanged]);
  const reasonId = `${ids}reason`;
  const resetReasonId = `${ids}reset`;

  // What was said goes when the layer next changes, and with the session.
  const { cartons, upperLayers } = session;
  useEffect(() => {
    useLayerMessage.getState().clear();
  }, [cartons, upperLayers]);
  useEffect(() => () => useLayerMessage.getState().clear(), []);

  const chooseUpper = (index: number) => {
    const k = (index + UPPER_LAYERS.length) % UPPER_LAYERS.length;
    const option = UPPER_LAYERS[k];
    if (!option) return;
    actions.setUpperLayers(option);
    radios.current[k]?.focus();
  };
  const onRadioKey = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      chooseUpper(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      chooseUpper(index - 1);
    }
  };

  return (
    <div data-testid="layer-tools" className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div role="group" aria-label="Layer tools" className="flex flex-wrap gap-1.5">
          <button
            ref={addButton}
            type="button"
            onClick={() => actions.add()}
            className={EDITOR_BUTTON}
          >
            Add carton
          </button>
          <button
            type="button"
            {...turnButton}
            disabled={none}
            aria-describedby={none ? reasonId : undefined}
            onClick={() => actions.turn()}
            className={EDITOR_BUTTON}
          >
            Turn 90°
          </button>
          <button
            type="button"
            {...removeButton}
            disabled={none}
            aria-describedby={none ? reasonId : undefined}
            onClick={() => actions.remove()}
            className={EDITOR_BUTTON}
          >
            Remove
          </button>
          <button
            type="button"
            disabled={!session.layerChanged}
            aria-describedby={session.layerChanged ? undefined : resetReasonId}
            title={session.layerChanged ? undefined : NOTHING_TO_RESET}
            onClick={() => setConfirmReset(true)}
            className={EDITOR_BUTTON}
          >
            Reset
          </button>
          <span id={resetReasonId} hidden>
            {NOTHING_TO_RESET}
          </span>
        </div>

        <label className="focus-ticks-within inline-flex min-h-[44px] cursor-pointer items-center gap-2 border border-gray-300 bg-white px-2.5 text-sm text-gray-800 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam">
          <input
            type="checkbox"
            checked={session.snapping}
            onChange={(e) => actions.setSnapping(e.target.checked)}
            className="h-4 w-4 accent-blue-700 dark:accent-harbor-teal"
          />
          Snapping
        </label>

        <div>
          <p id={`${ids}upper`} className="mb-0.5 text-xs text-gray-700 dark:text-harbor-mist">
            Upper layers
          </p>
          <div
            role="radiogroup"
            aria-labelledby={`${ids}upper`}
            className="inline-flex border border-gray-300 dark:border-harbor-foam"
          >
            {UPPER_LAYERS.map((option, k) => {
              const checked = option === session.upperLayers;
              return (
                <button
                  key={option}
                  ref={(el) => {
                    radios.current[k] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => chooseUpper(k)}
                  onKeyDown={(e) => onRadioKey(e, k)}
                  className={`focus-ticks inline-flex min-h-[42px] items-center px-2.5 text-sm ${
                    k > 0 ? 'border-l border-gray-300 dark:border-harbor-foam' : ''
                  } ${
                    checked
                      ? 'bg-blue-600 text-white dark:bg-harbor-teal-fill dark:text-harbor-foam'
                      : 'bg-white text-gray-800 hover:bg-gray-50 dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline'
                  }`}
                >
                  {UPPER_LAYERS_LABEL[option]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Always one line high, so the 3D view below does not jump as a carton is selected. */}
      <div className="flex min-h-5 flex-wrap gap-x-4 gap-y-1 text-sm">
        {none && (
          <p id={reasonId} className="text-gray-700 dark:text-harbor-mist">
            {NEEDS_SELECTION}
          </p>
        )}
        <p
          role="status"
          data-testid="layer-message"
          className="text-red-800 empty:hidden dark:text-harbor-coral-text"
        >
          {message}
        </p>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset the layer?"
          confirm="Reset layer"
          keep="Keep my layer"
          onKeep={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            actions.reset();
          }}
        >
          <p>{RESET_QUESTION}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
