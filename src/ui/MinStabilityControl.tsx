import { useId, useRef, type KeyboardEvent } from 'react';
import type { MinStability } from '../domain/types';
import { MIN_STABILITY_LABEL, MIN_STABILITY_OPTIONS } from './minStability';
import { useInputs } from './StoreContext';

interface MinStabilityFieldsProps {
  value: MinStability;
  onChange(m: MinStability): void;
}

const HINT: Record<MinStability, string> = {
  auto: 'The layout with the most boxes comes first, whatever its rating.',
  fair: 'Layouts rated Poor are left out.',
  good: 'Layouts rated Fair or Poor are left out.',
};

/**
 * "Minimum stability": Auto, Fair or better, Good only, as one row of radio buttons. Arrow
 * keys move the choice, as in a native radio group.
 */
export function MinStabilityFields({ value, onChange }: MinStabilityFieldsProps) {
  const labelId = useId();
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = MIN_STABILITY_OPTIONS.length;

  const choose = (index: number) => {
    const k = (index + count) % count;
    const option = MIN_STABILITY_OPTIONS[k];
    if (!option) return;
    onChange(option);
    refs.current[k]?.focus();
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
    <div>
      <p id={labelId} className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">
        Minimum stability
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="inline-flex border border-gray-300 dark:border-harbor-foam"
      >
        {MIN_STABILITY_OPTIONS.map((option, k) => {
          const selected = option === value;
          return (
            <button
              key={option}
              ref={(el) => {
                refs.current[k] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(k)}
              onKeyDown={(e) => onKeyDown(e, k)}
              className={`focus-ticks whitespace-nowrap px-2.5 py-1 text-sm ${
                k > 0 ? 'border-l border-gray-300 dark:border-harbor-foam' : ''
              } ${
                selected
                  ? 'bg-blue-600 text-white dark:bg-harbor-teal-fill dark:text-harbor-foam'
                  : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline'
              }`}
            >
              {MIN_STABILITY_LABEL[option]}
            </button>
          );
        })}
      </div>
      <p id={hintId} className="mt-1 text-xs text-gray-600 dark:text-harbor-mist">
        {HINT[value]}
      </p>
    </div>
  );
}

/** The minimum stability of the inputs being edited in the workspace (Full view only). */
export function MinStabilityControl() {
  const value = useInputs((s) => s.draft.minStability);
  const setMinStability = useInputs((s) => s.setMinStability);
  return <MinStabilityFields value={value} onChange={setMinStability} />;
}
