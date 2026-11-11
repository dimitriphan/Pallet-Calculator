import type { InputsDraft, WeightInputs } from '../domain/types';
import { NumberField } from './NumberField';
import { weightLabel } from './format';
import { useInputs } from './StoreContext';
import { useUnit } from './useUnit';

type WeightKey = keyof WeightInputs;

const FIELDS: Record<WeightKey, { label: string; placeholder?: string }> = {
  productBox: { label: 'Weight per product box', placeholder: 'Blank = ignore weight' },
  maxPallet: { label: 'Maximum pallet weight', placeholder: 'Blank = no limit' },
  emptyCarton: { label: 'Empty carton weight' },
  pallet: { label: 'Pallet weight' },
};

/** Basic view shows the first two; Full view all four. */
const BASIC: WeightKey[] = ['productBox', 'maxPallet'];
const FULL: WeightKey[] = ['productBox', 'maxPallet', 'emptyCarton', 'pallet'];
/** A preset holds every weight but the box, which stays with the product. */
export const PRESET_WEIGHTS: WeightKey[] = ['maxPallet', 'emptyCarton', 'pallet'];

interface WeightFieldsetProps {
  fields: WeightKey[];
  values: InputsDraft['weights'];
  errors: Record<string, string>;
  onChange(path: string, value: string): void;
  /** Prefix of the field ids, so two weight groups can be on screen at once. */
  idPrefix?: string;
}

/** The "Weight" group: the chosen weight fields, in pounds or kilograms. */
export function WeightFieldset({
  fields,
  values,
  errors,
  onChange,
  idPrefix = 'field',
}: WeightFieldsetProps) {
  const suffix = weightLabel(useUnit());
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">Weight</legend>
      {fields.map((key) => (
        <NumberField
          key={key}
          id={`${idPrefix}-weights-${key}`}
          label={FIELDS[key].label}
          value={values[key]}
          placeholder={FIELDS[key].placeholder}
          suffix={suffix}
          error={errors[`weights.${key}`]}
          onChange={(v) => onChange(`weights.${key}`, v)}
        />
      ))}
    </fieldset>
  );
}

const NO_ERRORS: Record<string, string> = {};

/** The weight inputs of the inputs panel: two in Basic view, four in Full view. */
export function WeightFields({ full }: { full: boolean }) {
  const values = useInputs((s) => s.draft.weights);
  const errors = useInputs((s) => (s.parsed.ok ? NO_ERRORS : s.parsed.errors));
  const setField = useInputs((s) => s.setField);
  return (
    <WeightFieldset
      fields={full ? FULL : BASIC}
      values={values}
      errors={errors}
      onChange={setField}
    />
  );
}
