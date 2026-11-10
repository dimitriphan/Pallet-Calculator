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
      className="relative shrink-0 border-b border-gray-200 bg-white"
    >
      <dl className={`grid grid-cols-5 divide-x divide-gray-200 ${stale ? 'opacity-50' : ''}`}>
        {tiles.map(([label, value], k) => (
          <div key={label} className="px-4 py-2">
            <dt className="text-xs font-medium text-gray-500">{label}</dt>
            <dd
              className={`text-xl font-semibold tabular-nums ${
                k === tiles.length - 1 ? 'text-blue-700' : 'text-gray-900'
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
