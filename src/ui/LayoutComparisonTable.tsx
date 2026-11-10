import { useMemo, type KeyboardEvent } from 'react';
import {
  computeAnalytics,
  cartonDisplayDims,
  type TargetStatus,
} from '../engine/analytics/analytics';
import { formatDims, formatNumber } from '../engine/units/units';
import { emptyMessage } from './emptyMessage';
import { useResults } from './StoreContext';

const TARGET_BADGE: Record<Exclude<TargetStatus, 'none'>, { label: string; className: string }> = {
  met: { label: 'Target met', className: 'bg-green-100 text-green-800' },
  exceeded: { label: 'Target exceeded', className: 'bg-blue-100 text-blue-800' },
  notAchievable: { label: 'Target not achievable', className: 'bg-red-100 text-red-800' },
};

function StatusLine() {
  const status = useResults((s) => s.status);
  const stale = useResults((s) => s.stale);
  const error = useResults((s) => s.error);
  const truncated = useResults((s) => s.result?.truncated ?? false);
  const retry = useResults((s) => s.retry);

  const lines: { key: string; text: string; tone: string }[] = [];
  if (status === 'running')
    lines.push({ key: 'running', text: 'Calculating…', tone: 'text-gray-600' });
  if (stale)
    lines.push({
      key: 'stale',
      text: 'Showing the last valid result. Fix the highlighted fields to update.',
      tone: 'text-amber-800',
    });
  if (truncated && status !== 'running')
    lines.push({
      key: 'truncated',
      text: 'Search was limited to keep it fast; results may not be the best possible.',
      tone: 'text-amber-800',
    });

  return (
    <div role="status" className="min-h-[1.25rem] space-y-1 text-sm">
      {status === 'error' && error && (
        <div className="flex items-center gap-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-600"
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
  );
}

/** Every returned layout side by side; a row click selects it everywhere. */
export function LayoutComparisonTable() {
  const result = useResults((s) => s.result);
  const inputs = useResults((s) => s.inputs);
  const selectedIndex = useResults((s) => s.selectedIndex);
  const select = useResults((s) => s.select);

  const rows = useMemo(
    () =>
      result && inputs
        ? result.layouts.map((r) => ({ ranked: r, analytics: computeAnalytics(r.layout, inputs) }))
        : [],
    [result, inputs],
  );

  const message = result && inputs ? emptyMessage(result, inputs) : null;

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(index);
    }
  };

  const th = 'whitespace-nowrap px-2 py-1.5 font-medium';
  const td = 'whitespace-nowrap px-2 py-1.5 tabular-nums';
  return (
    <section aria-labelledby="comparison-heading" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="comparison-heading" className="text-sm font-semibold text-gray-900">
          Layout comparison
        </h2>
      </div>
      <StatusLine />
      {message && (
        <p className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-700">
          {message}
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table aria-label="Layout comparison" className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
              <tr>
                <th scope="col" className={`${th} w-8`}>
                  #
                </th>
                <th scope="col" className={th}>
                  Carton (in)
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Products
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Cartons
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Layers
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Utilization
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Remaining volume (in³)
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ranked, analytics }, index) => {
                const selected = index === selectedIndex;
                const badge =
                  analytics.target.status === 'none' ? null : TARGET_BADGE[analytics.target.status];
                return (
                  <tr
                    key={ranked.layout.id}
                    tabIndex={0}
                    aria-selected={selected ? 'true' : 'false'}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => select(index)}
                    onKeyDown={(e) => onKeyDown(e, index)}
                    className={`cursor-pointer border-b border-gray-100 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${
                      selected ? 'bg-blue-50 text-blue-950' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className={`${td} font-medium`}>{ranked.rank}</td>
                    <td className={td}>{formatDims(cartonDisplayDims(ranked.layout, 'outer'))}</td>
                    <td className={`${td} text-right`}>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold">{ranked.layout.totalProducts}</span>
                        {badge && (
                          <span
                            className={`whitespace-nowrap rounded px-1.5 text-[11px] font-medium leading-4 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>{ranked.layout.totalCartons}</td>
                    <td className={`${td} text-right`}>{ranked.layout.layers.length}</td>
                    <td className={`${td} text-right`}>
                      {formatNumber(analytics.totals.utilizationPct)}%
                    </td>
                    <td className={`${td} text-right`}>
                      {formatNumber(analytics.totals.remainingVolume)}
                    </td>
                    <td className={`${td} text-right`}>{formatNumber(ranked.score.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
