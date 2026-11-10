import { useId, useState } from 'react';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs, parseDraft } from '../domain/schemas';
import type { Inputs } from '../domain/types';
import { inputsMatchPreset, presetToInputs } from '../store/presetsStore';
import { BUTTON, ModalDialog } from './ModalDialog';
import { NamePrompt } from './NamePrompt';
import { PresetDialog } from './PresetDialog';
import { presetFieldsOf } from './presetFields';
import { useInputs, usePresets, useStores } from './StoreContext';

const NO_PRESET = '';

/** Preset picker with "Modified" tracking, save actions, and a Manage dialog. */
export function PresetMenu() {
  const { inputs, presets: presetsStore } = useStores();
  const presets = usePresets((s) => s.presets);
  const activeId = usePresets((s) => s.activePresetId);
  const draft = useInputs((s) => s.draft);
  const parsed = useInputs((s) => s.parsed);
  const [managing, setManaging] = useState(false);
  const [naming, setNaming] = useState(false);
  const selectId = useId();

  const active = presets.find((p) => p.id === activeId);
  const modified = !!active && (!parsed.ok || !inputsMatchPreset(parsed.inputs, active));

  const choose = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) {
      presetsStore.getState().setActive(null);
      return;
    }
    // Only the product survives from the current inputs. When other fields are invalid, check
    // the product alone by parsing it beside valid defaults; a bad product falls back to the default.
    let current: Inputs;
    if (parsed.ok) current = parsed.inputs;
    else {
      const product = parseDraft({ ...draftFromInputs(DEFAULT_INPUTS), product: draft.product });
      current = {
        ...DEFAULT_INPUTS,
        product: product.ok ? product.inputs.product : DEFAULT_INPUTS.product,
      };
    }
    inputs.getState().replaceInputs(presetToInputs(preset, current));
    presetsStore.getState().setActive(preset.id);
  };

  const saveToPreset = () => {
    if (!active || !parsed.ok) return;
    presetsStore.getState().update(active.id, presetFieldsOf(parsed.inputs));
  };

  const saveAsNew = (name: string) => {
    if (!parsed.ok) return;
    const created = presetsStore.getState().create(name, parsed.inputs);
    presetsStore.getState().setActive(created.id);
    setNaming(false);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={selectId} className="text-sm text-gray-700">
        Preset
      </label>
      <select
        id={selectId}
        value={active ? active.id : NO_PRESET}
        onChange={(e) => choose(e.target.value)}
        className="max-w-56 rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <option value={NO_PRESET}>No preset</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {modified && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
          Modified
        </span>
      )}
      {modified && (
        <button type="button" disabled={!parsed.ok} onClick={saveToPreset} className={BUTTON}>
          Save to preset
        </button>
      )}
      {(modified || !active) && (
        <button
          type="button"
          disabled={!parsed.ok}
          onClick={() => setNaming(true)}
          className={BUTTON}
        >
          Save as new
        </button>
      )}
      <button type="button" onClick={() => setManaging(true)} className={BUTTON}>
        Manage
      </button>
      {managing && <PresetDialog onClose={() => setManaging(false)} />}
      {naming && (
        <ModalDialog title="Save as new preset" onClose={() => setNaming(false)}>
          <NamePrompt initial="" onSave={saveAsNew} onCancel={() => setNaming(false)} />
        </ModalDialog>
      )}
    </div>
  );
}
