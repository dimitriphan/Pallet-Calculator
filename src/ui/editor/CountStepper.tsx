import { useId, useState } from 'react';
import { fmtCount } from '../format';
import { EDITOR_BUTTON } from './styles';

/** The most boxes along one side of a carton that can be asked for here. */
export const MAX_COUNT = 99;

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
  // What is being typed, while it differs from the value (blank, or not yet a valid count).
  const [draft, setDraft] = useState<string | null>(null);
  const type = (text: string) => {
    setDraft(text);
    if (!/^\d+$/.test(text.trim())) return;
    const n = Number(text.trim());
    if (n >= 1 && n <= MAX_COUNT) onChange(n);
  };
  const step = (by: number) => {
    setDraft(null);
    onChange(Math.min(MAX_COUNT, Math.max(1, value + by)));
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm text-gray-800 dark:text-harbor-foam">
        {label}
      </label>
      <div className="flex shrink-0 items-stretch">
        <button
          type="button"
          aria-label={`One fewer: ${what}`}
          disabled={value <= 1}
          onClick={() => step(-1)}
          className={`${EDITOR_BUTTON} text-lg leading-none`}
        >
          −
        </button>
        <div className="focus-ticks-within -mx-px flex w-14 border border-gray-300 bg-white dark:border-harbor-foam dark:bg-harbor-raised">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft ?? fmtCount(value)}
            onChange={(e) => type(e.target.value)}
            onBlur={() => setDraft(null)}
            onFocus={(e) => e.target.select()}
            className="w-full min-w-0 bg-transparent px-1 text-center text-base tabular-nums text-gray-900 focus:outline-none dark:text-harbor-foam"
          />
        </div>
        <button
          type="button"
          aria-label={`One more: ${what}`}
          disabled={value >= MAX_COUNT}
          onClick={() => step(1)}
          className={`${EDITOR_BUTTON} text-lg leading-none`}
        >
          +
        </button>
      </div>
    </div>
  );
}
