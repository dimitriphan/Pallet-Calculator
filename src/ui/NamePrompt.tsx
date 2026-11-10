import { useId, useState } from 'react';
import { BUTTON, PRIMARY_BUTTON } from './ModalDialog';

interface NamePromptProps {
  initial: string;
  onSave(name: string): void;
  onCancel(): void;
}

/** A name field with Save and Cancel; Save needs a non-blank name. */
export function NamePrompt({ initial, onSave, onCancel }: NamePromptProps) {
  const [name, setName] = useState(initial);
  const id = useId();
  const trimmed = name.trim();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSave(trimmed);
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="mb-0.5 block text-xs text-gray-700 dark:text-harbor-mist">
          Name
        </label>
        <div className="focus-ticks-within flex">
          <input
            id={id}
            type="text"
            value={name}
            autoFocus
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 px-2 py-1 text-sm focus:outline-none dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam"
          />
        </div>
      </div>
      <button type="submit" disabled={!trimmed} className={PRIMARY_BUTTON}>
        Save
      </button>
      <button type="button" onClick={onCancel} className={BUTTON}>
        Cancel
      </button>
    </form>
  );
}
