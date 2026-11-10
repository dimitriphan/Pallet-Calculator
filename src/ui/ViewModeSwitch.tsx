import { useRef, type KeyboardEvent } from 'react';
import type { ViewMode } from '../store/prefsStore';
import { usePrefs, useStores } from './StoreContext';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'full', label: 'Full' },
];

/** Basic / Full radio pair; for now it only stores the preference. */
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
      className="inline-flex rounded border border-gray-300 dark:border-gray-600"
    >
      {MODES.map((m, i) => {
        const selected = m.value === viewMode;
        return (
          <button
            key={m.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => choose(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`px-3 py-1 text-sm first:rounded-l last:rounded-r focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 ${
              selected
                ? 'bg-blue-600 font-medium text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
