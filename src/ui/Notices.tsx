import { useNoticesStore } from '../store/noticesStore';

/** Stacked, dismissible messages, e.g. saved data that could not be read. */
export function Notices() {
  const notices = useNoticesStore((s) => s.notices);
  const dismiss = useNoticesStore((s) => s.dismiss);
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-md"
        >
          <p className="flex-1">{n.message}</p>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            className="rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
