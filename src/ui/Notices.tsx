import { useNoticesStore } from '../store/noticesStore';

/**
 * Stacked, dismissible messages, e.g. saved data that could not be read. The live region
 * stays mounted (empty, taking no space) so screen readers announce the first notice too.
 */
export function Notices() {
  const notices = useNoticesStore((s) => s.notices);
  const dismiss = useNoticesStore((s) => s.dismiss);
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {notices.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto flex items-start gap-3 border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-harbor-foam dark:bg-harbor-panel dark:text-harbor-foam"
        >
          <p className="flex-1">{n.message}</p>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            className="focus-ticks px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:text-harbor-foam"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
