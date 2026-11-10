import { useEffect, useId, useRef, useState } from 'react';
import { BUTTON, ModalDialog, PRIMARY_BUTTON } from './ModalDialog';

interface BuildSheetDialogProps {
  /** Creates and downloads the PDF; the dialog shows "Creating…" until it settles. */
  onSave(jobName: string): Promise<void>;
  onCancel(): void;
}

/** Asks for an optional job name before the PDF build sheet is created. */
export function BuildSheetDialog({ onSave, onCancel }: BuildSheetDialogProps) {
  const [jobName, setJobName] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  // Focus the field in an effect rather than with autoFocus: ModalDialog's effect (a child's,
  // so it runs first) must see the Export button as the element to refocus on close, and
  // autoFocus would move focus into the field before that, during the commit.
  useEffect(() => field.current?.focus(), []);
  return (
    <ModalDialog title="Build sheet (PDF)" onClose={() => !busy && onCancel()}>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void onSave(jobName);
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="mb-0.5 block text-xs text-gray-700 dark:text-harbor-mist">
            Job name (optional)
          </label>
          <div className="focus-ticks-within flex">
            <input
              ref={field}
              id={id}
              type="text"
              value={jobName}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => setJobName(e.target.value)}
              className="w-full border border-gray-300 px-2 py-1 text-sm focus:outline-none dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam"
            />
          </div>
        </div>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? 'Creating…' : 'Save PDF'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={BUTTON}>
          Cancel
        </button>
      </form>
    </ModalDialog>
  );
}
