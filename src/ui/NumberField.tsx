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
      <label
        htmlFor={id}
        className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      <div
        className={`flex items-center rounded border bg-white focus-within:ring-2 dark:bg-gray-800 ${
          error
            ? 'border-red-500 focus-within:ring-red-200 dark:border-red-400 dark:focus-within:ring-red-900'
            : 'border-gray-300 focus-within:border-blue-600 focus-within:ring-blue-200 dark:border-gray-600 dark:focus-within:border-blue-400 dark:focus-within:ring-blue-800'
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
          className="w-full min-w-0 rounded bg-transparent px-2 py-1 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-400"
        />
        <span className="pr-2 text-xs text-gray-500 dark:text-gray-400" aria-hidden="true">
          {suffix}
        </span>
      </div>
      {error && (
        <p id={errorId} className="mt-0.5 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          {hint}
        </div>
      )}
    </div>
  );
}
