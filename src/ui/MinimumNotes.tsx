import { autoMoreText, BELOW_MINIMUM, minStabilityText } from './minStability';
import { useResults } from './StoreContext';

/**
 * A caution, never an error: sand on the panel in Harbor, amber in light. Coral stays for
 * errors.
 */
const BELOW_STYLE =
  'border border-amber-300 bg-amber-50 text-amber-900 dark:border-harbor-sand dark:bg-harbor-panel dark:text-harbor-sand';

/**
 * "Below your minimum", beside the rating of a layout that is shown although nothing reached
 * the minimum stability. `className` sets the size where it is used.
 */
export function BelowMinimumBadge({
  className = 'px-1.5 text-[11px] leading-4',
}: {
  className?: string;
}) {
  return <span className={`${BELOW_STYLE} ${className}`}>{BELOW_MINIMUM}</span>;
}

/** Whether the result on screen holds layouts below the minimum stability (none reached it). */
export function useBelowMinimum(): boolean {
  return useResults((s) => s.result?.belowMinimum === true);
}

/**
 * What a minimum stability did to the result on screen: that one is in force (`always`, for
 * Basic view, which has no control showing it) and how many more boxes Auto would give.
 * Nothing when the result was worked out with Auto.
 */
export function MinimumNote({ always = false }: { always?: boolean }) {
  const minimum = useResults((s) => s.inputs?.minStability ?? 'auto');
  const more = useResults((s) => (s.result ? autoMoreText(s.result) : null));
  if (minimum === 'auto' || (!always && more === null)) return null;
  return (
    <p className="border border-blue-200 bg-blue-50 px-3 py-2 text-sm tabular-nums text-blue-900 dark:border-harbor-foam/40 dark:bg-harbor-raised dark:text-harbor-foam">
      {[always ? minStabilityText(minimum) : null, more].filter(Boolean).join(' ')}
    </p>
  );
}
