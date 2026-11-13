import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { EditorResult, EditorSession, EditorStep } from '../../store/manualEditorStore';
import { NOT_SAVED } from '../../persistence/localStorageRepository';
import { cannotSaveText } from '../manualFlags';
import { useManualEditor } from '../StoreContext';
import { useFocusHandOff } from '../useFocusHandOff';
import { useUnit } from '../useUnit';
import { ConfirmDialog } from './ConfirmDialog';
import { EDITOR_PANEL_ID, STEP_ORDER, STEPS, stepTabId } from './steps';
import { EDITOR_BUTTON, EDITOR_PRIMARY, NOTE_BOX } from './styles';

export const REPLACE_LAYER_QUESTION =
  "Replace your hand-edited layer with the tool's best layer for this carton?";

export const CARTON_BLOCKED_NOTE =
  'The carton cannot go on the pallet as it is, so the pallet layer and Save are unavailable.';

/** Why the inputs took the session back to the Carton step (see `EditorSession.stepNotice`). */
export const STEP_NOTICES = {
  cartonBlocked:
    'The inputs changed and this carton can no longer go on the pallet, so you are back at the Carton step. Change the carton or the inputs to go on.',
  cartonChanged:
    'The inputs changed the size of this carton, so you are back at the Carton step. Going on to the pallet layer loads the tool’s best layer for it.',
} as const;

export const USING_LAST_VALID =
  'An input has a mistake. The editor is using the last valid inputs until it is fixed.';

/** Said when Save finds the saved layout changed, or gone, since the editor opened on it. */
export const CHANGED_ELSEWHERE = {
  changed: 'This layout was changed in another tab.',
  deleted: 'This layout was deleted in another tab. Save it again?',
} as const;
export const CHANGED_ELSEWHERE_CHOICE =
  'Save as new keeps both. Overwrite saves your version in its place.';

/** What was asked for when the store answered that the hand-edited layer would be replaced. */
type Pending = 'layer' | 'save' | 'saveAsNew';

interface EditorBarProps {
  session: EditorSession;
  /** Shows or hides the inputs column where there is no room for it beside the editor. */
  inputsToggle?: { shown: boolean; toggle(): void };
}

/**
 * The editor's bar, in place of the 3D view's toolbar while a layout is edited by hand: that
 * this is editing, the two steps, the layout's name, Undo and Redo, Save and Cancel, and under
 * them the current step's own tools.
 */
