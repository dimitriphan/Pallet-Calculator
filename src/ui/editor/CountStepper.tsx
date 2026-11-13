import { useId, useRef, useState } from 'react';
import { fmtCount } from '../format';
import { useFocusHandOff } from '../useFocusHandOff';
import { EDITOR_BUTTON } from './styles';

/** The most boxes along one side of a carton that can be asked for here. */
export const MAX_COUNT = 99;

/** What a typed count that cannot be used is answered with; the count in use follows it. */
export const COUNT_INVALID = `Enter a whole number from ${fmtCount(1)} to ${fmtCount(MAX_COUNT)}.`;

/** The count a typed text gives, or null when it is not a whole number from 1 to MAX_COUNT. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MAX_COUNT ? n : null;
}

interface CountStepperProps {
  /** The visible label, and the typed field's accessible name. */
  label: string;
  /** What the minus and plus buttons change, for their names: "boxes along the carton's length". */
  what: string;
  value: number;
  onChange(value: number): void;
}

/** A whole number from 1 up, with minus and plus buttons and a field to type it in. */
export function CountStepper({ label, what, value, onChange }: CountStepperProps) {
  const id = useId();
  // What is being typed, while it differs from the value (blank, or not a valid count). It is
  // kept, with the message, until it is put right or a button is used: never dropped silently.
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const invalid = draft !== null && parseCount(draft) === null;
  const type = (text: string) => {
    const n = parseCount(text);
    setDraft(n !== null && fmtCount(n) === text ? null : text);
    if (n !== null) onChange(n);
  };
  const step = (by: number) => {
    setDraft(null);
    onChange(Math.min(MAX_COUNT, Math.max(1, value + by)));
  };
  const fewer = useFocusHandOff(value <= 1, () => [field.current]);
  const more = useFocusHandOff(value >= MAX_COUNT, () => [field.current]);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm text-gray-800 dark:text-harbor-foam">
          {label}
        </label>
        <div className="flex shrink-0 items-stretch">
          <button
            type="button"
            {...fewer}
            aria-label={`One fewer: ${what}`}
            disabled={value <= 1}
            onClick={() => step(-1)}
            className={`${EDITOR_BUTTON} text-lg leading-none`}
          >
            −
          </button>
          <div
            className={`focus-ticks-within -mx-px flex w-14 border bg-white dark:bg-harbor-raised ${
              invalid
                ? 'border-red-600 dark:border-harbor-coral'
                : 'border-gray-300 dark:border-harbor-foam'
            }`}
          >
            <input
              ref={field}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft ?? fmtCount(value)}
              aria-invalid={invalid ? 'true' : undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={(e) => type(e.target.value)}
              // A valid count typed loosely (" 3 ") is tidied on leaving; a wrong one stays.
              onBlur={() => setDraft((d) => (d !== null && parseCount(d) !== null ? null : d))}
              onFocus={(e) => e.target.select()}
              className="w-full min-w-0 bg-transparent px-1 text-center text-base tabular-nums text-gray-900 focus:outline-none dark:text-harbor-foam"
            />
          </div>
          <button
            type="button"
            {...more}
            aria-label={`One more: ${what}`}
            disabled={value >= MAX_COUNT}
            onClick={() => step(1)}
            className={`${EDITOR_BUTTON} text-lg leading-none`}
          >
            +
          </button>
        </div>
      </div>
      {invalid && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-right text-xs tabular-nums text-red-800 dark:text-harbor-coral-text"
        >
          {`${COUNT_INVALID} Using ${fmtCount(value)}.`}
        </p>
      )}
    </div>
  );
}
