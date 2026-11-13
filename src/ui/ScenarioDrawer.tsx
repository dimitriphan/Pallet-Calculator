import { useState } from 'react';
import type { Scenario } from '../domain/types';
import { BUTTON, ModalDialog, PRIMARY_BUTTON } from './ModalDialog';
import { NamePrompt } from './NamePrompt';
import { useNoticesStore } from '../store/noticesStore';
import { useManualEditor, useResults, useScenarios, useStores } from './StoreContext';

type Mode =
  | { kind: 'list' }
  | { kind: 'save' }
  | { kind: 'rename'; id: string }
  | { kind: 'delete'; id: string }
  /** Asked before a load closes the manual layout editor. */
  | { kind: 'load'; id: string };

export const LOAD_CLOSES_EDITOR =
  'You are editing a layout by hand. Loading a scenario will close the editor.';
const LAYOUTS_NOT_STORED =
  'Some of the scenario’s manual layouts could not be saved: browser storage is full or unavailable.';

const pad = (n: number) => String(n).padStart(2, '0');

/** "Scenario YYYY-MM-DD HH:mm" in local time. */
function defaultName(now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Scenario ${date} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function totalProducts(s: Scenario): number | null {
  return s.result.layouts[s.selectedIndex]?.layout.totalProducts ?? null;
}

/** Header button and right-hand drawer listing saved scenarios. */
export function ScenarioDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
        Scenarios
      </button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}

function Drawer({ onClose }: { onClose(): void }) {
  const { inputs, results, scenarios: store, manualLayouts, manualEditor } = useStores();
  const editing = useManualEditor((s) => s.session !== null);
  const scenarios = useScenarios((s) => s.scenarios);
  const ready = useResults((s) => s.status === 'ready' && s.result !== null && s.inputs !== null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const toList = () => setMode({ kind: 'list' });

  const saveCurrent = (name: string) => {
    const { inputs: resultInputs, result, selectedIndex } = results.getState();
    if (resultInputs && result) {
      const manual = manualLayouts.getState().specs;
      store.getState().save(name, resultInputs, result, selectedIndex, manual);
    }
    toList();
  };

  const load = (s: Scenario) => {
    // The session was for the inputs being replaced; the user has agreed to close it.
    manualEditor.getState().cancel();
    inputs.getState().replaceInputs(s.inputs);
    results.getState().restore(s.inputs, s.result, s.selectedIndex);
    // The scenario's manual layouts are added to the ones present; none present is removed
    // or changed (a different layout of the same id arrives as a copy).
    if (s.manualLayouts?.length) {
      const merged = manualLayouts.getState().addFromScenario(s.manualLayouts, s.inputs.overhang);
      if (merged.notStored > 0) useNoticesStore.getState().push(LAYOUTS_NOT_STORED);
    }
    onClose();
  };
  const askLoad = (s: Scenario) => {
    if (editing) setMode({ kind: 'load', id: s.id });
    else load(s);
  };

  return (
    <ModalDialog title="Scenarios" placement="right" onClose={onClose}>
      <div className="space-y-3">
        {mode.kind === 'save' ? (
          <NamePrompt initial={defaultName(new Date())} onSave={saveCurrent} onCancel={toList} />
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={() => setMode({ kind: 'save' })}
            className={PRIMARY_BUTTON}
          >
            Save current
          </button>
        )}
        {scenarios.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-harbor-mist">No saved scenarios yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 border border-gray-200 dark:divide-harbor-foam/40 dark:border-harbor-foam/40">
            {scenarios.map((s) => (
              <li key={s.id} className="space-y-2 px-3 py-2">
                {mode.kind === 'rename' && mode.id === s.id ? (
                  <NamePrompt
                    initial={s.name}
                    onSave={(name) => {
                      store.getState().rename(s.id, name);
                      toList();
                    }}
                    onCancel={toList}
                  />
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-gray-900 dark:text-harbor-foam">{s.name}</p>
                      <p className="text-xs tabular-nums text-gray-600 dark:text-harbor-mist">
                        {new Date(s.savedAt).toLocaleString()}
                        {totalProducts(s) !== null && ` · ${totalProducts(s)} products`}
                      </p>
                    </div>
                    {mode.kind === 'delete' && mode.id === s.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-gray-900 dark:text-harbor-foam">{`Delete scenario “${s.name}”?`}</p>
                        <button
                          type="button"
                          onClick={() => {
                            store.getState().remove(s.id);
                            toList();
                          }}
                          className={PRIMARY_BUTTON}
                        >
                          Delete
                        </button>
                        <button type="button" onClick={toList} className={BUTTON}>
                          Cancel
                        </button>
                      </div>
                    ) : mode.kind === 'load' && mode.id === s.id ? (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-900 dark:text-harbor-foam">
                          {LOAD_CLOSES_EDITOR}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => load(s)} className={PRIMARY_BUTTON}>
                            Close the editor and load
                          </button>
                          <button type="button" autoFocus onClick={toList} className={BUTTON}>
                            Keep editing
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => askLoad(s)} className={BUTTON}>
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode({ kind: 'rename', id: s.id })}
                          className={BUTTON}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => store.getState().duplicate(s.id)}
                          className={BUTTON}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode({ kind: 'delete', id: s.id })}
                          className={BUTTON}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalDialog>
  );
}