export function EditorBar({ session, inputsToggle }: EditorBarProps) {
  const unit = useUnit();
  const ids = useId();
  const goToStep = useManualEditor((s) => s.goToStep);
  const setName = useManualEditor((s) => s.setName);
  const undo = useManualEditor((s) => s.undo);
  const redo = useManualEditor((s) => s.redo);
  const save = useManualEditor((s) => s.save);
  const saveAsNew = useManualEditor((s) => s.saveAsNew);
  const cancel = useManualEditor((s) => s.cancel);

  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Why the last Save did nothing, when storage refused it; gone at the next attempt.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Save found the layout changed or deleted in another tab: the user chooses what to do.
  const [elsewhere, setElsewhere] = useState<'changed' | 'deleted' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const redoRef = useRef<HTMLButtonElement>(null);
  // The last Undo (or Redo) disables its own button: the focus goes to the other one.
  const undoButton = useFocusHandOff(
    !session.canUndo,
    () => [redoRef.current, heading.current],
    undoRef,
  );
  const redoButton = useFocusHandOff(
    !session.canRedo,
    () => [undoRef.current, heading.current],
    redoRef,
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Opening the editor moves the keyboard user into it.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const blocked = session.cartonFlags.blocked !== null;
  const reason = blocked
    ? CARTON_BLOCKED_NOTE
    : session.canSave
      ? null
      : cannotSaveText(session.build.flags, unit);
  const reasonId = `${ids}reason`;

  // What the user has already agreed to in this attempt to save, kept while a second question
  // (replace the layer, overwrite the other tab's change) is asked.
  const agreed = useRef<{ replace?: boolean; overwrite?: boolean }>({});
  const run = (what: Pending, more: { replace?: boolean; overwrite?: boolean } = {}) => {
    const opts = { ...agreed.current, ...more };
    agreed.current = opts;
    const result: EditorResult<{ id?: string }> =
      what === 'layer' ? goToStep('layer', opts) : what === 'save' ? save(opts) : saveAsNew(opts);
    setSaveError(null);
    setElsewhere(null);
    if (result.ok) {
      agreed.current = {};
      return;
    }
    if (result.reason === 'layerEdited') setPending(what);
    else if (result.reason === 'changedElsewhere') setElsewhere(result.change);
    // Nothing was saved: the editor stays open with the work in it, and says so.
    else if (result.reason === 'notStored') setSaveError(NOT_SAVED);
  };

  /** A fresh attempt, from one of the bar's own buttons: nothing is agreed to yet. */
  const begin = (what: Pending) => {
    agreed.current = {};
    run(what);
  };

  const choose = (step: EditorStep) => {
    if (step === session.step) return;
    if (step === 'carton') goToStep('carton');
    else if (!blocked) begin('layer');
  };

  const onTabKey = (e: KeyboardEvent, index: number) => {
    const last = STEP_ORDER.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % STEP_ORDER.length
        : e.key === 'ArrowLeft'
          ? (index + last) % STEP_ORDER.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    // Focus only: a step is entered with Enter or Space, since entering one can ask a question.
    tabs.current[next]?.focus();
  };

  const onCancel = () => {
    if (session.dirty) setConfirmCancel(true);
    else cancel();
  };

  const Tools = STEPS[session.step].Tools;
  const saved = session.origin.kind === 'saved';

  return (
    <section
      aria-labelledby={`${ids}title`}
      data-testid="editor-bar"
      className="shrink-0 border-b-2 border-blue-700 bg-blue-50 text-gray-900 dark:border-harbor-teal dark:bg-harbor-raised dark:text-harbor-foam"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-2">
        <h2
          ref={heading}
          id={`${ids}title`}
          tabIndex={-1}
          className="heading bg-blue-700 px-2 py-1 text-xs text-white focus:outline-none dark:bg-harbor-teal-fill dark:text-harbor-foam"
        >
          Editing by hand
        </h2>
        <div
          role="tablist"
          aria-label="Editor steps"
          className="flex border border-gray-300 dark:border-harbor-foam"
        >
          {STEP_ORDER.map((step, k) => {
            const active = step === session.step;
            const off = step === 'layer' && blocked;
            return (
              <button
                key={step}
                ref={(el) => {
                  tabs.current[k] = el;
                }}
                type="button"
                role="tab"
                id={stepTabId(step)}
                aria-selected={active}
                aria-controls={active ? EDITOR_PANEL_ID : undefined}
                aria-disabled={off ? 'true' : undefined}
                aria-describedby={off ? reasonId : undefined}
                tabIndex={active ? 0 : -1}
                onClick={() => choose(step)}
                onKeyDown={(e) => onTabKey(e, k)}
                className={`focus-ticks inline-flex min-h-[44px] items-center whitespace-nowrap px-3 text-sm ${
                  k > 0 ? 'border-l border-gray-300 dark:border-harbor-foam' : ''
                } ${
                  active
                    ? 'bg-blue-600 text-white dark:bg-harbor-teal-fill dark:text-harbor-foam'
                    : off
                      ? 'cursor-not-allowed bg-gray-100 text-gray-600 dark:bg-harbor-panel dark:text-harbor-mist'
                      : 'bg-white text-gray-800 hover:bg-gray-50 dark:bg-harbor-panel dark:text-harbor-foam dark:hover:bg-harbor-panel dark:hover:underline'
                }`}
              >
                <span className="mr-1.5 tabular-nums" aria-hidden="true">
                  {k + 1}
                </span>
                {STEPS[step].label}
              </button>
            );
          })}
        </div>
        {inputsToggle && (
          <button
            type="button"
            aria-pressed={inputsToggle.shown}
            onClick={inputsToggle.toggle}
            className={`${EDITOR_BUTTON} ml-auto hidden lg:inline-flex xl:hidden`}
          >
            {inputsToggle.shown ? 'Hide inputs' : 'Show inputs'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 px-3 py-2">
        <div className="min-w-[9rem] flex-1">
          <label
            htmlFor={`${ids}name`}
            className="mb-0.5 block text-xs text-gray-700 dark:text-harbor-mist"
          >
            Layout name
          </label>
          <div className="focus-ticks-within flex border border-gray-300 bg-white dark:border-harbor-foam dark:bg-harbor-panel">
            <input
              id={`${ids}name`}
              type="text"
              autoComplete="off"
              value={session.name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-[42px] w-full min-w-0 bg-transparent px-2 text-sm text-gray-900 focus:outline-none dark:text-harbor-foam"
            />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            {...undoButton}
            disabled={!session.canUndo}
            onClick={() => undo()}
            className={EDITOR_BUTTON}
          >
            Undo
          </button>
          <button
            type="button"
            {...redoButton}
            disabled={!session.canRedo}
            onClick={() => redo()}
            className={EDITOR_BUTTON}
          >
            Redo
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!session.canSave}
            aria-describedby={reason ? reasonId : undefined}
            onClick={() => begin('save')}
            className={EDITOR_PRIMARY}
          >
            Save
          </button>
          {saved && (
            <button
              type="button"
              disabled={!session.canSave}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => begin('saveAsNew')}
              className={EDITOR_BUTTON}
            >
              Save as new
            </button>
          )}
          <button type="button" onClick={onCancel} className={EDITOR_BUTTON}>
            Cancel
          </button>
        </div>
      </div>

      <p
        id={reasonId}
        role="status"
        className="px-3 text-sm text-red-800 empty:hidden dark:text-harbor-coral-text [&:not(:empty)]:pb-2"
      >
        {reason}
      </p>
      {saveError && (
        <p
          role="alert"
          data-testid="save-error"
          className="px-3 pb-2 text-sm text-red-800 dark:text-harbor-coral-text"
        >
          {saveError}
        </p>
      )}
      {elsewhere && (
        <div
          role="alert"
          data-testid="changed-elsewhere"
          className={`mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${NOTE_BOX}`}
        >
          <p className="min-w-[12rem] flex-1">
            {elsewhere === 'changed'
              ? `${CHANGED_ELSEWHERE.changed} ${CHANGED_ELSEWHERE_CHOICE}`
              : CHANGED_ELSEWHERE.deleted}
          </p>
          {elsewhere === 'changed' ? (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => run('saveAsNew')} className={EDITOR_BUTTON}>
                Save as new
              </button>
              <button
                type="button"
                onClick={() => run('save', { overwrite: true })}
                className={EDITOR_BUTTON}
              >
                Overwrite
              </button>
            </div>
          ) : (
            // Nothing is left to keep or to overwrite: saved again, or not.
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => run('save', { overwrite: true })}
                className={EDITOR_BUTTON}
              >
                Save again
              </button>
              <button
                type="button"
                onClick={() => {
                  agreed.current = {};
                  setElsewhere(null);
                }}
                className={EDITOR_BUTTON}
              >
                Not now
              </button>
            </div>
          )}
        </div>
      )}
      {(session.stepNotice || session.usingLastValid) && (
        <div role="status" className="space-y-1.5 px-3 pb-2">
          {session.stepNotice && (
            <p data-testid="step-notice" className={NOTE_BOX}>
              {STEP_NOTICES[session.stepNotice]}
            </p>
          )}
          {session.usingLastValid && (
            <p data-testid="last-valid-note" className={NOTE_BOX}>
              {USING_LAST_VALID}
            </p>
          )}
        </div>
      )}

      {Tools && (
        <div className="border-t border-blue-200 px-3 py-2 dark:border-harbor-foam/40">
          <Tools session={session} />
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Replace the layer?"
          confirm="Replace layer"
          keep="Keep my layer"
          onKeep={() => {
            agreed.current = {};
            setPending(null);
          }}
          onConfirm={() => {
            const what = pending;
            setPending(null);
            run(what, { replace: true });
          }}
        >
          <p>{REPLACE_LAYER_QUESTION}</p>
        </ConfirmDialog>
      )}
      {confirmCancel && (
        <ConfirmDialog
          title="Discard your changes?"
          confirm="Discard changes"
          keep="Keep editing"
          onKeep={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            cancel();
          }}
        >
          <p>What you changed in this layout has not been saved and will be lost.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
