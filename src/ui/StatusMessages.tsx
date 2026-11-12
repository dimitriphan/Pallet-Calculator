import { emptyMessage } from './emptyMessage';
import { belowMinimumText } from './minStability';
import { Mascot } from './Mascot';
import { SproutProgress } from './SproutProgress';
import { useResults } from './StoreContext';

interface StatusLine {
  key: string;
  text: string;
  tone: string;
  /** Shows the sprout progress line right after the text. */
  progress?: boolean;
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
    lines.push({
      key: 'running',
      text: 'Calculating…',
      tone: 'text-gray-600 dark:text-harbor-foam',
      progress: true,
    });
  // After a failed run the error (with Retry) explains why the result is out of date.
  if (stale && status !== 'error')
    lines.push({
      key: 'stale',
      text: 'Showing the last valid result. Fix the highlighted fields to update.',
      tone: 'text-amber-800 dark:text-harbor-sand',
    });
  if (truncated && status !== 'running')
    lines.push({
      key: 'truncated',
      text: 'Search was limited to keep it fast; results may not be the best possible.',
      tone: 'text-amber-800 dark:text-harbor-sand',
    });
  // The layouts shown are the best-rated found, each marked as below the minimum.
  if (result?.belowMinimum && result.layouts.length > 0 && inputs && inputs.minStability !== 'auto')
    lines.push({
      key: 'belowMinimum',
      text: belowMinimumText(inputs.minStability),
      tone: 'text-amber-800 dark:text-harbor-sand',
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
          <div className="flex items-start gap-3 border border-red-200 bg-red-50 px-2 py-1 text-red-800 dark:border-0 dark:border-l-2 dark:border-harbor-coral dark:bg-harbor-panel dark:text-harbor-coral-text">
            <Mascot pose="concerned" size={64} />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={retry}
              className="focus-ticks border border-red-300 bg-white px-2 py-0.5 text-xs hover:bg-red-100 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {lines.map((l) => (
          <p key={l.key} className={l.progress ? `flex items-start gap-2 ${l.tone}` : l.tone}>
            {l.progress && <Mascot pose="working" size={64} />}
            {l.progress ? (
              <span className="flex h-5 items-center gap-2">
                {l.text}
                <SproutProgress />
              </span>
            ) : (
              l.text
            )}
          </p>
        ))}
      </div>
      {empty && (
        <p className="bracket flex items-start gap-3 bg-white px-3 py-4 text-sm text-gray-700 dark:bg-harbor-panel dark:text-harbor-foam">
          <Mascot pose="concerned" size={64} />
          <span>{empty}</span>
        </p>
      )}
    </>
  );
}
