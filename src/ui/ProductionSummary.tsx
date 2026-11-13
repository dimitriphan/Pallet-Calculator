import { useMemo } from 'react';
import { computeAnalytics } from '../engine/analytics/analytics';
import { StaleBadge, useShownStale } from './StaleBadge';
import { useManualEditor } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

/**
 * The five production numbers, always visible: of the selected layout, or, while a layout is
 * edited by hand, of the layout being edited as it stands, marked "Editing" (the selected
 * layout's totals beside the editor's own would read as the editor's).
 */
export function ProductionSummary() {
  const selected = useSelectedAnalytics()?.analytics.summary ?? null;
  const build = useManualEditor((s) => s.session?.build ?? null);
  const editing = build !== null;
  const edited = useMemo(() => {
    if (!build || build.layout.layers.length === 0) return null;
    return computeAnalytics(build.layout, build.inputs).summary;
  }, [build]);
  const summary = editing ? edited : selected;
  const shownStale = useShownStale();
  const stale = !editing && shownStale;
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
      data-editing={editing ? 'true' : undefined}
      className={`relative shrink-0 border-b bg-white dark:bg-harbor-panel ${
        editing
          ? 'border-blue-700 dark:border-harbor-teal'
          : 'border-gray-200 dark:border-harbor-foam/40'
      }`}
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
      {editing ? (
        <span
          data-testid="summary-editing"
          className="heading absolute right-3 top-2 bg-blue-700 px-1.5 py-0.5 text-xs text-white dark:bg-harbor-teal-fill dark:text-harbor-foam"
        >
          Editing<span className="sr-only">: these are the totals of the layout being edited</span>
        </span>
      ) : (
        <StaleBadge className="absolute right-3 top-2" />
      )}
    </section>
  );
}
