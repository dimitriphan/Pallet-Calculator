import { useId, useState } from 'react';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { MinStability, OrientationCode, Preset, RotationMode } from '../domain/types';
import { presetToInputs } from '../store/presetsStore';
import {
  draftInUnit,
  isNumericPath,
  NUMERIC_FIELDS,
  parseInUnit,
  typedOrigin,
  withDraftText,
} from '../store/unitFields';
import { DimsFieldset } from './DimsFieldset';
import { useUnit } from './useUnit';
import { MinStabilityFields } from './MinStabilityControl';
import { BUTTON, PRIMARY_BUTTON } from './ModalDialog';
import { NumberField } from './NumberField';
import { presetFieldsOf } from './presetFields';
import { RotationFields } from './RotationControl';
import { PRESET_WEIGHTS, WeightFieldset } from './WeightFields';

const DIM_LABELS = { length: 'Length', width: 'Width', height: 'Height' };
const MAX_LABELS = { length: 'Max length', width: 'Max width', height: 'Max height' };
const PREFIX = 'preset-edit';
const NO_ERRORS: Record<string, string> = {};
/**
 * The inputs a preset is edited against: the default product and a stand-in box weight, so a
 * preset's maximum validates without one (presets never store the box weight).
 */
const FORM_BASE = {
  ...DEFAULT_INPUTS,
  weights: { ...DEFAULT_INPUTS.weights, productBox: 1 },
};

interface PresetEditFormProps {
  preset: Preset;
  onSave(patch: Omit<Preset, 'id'>): void;
  onCancel(): void;
}

/**
 * Edits a copy of a preset's fields, shown in the display unit. Validation reuses the inputs
 * panel's parser and field rule (an untouched field saves its exact value), with the product
 * and its box weight left at valid placeholders because presets do not store them.
 */
export function PresetEditForm({ preset, onSave, onCancel }: PresetEditFormProps) {
  const unit = useUnit();
  const [name, setName] = useState(preset.name);
  const [{ draft, origins }, setForm] = useState(() =>
    draftInUnit(presetToInputs(preset, FORM_BASE), unit),
  );
  const setDraft = (update: (d: typeof draft) => typeof draft) =>
    setForm((f) => ({ ...f, draft: update(f.draft) }));
  const nameId = useId();
  const parsed = parseInUnit(draft, origins, unit);
  const errors = parsed.ok ? NO_ERRORS : parsed.errors;
  const nameError = name.trim() === '' ? 'Enter a name' : undefined;

  const setField = (path: string, value: string) => {
    if (!isNumericPath(path)) return;
    const kind = NUMERIC_FIELDS[path];
    setForm((f) => ({
      draft: withDraftText(f.draft, path, value),
      origins:
        kind === 'count' ? f.origins : { ...f.origins, [path]: typedOrigin(kind, value, unit) },
    }));
  };
  const setMode = (rotationMode: RotationMode) => setDraft((d) => ({ ...d, rotationMode }));
  const toggle = (code: OrientationCode) =>
    setDraft((d) => ({
      ...d,
      customOrientations: d.customOrientations.includes(code)
        ? d.customOrientations.filter((c) => c !== code)
        : [...d.customOrientations, code],
    }));
  const setKeepUpright = (keepCartonsUpright: boolean) =>
    setDraft((d) => ({ ...d, keepCartonsUpright }));
  const setMinStability = (minStability: MinStability) => setDraft((d) => ({ ...d, minStability }));

  const save = () => {
    if (!parsed.ok || nameError) return;
    onSave({ ...preset, ...presetFieldsOf(parsed.inputs), name: name.trim() });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <label
          htmlFor={nameId}
          className="mb-0.5 block text-xs text-gray-700 dark:text-harbor-mist"
        >
          Name
        </label>
        <div className="focus-ticks-within flex">
          <input
            id={nameId}
            type="text"
            value={name}
            autoComplete="off"
            aria-invalid={nameError ? 'true' : 'false'}
            onChange={(e) => setName(e.target.value)}
            className={`w-full border border-gray-300 px-2 py-1 text-sm focus:outline-none dark:bg-harbor-raised dark:text-harbor-foam ${
              // Light shows the name error as text only; Harbor also gives the field its coral edge.
              nameError ? 'dark:border-l-[3px] dark:border-harbor-coral' : 'dark:border-harbor-foam'
            }`}
          />
        </div>
        {nameError && (
          <p className="mt-0.5 text-xs text-red-700 dark:text-harbor-coral-text">{nameError}</p>
        )}
      </div>
      <DimsFieldset
        legend="Pallet limitation"
        group="pallet"
        idPrefix={PREFIX}
        labels={DIM_LABELS}
        values={draft.pallet}
        errors={errors}
        onChange={setField}
      />
      <DimsFieldset
        legend="Maximum carton"
        group="maxCarton"
        idPrefix={PREFIX}
        labels={MAX_LABELS}
        values={draft.maxCarton}
        errors={errors}
        onChange={setField}
      />
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1 text-xs heading text-gray-500 dark:text-harbor-mist">
          Packing
        </legend>
        <NumberField
          id={`${PREFIX}-boxesPerCarton`}
          label="Desired boxes per carton"
          value={draft.boxesPerCarton}
          placeholder="Blank = best fit"
          suffix="boxes"
          error={errors.boxesPerCarton}
          onChange={(v) => setField('boxesPerCarton', v)}
        />
        <NumberField
          id={`${PREFIX}-targetQuantity`}
          label="Desired box quantity"
          value={draft.targetQuantity}
          placeholder="Blank = maximize"
          suffix="boxes"
          error={errors.targetQuantity}
          onChange={(v) => setField('targetQuantity', v)}
        />
        <NumberField
          id={`${PREFIX}-leeway`}
          label="Box leeway"
          value={draft.leeway}
          error={errors.leeway}
          onChange={(v) => setField('leeway', v)}
        />
        <NumberField
          id={`${PREFIX}-wallThickness`}
          label="Carton wall thickness"
          value={draft.wallThickness}
          error={errors.wallThickness}
          onChange={(v) => setField('wallThickness', v)}
        />
        <NumberField
          id={`${PREFIX}-overhang`}
          label="Pallet overhang"
          value={draft.overhang}
          error={errors.overhang}
          onChange={(v) => setField('overhang', v)}
        />
      </fieldset>
      <WeightFieldset
        fields={PRESET_WEIGHTS}
        idPrefix={PREFIX}
        values={draft.weights}
        errors={errors}
        onChange={setField}
      />
      <RotationFields
        idPrefix={`${PREFIX}-`}
        mode={draft.rotationMode}
        custom={draft.customOrientations}
        keepUpright={draft.keepCartonsUpright}
        error={errors.customOrientations}
        setRotationMode={setMode}
        toggleOrientation={toggle}
        setKeepCartonsUpright={setKeepUpright}
      />
      <MinStabilityFields value={draft.minStability} onChange={setMinStability} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={!parsed.ok || !!nameError} className={PRIMARY_BUTTON}>
          Save
        </button>
      </div>
    </form>
  );
}
