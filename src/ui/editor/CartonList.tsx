import { useEffect, useMemo, useRef } from 'react';
import { verticalAxis } from '../../engine/manual/carton';
import { cartonRect } from '../../engine/manual/layer';
import { fromLeftFront, overhanging } from '../../scene/editorGeometry';
import type { EditorSession } from '../../store/manualEditorStore';
import { fmtCount, lengthText, type Unit } from '../format';
import { useUnit } from '../useUnit';
import { handleLayerKey, useLayerActions } from './layerActions';
import { HINT, SECTION_TITLE } from './styles';

/**
 * "Carton 3: 12.50 in from the pallet's left edge, 0.00 in from the pallet's front edge,
 * turned". The distances are from the pallet itself, as the position fields show them.
 */
export function cartonSentence(
  number: number,
  at: { left: number; front: number },
  turned: boolean,
  overhangs: boolean,
  unit: Unit,
): string {
  return [
    `Carton ${fmtCount(number)}: ${lengthText(at.left, unit)} from the pallet's left edge`,
    `${lengthText(at.front, unit)} from the pallet's front edge`,
    ...(turned ? ['turned'] : []),
    ...(overhangs ? ['outside the allowed footprint'] : []),
  ].join(', ');
}

/** The carton whose button is in the tab order: the selected one, else the first. */
const tabStopOf = (selected: number | null) => selected ?? 0;

/**
 * Every carton of the layer as a numbered button that selects it: the way to pick a carton
 * without pointing at the 3D view. Each button's name says where its carton is. One button is
 * in the tab order; [ and ] go to the previous and next carton, and the layer keys work here
 * as they do in the 3D view.
 */
export function CartonList({ session }: { session: EditorSession }) {
  const unit = useUnit();
  const actions = useLayerActions();
  const { cartons, base, usable, pallet, selected } = session;
  const list = useRef<HTMLUListElement>(null);
  const out = useMemo(() => overhanging(cartons, base, usable), [cartons, base, usable]);

  // The focus follows the selection while it is in the list (the bracket keys move both), and
  // stays in the list when a key takes the focused carton away (Delete, undo), so the next
  // key still lands here.
  const keyed = useRef(false);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const inside = el.contains(document.activeElement);
    if (!inside && !keyed.current) return;
    keyed.current = false;
    const want = selected ?? (inside ? null : 0);
    if (want === null) return;
    (el.querySelector<HTMLElement>(`[data-carton="${want}"]`) ?? el).focus();
  }, [selected, cartons]);

  // The selected carton's button is kept in sight inside the list's own scroll (and only
  // there: selecting a carton in the 3D view must not scroll the panel).
  useEffect(() => {
    const el = list.current;
    const button =
      selected === null ? null : el?.querySelector<HTMLElement>(`[data-carton="${selected}"]`);
    if (!el || !button) return;
    const top = button.offsetTop - el.offsetTop;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + button.offsetHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = top + button.offsetHeight - el.clientHeight;
  }, [selected]);

  const tabStop = tabStopOf(selected);
  const current = selected === null ? undefined : cartons[selected];
  return (
    <section className="space-y-1">
      <h3 id="carton-list-title" className={SECTION_TITLE}>
        Cartons in the layer
      </h3>
      {/* role="list" keeps list semantics in Safari, which drops them with list-style none. */}
      <ul
        ref={list}
        role="list"
        aria-labelledby="carton-list-title"
        data-testid="carton-list"
        data-footprint-length={usable.x}
        data-footprint-width={usable.y}
        data-carton-height={session.carton.outer[verticalAxis(session.design)]}
        // Focusable by script only: where the focus rests when the last carton is removed.
        tabIndex={-1}
        onKeyDown={(e) => {
          if (!handleLayerKey(e, actions, selected)) return;
          // Only for what this key changes: a later change from elsewhere is not the list's.
          keyed.current = true;
          setTimeout(() => {
            keyed.current = false;
          }, 0);
        }}
        className="flex max-h-[190px] flex-wrap gap-1 overflow-y-auto p-0.5 focus:outline-none"
      >
        {cartons.map((c, k) => {
          const rect = cartonRect(c, base);
          const pressed = k === selected;
          const outside = out[k] ?? false;
          return (
            <li key={k}>
              <button
                type="button"
                aria-pressed={pressed}
                aria-label={cartonSentence(
                  k + 1,
                  fromLeftFront(c, base, pallet),
                  c.rotated,
                  outside,
                  unit,
                )}
                tabIndex={k === tabStop ? 0 : -1}
                data-carton={k}
                data-x={rect.x}
                data-y={rect.y}
                data-w={rect.w}
                data-h={rect.h}
                data-turned={c.rotated}
                data-outside={outside}
                onClick={() => actions.select(pressed ? null : k)}
                className={`focus-ticks-inset inline-flex h-11 w-11 items-center justify-center border text-sm tabular-nums ${
                  pressed
                    ? 'border-blue-700 bg-blue-600 text-white dark:border-harbor-foam dark:bg-harbor-teal-fill dark:text-harbor-foam'
                    : outside
                      ? 'border-2 border-red-700 bg-white text-red-800 hover:bg-gray-50 dark:border-harbor-coral dark:bg-harbor-raised dark:text-harbor-coral-text dark:hover:underline'
                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:underline'
                }`}
              >
                {fmtCount(k + 1)}
              </button>
            </li>
          );
        })}
      </ul>
      <p className={HINT} data-testid="carton-selected">
        {cartons.length === 0
          ? 'The layer has no cartons. Add one to start.'
          : current && selected !== null
            ? cartonSentence(
                selected + 1,
                fromLeftFront(current, base, pallet),
                current.rotated,
                out[selected] ?? false,
                unit,
              )
            : 'No carton is selected.'}
      </p>
    </section>
  );
}
