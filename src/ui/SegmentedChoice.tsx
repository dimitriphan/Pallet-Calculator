import { useId, useRef, type KeyboardEvent } from 'react';

interface SegmentedChoiceProps<T extends string> {
  /** The group's visible name, and its accessible name. */
  label: string;
  /** The choices, in the order they are offered. */
  options: readonly T[];
  labels: Record<T, string>;
  /** One line under the row saying what the chosen option does. */
  hints: Record<T, string>;
  value: T;
  onChange(value: T): void;
}

/**
 * A setting with a few named choices, as one row of radio buttons with a line of explanation
 * under it. Arrow keys move the choice, as in a native radio group, and Home and End choose
 * the first and last; only the chosen button is in the tab order.
 */
export function SegmentedChoice<T extends string>({
  label,
  options,
  labels,
  hints,
  value,
  onChange,
}: SegmentedChoiceProps<T>) {
  const labelId = useId();
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length;

  const choose = (index: number) => {
    const k = (index + count) % count;
    const option = options[k];
    if (!option) return;
    // Choosing what is already chosen changes nothing, so nothing is reported.
    if (option !== value) onChange(option);
    refs.current[k]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      choose(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      choose(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      choose(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      choose(count - 1);
    }
  };

  return (
    <div>
      <p id={labelId} className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="inline-flex border border-gray-300 dark:border-harbor-foam"
      >
        {options.map((option, k) => {
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
              {labels[option]}
            </button>
          );
        })}
      </div>
      <p id={hintId} className="mt-1 text-xs text-gray-600 dark:text-harbor-mist">
        {hints[value]}
      </p>
    </div>
  );
}
