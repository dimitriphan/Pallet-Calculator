import { useId, useState } from 'react';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs, parseDraft } from '../domain/schemas';
import type { InputsDraft, OrientationCode, Preset, RotationMode } from '../domain/types';
import { presetToInputs } from '../store/presetsStore';
import { DimsFieldset } from './DimsFieldset';
import { BUTTON, PRIMARY_BUTTON } from './ModalDialog';
import { NumberField } from './NumberField';
import { presetFieldsOf } from './presetFields';
import { RotationFields } from './RotationControl';

const DIM_LABELS = { length: 'Length', width: 'Width', height: 'Height' };
const MAX_LABELS = { length: 'Max length', width: 'Max width', height: 'Max height' };
const PREFIX = 'preset-edit';
const NO_ERRORS: Record<string, string> = {};

type DimsGroup = 'pallet' | 'maxCarton';
type ScalarField = 'targetQuantity' | 'leeway' | 'wallThickness' | 'overhang';

interface PresetEditFormProps {
  preset: Preset;
  onSave(patch: Omit<Preset, 'id'>): void;
  onCancel(): void;
}

/**
 * Edits a copy of a preset's fields. Validation reuses the inputs panel's parser, with the
 * product left at a valid placeholder because presets do not store one.
 */
export function PresetEditForm({ preset, onSave, onCancel }: PresetEditFormProps) {
  const [name, setName] = useState(preset.name);
  const [draft, setDraft] = useState<InputsDraft>(() =>
    draftFromInputs(presetToInputs(preset, DEFAULT_INPUTS)),
  );
  const nameId = useId();
  const parsed = parseDraft(draft);
  const errors = parsed.ok ? NO_ERRORS : parsed.errors;
  const nameError = name.trim() === '' ? 'Enter a name' : undefined;

  const setField = (path: string, value: string) =>
    setDraft((d) => {
      const [group, key] = path.split('.');
      if (key !== undefined) {
        const g = group as DimsGroup;
        return { ...d, [g]: { ...d[g], [key]: value } };
      }
      return { ...d, [group as ScalarField]: value };
    });
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
        <label htmlFor={nameId} className="mb-0.5 block text-xs font-medium text-gray-700">
          Name
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          autoComplete="off"
          aria-invalid={nameError ? 'true' : 'false'}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {nameError && <p className="mt-0.5 text-xs text-red-700">{nameError}</p>}
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
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Packing
        </legend>
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
