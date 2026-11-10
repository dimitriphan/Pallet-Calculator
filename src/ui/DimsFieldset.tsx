import type { ReactNode } from 'react';
import type { Dims } from '../domain/types';
import { NumberField } from './NumberField';

const KEYS = ['length', 'width', 'height'] as const satisfies readonly (keyof Dims)[];

interface DimsFieldsetProps {
  legend: string;
  /** Draft group name, e.g. "pallet"; fields are addressed as `${group}.length`. */
  group: 'pallet' | 'product' | 'maxCarton';
  labels: Record<keyof Dims, string>;
  values: Record<keyof Dims, string>;
  errors: Record<string, string>;
  onChange(path: string, value: string): void;
  /** Prefix of the field ids, so two fieldsets for the same group can be on screen at once. */
  idPrefix?: string;
  /** Help shown under the height field. */
  heightHint?: ReactNode;
}

/** Length, width and height of one object, side by side. */
export function DimsFieldset({
  legend,
  group,
  labels,
  values,
  errors,
  onChange,
  idPrefix = 'field',
  heightHint,
}: DimsFieldsetProps) {
  const heightHintId = `${idPrefix}-${group}-height-help`;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <NumberField
            key={key}
            id={`${idPrefix}-${group}-${key}`}
            label={labels[key]}
            value={values[key]}
            error={errors[`${group}.${key}`]}
            onChange={(v) => onChange(`${group}.${key}`, v)}
            describedBy={key === 'height' && heightHint ? heightHintId : undefined}
          />
        ))}
      </div>
      {heightHint && (
        <div id={heightHintId} className="text-xs text-gray-600 dark:text-harbor-mist">
          {heightHint}
        </div>
      )}
    </fieldset>
  );
}
