import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface ModalDialogProps {
  title: string;
  onClose(): void;
  /** "center" for a dialog, "right" for a drawer attached to the right edge. */
  placement?: 'center' | 'right';
  children: ReactNode;
}

const PLACEMENT = {
  center: 'm-auto w-[40rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)]',
  right: 'my-0 ml-auto mr-0 h-screen max-h-none w-[28rem] max-w-full',
};

/**
 * A native <dialog> shown modally, with a title as its accessible name and a visible Close
 * button. Render it only while open; closing hands focus back to the element that opened it.
 */
export function ModalDialog({ title, onClose, placement = 'center', children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  // Captured during the first render, before the dialog takes focus. An effect would run twice
  // under StrictMode and capture the dialog's own content the second time.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // jsdom has no showModal(); the open attribute still makes the dialog visible there.
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute('open', '');
    const onCancel = (e: Event) => {
      e.preventDefault(); // Escape: let React unmount the dialog instead
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      // Only on a real close: StrictMode's rehearsal unmount leaves the dialog in the page.
      if (!dialog.isConnected) opener?.focus();
    };
  }, [opener]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`flex flex-col overflow-hidden border border-gray-300 bg-white p-0 text-gray-900 backdrop:bg-gray-900/40 dark:border-harbor-foam dark:bg-harbor-panel dark:text-harbor-foam dark:backdrop:bg-harbor-deep/70 ${PLACEMENT[placement]}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-harbor-foam/40">
        <h2 id={titleId} className="heading text-base">
          {title}
        </h2>
        <button type="button" onClick={onClose} className={BUTTON}>
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}

export const BUTTON =
  'border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:enabled:hover:underline dark:disabled:border-dashed dark:disabled:text-harbor-mist dark:focus-visible:outline-harbor-teal-text';

export const PRIMARY_BUTTON =
  'border border-blue-700 bg-blue-700 px-2.5 py-1 text-sm text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-harbor-teal-fill dark:bg-harbor-teal-fill dark:text-harbor-foam dark:hover:bg-harbor-teal-fill dark:enabled:hover:underline dark:disabled:border-dashed dark:disabled:border-harbor-foam dark:disabled:bg-harbor-raised dark:disabled:text-harbor-mist dark:focus-visible:outline-harbor-teal-text';
