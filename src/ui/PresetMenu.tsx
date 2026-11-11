import { useId, useState } from 'react';
import type { Preset } from '../domain/types';
import type { InputsState } from '../store/inputsStore';
import { inputsMatchPreset } from '../store/presetsStore';
import { defaultDraft, originText, parseInUnit, writtenOrigin } from '../store/unitFields';
import { BUTTON, ModalDialog } from './ModalDialog';
import { NamePrompt } from './NamePrompt';
import { PresetDialog } from './PresetDialog';
import { presetFieldsOf } from './presetFields';
import { useInputs, usePrefs, usePresets, useStores } from './StoreContext';

const NO_PRESET = '';

/** A valid stand-in for the product box weight, which a preset never covers. */
const PLACEHOLDER_BOX_WEIGHT = writtenOrigin(1);

/**
 * The draft parsed with a valid stand-in for the box weight, which a preset never stores: a
 * blank box weight under a maximum pallet weight then does not block saving or matching.
 * With `anyProduct`, the product is swapped for valid stand-ins too.
 */
function parseForPreset(
  { draft, origins, unit }: Pick<InputsState, 'draft' | 'origins' | 'unit'>,
  anyProduct: boolean,
) {
  const placeholder = defaultDraft(unit);
  return parseInUnit(
    {
      ...draft,
      ...(anyProduct ? { product: placeholder.draft.product } : {}),
      weights: {
        ...draft.weights,
        productBox: originText('weight', PLACEHOLDER_BOX_WEIGHT, unit),
      },
    },
    {
      ...origins,
      ...(anyProduct
        ? {
            'product.length': placeholder.origins['product.length'],
            'product.width': placeholder.origins['product.width'],
            'product.height': placeholder.origins['product.height'],
          }
        : {}),
      'weights.productBox': PLACEHOLDER_BOX_WEIGHT,
    },
    unit,
  );
}

/**
 * Whether the draft's preset-covered fields (everything but the product and its box weight)
 * parse and equal the preset's. The product and box weight are swapped for valid stand-ins so
 * a product being edited, or a blank box weight under a preset's maximum, does not matter.
 */
function coveredFieldsMatch(
  state: Pick<InputsState, 'draft' | 'origins' | 'unit'>,
  preset: Preset,
): boolean {
  const parsed = parseForPreset(state, true);
  return parsed.ok && inputsMatchPreset(parsed.inputs, preset);
}

/**
 * Preset picker with "Modified" tracking, save actions, and a Manage dialog. Basic mode shows
 * the picker only.
 */
export function PresetMenu() {
  const { inputs, presets: presetsStore } = useStores();
  const presets = usePresets((s) => s.presets);
  const activeId = usePresets((s) => s.activePresetId);
  const draft = useInputs((s) => s.draft);
  const origins = useInputs((s) => s.origins);
  const unit = useInputs((s) => s.unit);
  // What a save stores: the inputs, with a stand-in for the box weight no preset keeps.
  const forSave = parseForPreset({ draft, origins, unit }, false);
  const full = usePrefs((s) => s.viewMode) === 'full';
  const [managing, setManaging] = useState(false);
  const [naming, setNaming] = useState(false);
  const selectId = useId();

  const active = presets.find((p) => p.id === activeId);
  const modified = !!active && !coveredFieldsMatch({ draft, origins, unit }, active);

  const choose = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) {
      presetsStore.getState().setActive(null);
      return;
    }
    // A preset never covers the product: it stays exactly as typed, even mid-edit or invalid.
    inputs.getState().applyPreset(preset);
    presetsStore.getState().setActive(preset.id);
  };

  const saveToPreset = () => {
    if (!active || !forSave.ok) return;
    presetsStore.getState().update(active.id, presetFieldsOf(forSave.inputs));
  };

  const saveAsNew = (name: string) => {
    if (!forSave.ok) return;
    const created = presetsStore.getState().create(name, forSave.inputs);
    presetsStore.getState().setActive(created.id);
    setNaming(false);
  };

  return (
    <div className="flex items-center gap-1 xl:gap-1.5 2xl:gap-2">
      <label
        htmlFor={selectId}
        className="sr-only text-sm text-gray-700 xl:not-sr-only dark:text-harbor-mist"
      >
        Preset
      </label>
      <span className="focus-ticks-within flex">
        <select
          id={selectId}
          value={active ? active.id : NO_PRESET}
          onChange={(e) => choose(e.target.value)}
          className="max-w-24 border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none xl:max-w-32 2xl:max-w-56 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam"
        >
          <option value={NO_PRESET}>No preset</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </span>
      {full && modified && (
        <span className="bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-harbor-sand dark:text-harbor-deep">
          Modified
        </span>
      )}
      {full && modified && (
        <button type="button" disabled={!forSave.ok} onClick={saveToPreset} className={BUTTON}>
          Save to preset
        </button>
      )}
      {full && (modified || !active) && (
        <button
          type="button"
          disabled={!forSave.ok}
          onClick={() => setNaming(true)}
          className={BUTTON}
        >
          Save as new
        </button>
      )}
      {full && (
        <button type="button" onClick={() => setManaging(true)} className={BUTTON}>
          Manage
        </button>
      )}
      {managing && <PresetDialog onClose={() => setManaging(false)} />}
      {naming && (
        <ModalDialog title="Save as new preset" onClose={() => setNaming(false)}>
          <NamePrompt initial="" onSave={saveAsNew} onCancel={() => setNaming(false)} />
        </ModalDialog>
      )}
    </div>
  );
}
