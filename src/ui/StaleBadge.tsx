import { MANUAL_OUT_OF_DATE_NOTE, STALE_NOTE } from '../export/exportData';
import { useResults } from './StoreContext';
import { useSelectedLayout } from './useSelectedLayout';

/**
 * Whether the numbers shown for the selected layout are older than the inputs on screen: the
 * one selection's `stale` (a calculated result awaiting recalculation, a manual layout while
 * the inputs are invalid or that is out of date). With nothing selected, the result's own mark.
 */
export function useShownStale(): boolean {
  const selected = useSelectedLayout();
  const resultStale = useResults((s) => s.stale);
  return selected ? selected.stale : resultStale;
}

/** A small "Out of date" badge, rendered only while the layout shown is stale. */
export function StaleBadge({ className = '' }: { className?: string }) {
  const stale = useShownStale();
  const outOfDate = useSelectedLayout()?.ranked.manual?.status === 'outOfDate';
  if (!stale) return null;
  return (
    <span
      title={outOfDate ? MANUAL_OUT_OF_DATE_NOTE : STALE_NOTE}
      className={`whitespace-nowrap bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-harbor-sand dark:text-harbor-deep ${className}`}
    >
      Out of date
    </span>
  );
}
