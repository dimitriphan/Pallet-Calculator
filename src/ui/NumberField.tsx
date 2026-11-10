import type { ReactNode } from 'react';

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  suffix?: string;
  placeholder?: string;
  /** Help shown under the field and linked to it as a description. */
  hint?: ReactNode;
  /** Id of help text rendered elsewhere that also describes this field. */
  describedBy?: string;
}

/** A decimal text input with a unit suffix, an inline error, and optional help text. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  suffix = 'in',
  placeholder,
  hint,
  describedBy: extraDescription,
}: NumberFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null, extraDescription ?? null]
    .filter(Boolean)
    .join(' ');
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-xs text-gray-700 dark:text-harbor-mist">
        {label}
      </label>
      <div
        className={`focus-ticks-within flex items-center border bg-white dark:bg-harbor-raised ${
          error ? 'field-invalid' : 'border-gray-300 dark:border-harbor-foam'
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent px-2 py-1 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-harbor-foam dark:placeholder:text-harbor-mist"
        />
        <span className="pr-2 text-xs text-gray-500 dark:text-harbor-mist" aria-hidden="true">
          {suffix}
        </span>
      </div>
      {error && (
        <p id={errorId} className="mt-0.5 text-xs text-red-700 dark:text-harbor-coral-text">
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} className="mt-1 text-xs text-gray-600 dark:text-harbor-mist">
          {hint}
        </div>
      )}
    </div>
  );
}
