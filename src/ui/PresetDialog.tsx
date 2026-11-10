import { useRef, useState } from 'react';
import { downloadBlob } from '../export/download';
import { formatDims, formatNumber } from '../engine/units/units';
import type { Preset } from '../domain/types';
import { BUTTON, ModalDialog, PRIMARY_BUTTON } from './ModalDialog';
import { PresetEditForm } from './PresetEditForm';
import { usePresets, useStores } from './StoreContext';

type Mode = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'delete'; id: string };

/** Lists the company presets with edit, clone, delete, export and import. */
export function PresetDialog({ onClose }: { onClose(): void }) {
  const { presets: store } = useStores();
  const presets = usePresets((s) => s.presets);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [importMessage, setImportMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const editing = mode.kind === 'edit' ? presets.find((p) => p.id === mode.id) : undefined;

  const exportAll = () =>
    downloadBlob(
      new Blob([store.getState().exportJson()], { type: 'application/json' }),
      'pallet-presets.json',
    );

  // The result is shown here, not as a global notice: notices sit outside the modal dialog.
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { imported, skipped } = store.getState().importJson(await file.text());
      setImportMessage(
        imported + skipped > 0
          ? `Imported ${imported} preset(s), skipped ${skipped}.`
          : 'That file is not a valid preset export.',
      );
    } catch {
      setImportMessage('That file could not be read.');
    }
  };

  const pending = (p: Preset) => mode.kind === 'delete' && mode.id === p.id;

  return (
    <ModalDialog title={editing ? 'Edit preset' : 'Manage presets'} onClose={onClose}>
      {editing ? (
        <PresetEditForm
          preset={editing}
          onCancel={() => setMode({ kind: 'list' })}
          onSave={(patch) => {
            store.getState().update(editing.id, patch);
            setMode({ kind: 'list' });
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={exportAll} className={BUTTON}>
              Export
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} className={BUTTON}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json"
              aria-label="Import presets file"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <p role="status" className="text-sm text-gray-800 empty:hidden dark:text-harbor-foam">
            {importMessage}
          </p>
          {presets.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-harbor-mist">No presets yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 border border-gray-200 dark:divide-harbor-foam/40 dark:border-harbor-foam/40">
              {presets.map((p) => (
                <li key={p.id} className="space-y-2 px-3 py-2">
                  <div>
                    <p className="text-sm text-gray-900 dark:text-harbor-foam">{p.name}</p>
                    <p className="text-xs tabular-nums text-gray-600 dark:text-harbor-mist">
                      Pallet {formatDims(p.pallet)} in · leeway {formatNumber(p.leeway)} in
                    </p>
                  </div>
                  {pending(p) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-gray-900 dark:text-harbor-foam">{`Delete preset “${p.name}”?`}</p>
                      <button
                        type="button"
                        onClick={() => {
                          store.getState().remove(p.id);
                          setMode({ kind: 'list' });
                        }}
                        className={PRIMARY_BUTTON}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode({ kind: 'list' })}
                        className={BUTTON}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMode({ kind: 'edit', id: p.id })}
                        className={BUTTON}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => store.getState().clone(p.id)}
                        className={BUTTON}
                      >
                        Clone
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode({ kind: 'delete', id: p.id })}
                        className={BUTTON}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ModalDialog>
  );
}
