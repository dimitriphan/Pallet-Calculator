import { STALE_NOTE } from '../export/exportData';
import { useResults } from './StoreContext';

/** A small "Out of date" badge, rendered only while the shown result is stale. */
export function StaleBadge({ className = '' }: { className?: string }) {
  const stale = useResults((s) => s.stale);
  if (!stale) return null;
  return (
    <span
      title={STALE_NOTE}
      className={`whitespace-nowrap bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100 ${className}`}
    >
      Out of date
    </span>
  );
}
