import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { layoutWeight } from '../engine/analytics/weight';
import type { ManualEntry } from '../store/manualLayoutsStore';
import { sameInputs } from '../store/resultsStore';
import { ConfirmDialog } from './editor/ConfirmDialog';
import { ERROR_BOX, NOTE_BOX } from './editor/styles';
import { DESIGN_OWN_ID, useEditorEntry } from './editor/useEditorEntry';
import { dimsText, fmtCount, weightText } from './format';
import { differenceText } from './manualDifference';
import { flagLines } from './manualFlags';
import { BelowMinimumBadge } from './MinimumNotes';
import { isBelowMinimum } from './minStability';
import { BUTTON } from './ModalDialog';
import { StabilityBadge } from './StabilityBadge';
import { useManualLayouts, useResults, useStores } from './StoreContext';
import { useUnit } from './useUnit';

/** Marks a layout the user made by hand, wherever one is listed or shown. */
export function ManualBadge({
  className = 'px-1.5 text-[11px] leading-4',
}: {
  className?: string;
}) {
  return (
    <span
      className={`whitespace-nowrap bg-gray-800 text-white dark:border dark:border-harbor-foam dark:bg-harbor-deep dark:text-harbor-foam ${className}`}
    >
      Manual
    </span>
  );
}

/** Marks a manual layout whose carton no longer applies (spec 6.6). Sand: a caution, no error. */
export function OutOfDateBadge({
  className = 'px-1.5 text-[11px] leading-4',
}: {
  className?: string;
}) {
  return (
    <span
      className={`whitespace-nowrap bg-amber-100 text-amber-900 dark:bg-harbor-sand dark:text-harbor-deep ${className}`}
    >
      Out of date
    </span>
  );
}

/**
 * The boxes of the best calculated layout, to compare a manual layout with; null when there is
 * no calculated layout or it is not for the inputs on screen (stale, or being recalculated).
 */
export function useBestCalculated(): number | null {
  const best = useResults((s) => s.result?.layouts[0]?.layout.totalProducts ?? null);
  const behind = useResults((s) => s.stale || s.status === 'running' || s.status === 'error');
  const made = useResults((s) => s.inputs);
  const current = useManualLayouts((m) => m.inputs);
  const invalid = useManualLayouts((m) => m.stale);
  if (best === null || behind || invalid || !made || !current || !sameInputs(made, current))
    return null;
  return best;
}

/** "Made for a product of 12 × 8 × 4 in": the inputs an out-of-date layout was made for. */
export function madeForText(entry: ManualEntry, unit: ReturnType<typeof useUnit>): string {
  return `Made for a product of ${dimsText(entry.spec.madeFor.product, unit)}`;
}

const selectId = (id: string) => `your-layout-${id}`;
const SMALL = `${BUTTON} !px-2 !py-0.5 text-xs`;
const REASON_ID = 'your-layouts-reason';

/** What a row asks to have the focus once the list has been drawn again. */
type FocusAfter = { id: string; part: 'select' | 'rename' | 'fallback' } | null;

/**
 * "Your layouts" (spec 6.4): the manual layouts the user has saved, above the calculated
 * results. They are not ranked against the calculated layouts; each says how its boxes compare
 * with the best of them. Nothing is shown when there are none. `compact` is Basic view's
 * list: a saved layout can be selected, looked at and printed there, not changed.
 */
