import { useId, useState } from 'react';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs, parseDraft } from '../domain/schemas';
import type { InputsDraft, Preset } from '../domain/types';
import { inputsMatchPreset } from '../store/presetsStore';
import { BUTTON, ModalDialog } from './ModalDialog';
import { NamePrompt } from './NamePrompt';
import { PresetDialog } from './PresetDialog';
import { presetFieldsOf } from './presetFields';
import { useInputs, usePrefs, usePresets, useStores } from './StoreContext';

const NO_PRESET = '';

/**
 * Whether the draft's preset-covered fields (everything but the product) parse and equal the
 * preset's. The product is swapped for the default so a product being edited does not matter.
 */
function coveredFieldsMatch(draft: InputsDraft, preset: Preset): boolean {
  const parsed = parseDraft({ ...draft, product: draftFromInputs(DEFAULT_INPUTS).product });
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
  const parsed = useInputs((s) => s.parsed);
  const full = usePrefs((s) => s.viewMode) === 'full';
  const [managing, setManaging] = useState(false);
  const [naming, setNaming] = useState(false);
  const selectId = useId();

  const active = presets.find((p) => p.id === activeId);
  const modified = !!active && !coveredFieldsMatch(draft, active);

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
      <label htmlFor={selectId} className="text-sm text-gray-700 dark:text-gray-300">
        Preset
      </label>
      <select
        id={selectId}
        value={active ? active.id : NO_PRESET}
        onChange={(e) => choose(e.target.value)}
        className="max-w-56 border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:border-blue-400 dark:focus:ring-blue-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value={NO_PRESET}>No preset</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {full && modified && (
        <span className="bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          Modified
        </span>
      )}
      {full && modified && (
        <button type="button" disabled={!parsed.ok} onClick={saveToPreset} className={BUTTON}>
          Save to preset
        </button>
      )}
      {full && (modified || !active) && (
        <button
          type="button"
          disabled={!parsed.ok}
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
