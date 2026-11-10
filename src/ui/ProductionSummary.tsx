import { StaleBadge } from './StaleBadge';
import { useResults } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

/** The five production numbers for the selected layout, always visible. */
export function ProductionSummary() {
  const summary = useSelectedAnalytics()?.analytics.summary ?? null;
  const stale = useResults((s) => s.stale);
  const tiles: [string, string | number | undefined][] = [
    ['Boxes per carton', summary?.boxesPerCarton],
    ['Cartons per layer', summary?.cartonsPerLayer],
    ['Layers', summary?.layers],
    ['Cartons per pallet', summary?.cartonsPerPallet],
    ['Total boxes per pallet', summary?.totalBoxes],
  ];
  return (
    <section
      aria-label="Production summary"
      className="relative shrink-0 border-b border-gray-200 bg-white dark:border-harbor-foam/40 dark:bg-harbor-panel"
    >
      <dl
        className={`grid grid-cols-5 divide-x divide-gray-200 dark:divide-harbor-foam/30 ${stale ? 'opacity-50 dark:opacity-100' : ''}`}
      >
        {tiles.map(([label, value], k) => (
          <div key={label} className="px-4 py-2">
            <dt className="text-xs text-gray-500 dark:text-harbor-mist">{label}</dt>
            <dd
              className={`text-xl font-semibold tabular-nums ${
                k === tiles.length - 1 ? 'text-blue-700' : 'text-gray-900'
              } ${
                // Harbor marks an out-of-date result with mist values and the badge, never by fading.
                stale ? 'dark:text-harbor-mist' : 'dark:text-harbor-foam'
              }`}
            >
              {value === undefined ? '—' : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      <StaleBadge className="absolute right-3 top-2" />
    </section>
  );
}