export function YourLayouts({ compact = false }: { compact?: boolean }) {
  const entries = useManualLayouts((m) => m.entries);
  const { manualLayouts, results } = useStores();
  const selectedId = useResults((s) => s.selectedManualId);
  const best = useBestCalculated();
  const entry = useEditorEntry();
  const unit = useUnit();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const focusAfter = useRef<FocusAfter>(null);

  // After an action redraws the list, the focus goes where the user would look next.
  useEffect(() => {
    const want = focusAfter.current;
    if (!want || deleting !== null) return;
    focusAfter.current = null;
    const el =
      want.part === 'fallback'
        ? document.getElementById(DESIGN_OWN_ID)
        : want.part === 'rename'
          ? document.getElementById(`${selectId(want.id)}-rename`)
          : document.getElementById(selectId(want.id));
    el?.focus();
  });

  if (entries.length === 0) return null;

  const select = (id: string) => results.getState().selectManual(id);
  const editOff = entry.blocked !== null;
  const rebuildOff = entry.blockedCalculated !== null;

  const finishRename = (id: string, name: string | null) => {
    if (name !== null && name.trim() !== '') manualLayouts.getState().rename(id, name);
    setRenaming(null);
    focusAfter.current = { id, part: 'rename' };
  };
  const duplicate = (id: string) => {
    const copy = manualLayouts.getState().duplicate(id);
    if (copy) focusAfter.current = { id: copy.id, part: 'select' };
  };
  const remove = (id: string) => {
    const at = entries.findIndex((e) => e.spec.id === id);
    const next = entries[at + 1] ?? entries[at - 1];
    setDeleting(null);
    if (manualLayouts.getState().remove(id))
      focusAfter.current = next ? { id: next.spec.id, part: 'select' } : { id, part: 'fallback' };
    else focusAfter.current = { id, part: 'select' };
  };
  const toDelete = entries.find((e) => e.spec.id === deleting);

  return (
    <section
      aria-labelledby="your-layouts-heading"
      data-testid="your-layouts"
      className="min-w-0 shrink-0 space-y-2"
    >
      <h2 id="your-layouts-heading" className="heading text-sm text-gray-900 dark:text-harbor-foam">
        Your layouts
      </h2>
      {!compact && (editOff || rebuildOff) && (
        <p id={REASON_ID} className="text-xs text-gray-600 dark:text-harbor-mist">
          {entry.blocked ?? entry.blockedCalculated}
        </p>
      )}
      {/* role="list" keeps list semantics in Safari, which drops them with list-style none. */}
      <ul
        role="list"
        className="divide-y divide-gray-200 border border-gray-200 bg-white dark:divide-harbor-foam/40 dark:border-harbor-foam/40 dark:bg-harbor-panel"
      >
        {entries.map((e) => {
          const { spec, build } = e;
          const { layout } = build;
          const selected = spec.id === selectedId;
          const outOfDate = build.status === 'outOfDate';
          const weight = layoutWeight(layout, build.inputs);
          const lines = flagLines(build.flags, unit);
          const below = isBelowMinimum(layout.stability?.rating, build.inputs.minStability);
          const difference =
            best === null || outOfDate ? null : differenceText(layout.totalProducts, best);
          const figures = [
            `${fmtCount(layout.totalProducts)} ${layout.totalProducts === 1 ? 'box' : 'boxes'}`,
            `${fmtCount(layout.totalCartons)} ${layout.totalCartons === 1 ? 'carton' : 'cartons'}`,
            `${fmtCount(layout.layers.length)} ${layout.layers.length === 1 ? 'layer' : 'layers'}`,
            ...(weight ? [weightText(weight.total, unit)] : []),
          ];
          return (
            <li
              key={spec.id}
              data-testid="your-layout"
              data-status={build.status}
              data-selected={selected ? 'true' : undefined}
              className={`min-w-0 space-y-1.5 px-2 py-2 dark:border-l-[3px] ${
                selected
                  ? 'bg-blue-50 text-blue-950 dark:border-l-harbor-green dark:bg-harbor-raised dark:text-harbor-foam'
                  : 'dark:border-l-transparent dark:text-harbor-foam'
              }`}
            >
              {renaming === spec.id ? (
                <RenameField initial={spec.name} onDone={(name) => finishRename(spec.id, name)} />
              ) : (
                <button
                  type="button"
                  id={selectId(spec.id)}
                  aria-pressed={selected}
                  aria-label={`Show your layout ${spec.name}`}
                  onClick={() => select(spec.id)}
                  className="focus-ticks block w-full min-w-0 cursor-pointer space-y-1 text-left hover:underline"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`min-w-0 break-words text-sm font-semibold ${
                        // Greyed, but still 4.5:1 on every surface it can stand on.
                        outOfDate ? 'text-gray-600 dark:text-harbor-mist' : ''
                      }`}
                    >
                      {spec.name}
                    </span>
                    <ManualBadge />
                    {outOfDate && <OutOfDateBadge />}
                    {!outOfDate && <StabilityBadge stability={layout.stability} />}
                    {!outOfDate && below && <BelowMinimumBadge />}
                  </span>
                  <span
                    className={`block text-sm tabular-nums ${
                      outOfDate ? 'text-gray-600 dark:text-harbor-mist' : ''
                    }`}
                  >
                    {figures.join(' · ')}
                  </span>
                  {difference && (
                    <span
                      data-testid="difference"
                      className="block text-xs tabular-nums text-gray-700 dark:text-harbor-mist"
                    >
                      {difference}
                    </span>
                  )}
                  {outOfDate && (
                    <span
                      data-testid="made-for"
                      className="block text-xs tabular-nums text-gray-700 dark:text-harbor-mist"
                    >
                      {`${madeForText(e, unit)}. The inputs have changed since.`}
                    </span>
                  )}
                </button>
              )}
              {!outOfDate && lines.length > 0 && (
                <ul role="list" aria-label={`Flags of ${spec.name}`} className="space-y-1">
                  {lines.map((line) => (
                    <li
                      key={line.key}
                      data-flag={line.key}
                      data-tone={line.tone}
                      className={`${line.tone === 'error' ? ERROR_BOX : NOTE_BOX} !py-1 !text-xs`}
                    >
                      {line.text}
                    </li>
                  ))}
                </ul>
              )}
              {!compact && renaming !== spec.id && (
                <div
                  role="group"
                  aria-label={`Actions for ${spec.name}`}
                  className="flex flex-wrap gap-1.5"
                >
                  {outOfDate ? (
                    <>
                      <button
                        type="button"
                        disabled={rebuildOff}
                        aria-describedby={rebuildOff ? REASON_ID : undefined}
                        title={entry.blockedCalculated ?? undefined}
                        onClick={() => entry.rebuild(spec.id)}
                        aria-label={`Rebuild ${spec.name}`}
                        className={SMALL}
                      >
                        Rebuild
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(spec.id)}
                        aria-label={`Discard ${spec.name}`}
                        className={SMALL}
                      >
                        Discard
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={editOff}
                        aria-describedby={editOff ? REASON_ID : undefined}
                        title={entry.blocked ?? undefined}
                        onClick={() => entry.openSaved(spec.id)}
                        aria-label={`Edit ${spec.name}`}
                        className={SMALL}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        id={`${selectId(spec.id)}-rename`}
                        onClick={() => setRenaming(spec.id)}
                        aria-label={`Rename ${spec.name}`}
                        className={SMALL}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicate(spec.id)}
                        aria-label={`Duplicate ${spec.name}`}
                        className={SMALL}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(spec.id)}
                        aria-label={`Delete ${spec.name}`}
                        className={SMALL}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {toDelete && (
        <ConfirmDialog
          title={
            toDelete.build.status === 'outOfDate' ? 'Discard this layout?' : 'Delete this layout?'
          }
          confirm={toDelete.build.status === 'outOfDate' ? 'Discard layout' : 'Delete layout'}
          keep="Keep it"
          onKeep={() => {
            focusAfter.current = { id: toDelete.spec.id, part: 'select' };
            setDeleting(null);
          }}
          onConfirm={() => remove(toDelete.spec.id)}
        >
          <p>{`“${toDelete.spec.name}” will be removed from your layouts. This cannot be undone.`}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** The name typed in place: Enter (or leaving the field) keeps it, Escape puts the old one back. */
function RenameField({ initial, onDone }: { initial: string; onDone(name: string | null): void }) {
  const [name, setName] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(name);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(null);
    }
  };
  return (
    <div className="space-y-0.5">
      <div className="focus-ticks-within flex border border-gray-300 bg-white dark:border-harbor-foam dark:bg-harbor-raised">
        <input
          ref={field}
          type="text"
          aria-label={`New name for ${initial}`}
          autoComplete="off"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(name)}
          className="w-full min-w-0 bg-transparent px-2 py-1 text-sm text-gray-900 focus:outline-none dark:text-harbor-foam"
        />
      </div>
      <p className="text-xs text-gray-600 dark:text-harbor-mist">
        Enter saves the name. Escape keeps the old one.
      </p>
    </div>
  );
}
