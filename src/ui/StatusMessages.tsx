import { emptyMessage } from './emptyMessage';
import { useResults } from './StoreContext';

interface StatusLine {
  key: string;
  text: string;
  tone: string;
}

/** What the status area would show right now; shared so callers can avoid repeating it. */
export function useStatusContent(): {
  lines: StatusLine[];
  /** The calculation error, shown with Retry, or null. */
  error: string | null;
  /** Why there are no layouts, or null. */
  empty: string | null;
} {
  const status = useResults((s) => s.status);
  const stale = useResults((s) => s.stale);
  const errorText = useResults((s) => s.error);
  const result = useResults((s) => s.result);
  const inputs = useResults((s) => s.inputs);
  const truncated = result?.truncated ?? false;

  const lines: StatusLine[] = [];
  if (status === 'running')
    lines.push({ key: 'running', text: 'Calculating…', tone: 'text-gray-600 dark:text-gray-300' });
  // After a failed run the error (with Retry) explains why the result is out of date.
  if (stale && status !== 'error')
    lines.push({
      key: 'stale',
      text: 'Showing the last valid result. Fix the highlighted fields to update.',
      tone: 'text-amber-800 dark:text-amber-300',
    });
  if (truncated && status !== 'running')
    lines.push({
      key: 'truncated',
      text: 'Search was limited to keep it fast; results may not be the best possible.',
      tone: 'text-amber-800 dark:text-amber-300',
    });

  return {
    lines,
    error: status === 'error' && errorText ? errorText : null,
    empty: result && inputs ? emptyMessage(result, inputs) : null,
  };
}

/**
 * The calculation status lines, the error with Retry, and the "nothing fits" message.
 * The live region stays mounted so screen readers announce what appears in it; while it is
 * empty it takes no height and cancels the parent's `space-y` margin.
 */
export function StatusMessages() {
  const { lines, error, empty } = useStatusContent();
  const retry = useResults((s) => s.retry);

  return (
    <>
      <div role="status" className="space-y-1 text-sm empty:!mt-0">
        {error && (
          <div className="flex items-center gap-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={retry}
              className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-600 dark:border-red-700 dark:bg-gray-900 dark:hover:bg-red-900 dark:focus-visible:outline-red-400"
            >
              Retry
            </button>
          </div>
        )}
        {lines.map((l) => (
          <p key={l.key} className={l.tone}>
            {l.text}
          </p>
        ))}
      </div>
      {empty && (
        <p className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          {empty}
        </p>
      )}
    </>
  );
}
