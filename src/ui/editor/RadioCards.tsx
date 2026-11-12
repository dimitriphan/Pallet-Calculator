import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface RadioCard<T extends string> {
  value: T;
  /** The choice's name. */
  label: string;
  /** The accessible name, when it says more than the visible name and detail do. */
  ariaLabel?: string;
  /** What choosing it gives, under the name. */
  detail?: ReactNode;
  disabled?: boolean;
}

interface RadioCardsProps<T extends string> {
  /** Id of the element that names the group. */
  labelledBy: string;
  /** Id of text that describes the group, e.g. why choices are disabled. */
  describedBy?: string;
  options: readonly RadioCard<T>[];
  value: T;
  onChange(value: T): void;
  /** Tailwind classes laying the cards out; one column by default. */
  layout?: string;
}

/**
 * A few named choices as a radio group of large buttons. Arrow keys move the choice among the
 * enabled ones, as in a native radio group; only the chosen button is in the tab order.
 */
export function RadioCards<T extends string>({
  labelledBy,
  describedBy,
  options,
  value,
  onChange,
  layout = 'grid grid-cols-1 gap-1.5',
}: RadioCardsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, by: number) => {
    for (let n = 1; n <= options.length; n++) {
      const k = (from + by * n + options.length * n) % options.length;
      const option = options[k];
      if (option && !option.disabled) {
        onChange(option.value);
        refs.current[k]?.focus();
        return;
      }
    }
  };
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    }
  };
  // With no enabled choice chosen, the first enabled one takes the tab stop.
  const tabStop = options.some((o) => o.value === value && !o.disabled)
    ? value
    : options.find((o) => !o.disabled)?.value;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={layout}
    >
      {options.map((option, k) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={option.value === tabStop ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, k)}
            className={`focus-ticks flex min-h-[44px] flex-col items-start justify-center border px-2.5 py-1.5 text-left text-sm disabled:cursor-not-allowed ${
              checked
                ? 'border-blue-700 bg-blue-600 text-white dark:border-harbor-foam dark:bg-harbor-teal-fill dark:text-harbor-foam'
                : 'border-gray-300 bg-white text-gray-800 enabled:hover:bg-gray-50 disabled:text-gray-500 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:enabled:hover:bg-harbor-raised dark:enabled:hover:underline dark:disabled:border-dashed dark:disabled:text-harbor-mist'
            }`}
          >
            <span>{option.label}</span>
            {option.detail && <span className="text-xs tabular-nums">{option.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
