import { useEffect, useRef, type ReactNode } from 'react';
import { ModalDialog } from '../ModalDialog';
import { EDITOR_BUTTON, EDITOR_PRIMARY } from './styles';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  /** The button that goes ahead. */
  confirm: string;
  /** The button that changes nothing; Escape and Close do the same. */
  keep: string;
  onConfirm(): void;
  onKeep(): void;
}

/**
 * A question asked before something of the user's is thrown away. Modal: focus stays inside
 * until it is answered and then goes back to the button that asked.
 */
export function ConfirmDialog({
  title,
  children,
  confirm,
  keep,
  onConfirm,
  onKeep,
}: ConfirmDialogProps) {
  const keepButton = useRef<HTMLButtonElement>(null);
  // After the dialog has opened (the child's effect runs first), so the safe answer has the
  // focus rather than the first button in the dialog.
  useEffect(() => {
    keepButton.current?.focus();
  }, []);
  return (
    <ModalDialog title={title} onClose={onKeep}>
      <div className="space-y-4">
        <div className="text-sm text-gray-800 dark:text-harbor-foam">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={keepButton} type="button" onClick={onKeep} className={EDITOR_BUTTON}>
            {keep}
          </button>
          <button type="button" onClick={onConfirm} className={EDITOR_PRIMARY}>
            {confirm}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
