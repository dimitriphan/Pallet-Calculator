import { useRef, type KeyboardEvent } from 'react';
import type { ViewMode } from '../store/prefsStore';
import { usePrefs, useStores } from './StoreContext';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'full', label: 'Full' },
];

const radioId = (mode: ViewMode) => `view-mode-${mode}`;

/**
 * Moves focus to one of the view radios; for controls that unmount themselves by switching
 * the view, so keyboard users are not dropped at the top of the page.
 */
export function focusViewModeRadio(mode: ViewMode): void {
  document.getElementById(radioId(mode))?.focus();
}

/** Basic / Full radio pair. */
export function ViewModeSwitch() {
  const { prefs } = useStores();
  const viewMode = usePrefs((s) => s.viewMode);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (index: number) => {
    const mode = MODES[(index + MODES.length) % MODES.length];
    if (!mode) return;
    prefs.getState().setViewMode(mode.value);
    refs.current[(index + MODES.length) % MODES.length]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      choose(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      choose(index - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="inline-flex border border-gray-300 dark:border-harbor-foam"
    >
      {MODES.map((m, i) => {
        const selected = m.value === viewMode;
        return (
          <button
            key={m.value}
            id={radioId(m.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => choose(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-harbor-teal-text ${
              selected
                ? 'bg-blue-600 text-white dark:bg-harbor-teal-fill dark:text-harbor-foam'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
