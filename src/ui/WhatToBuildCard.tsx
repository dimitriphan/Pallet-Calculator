import { useId, type ReactNode } from 'react';
import { cartonDisplayDims, describeBoxCounts } from '../engine/analytics/analytics';
import { describeRun, stackRuns } from '../engine/analytics/stack';
import { formatDims, formatNumber } from '../engine/units/units';
import { StaleBadge } from './StaleBadge';
import { useStatusContent } from './StatusMessages';
import { useResults } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

const NO_LAYOUT = 'Enter the three sizes to see what to build.';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Basic mode's plain build instructions for the selected layout: the carton, the stack from
 * the bottom, and the finished load. Every number comes from the result, not the draft.
 * Renders nothing when the status messages already explain an empty or failed result.
 */
export function WhatToBuildCard() {
  const headingId = useId();
  const selected = useSelectedAnalytics();
  const best = useResults((s) => s.result?.layouts[0] ?? null);
  const select = useResults((s) => s.select);
  const { error, empty } = useStatusContent();

  let body: ReactNode;
  if (selected) {
    const { ranked, analytics } = selected;
    const layout = ranked.layout;
    const p = analytics.pallet;
    const carton: [string, string][] = [
      ['Outer size', `${formatDims(cartonDisplayDims(layout, 'outer'))} in`],
      ['Inner size', `${formatDims(cartonDisplayDims(layout, 'inner'))} in`],
      ['Boxes per carton', String(layout.carton.boxesPerCarton)],
      [
        'Boxes inside',
        `${describeBoxCounts(analytics.carton.counts)} along the box's length × width × height`,
      ],
    ];
    body = (
      <>
        {ranked.rank !== 1 && best && (
          <div className="space-y-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
            <p>
              Showing layout {ranked.rank}, chosen in Full view. Layout 1 fits{' '}
              {best.layout.totalProducts} boxes.
            </p>
            <button
              type="button"
              onClick={() => select(0)}
              className="rounded border border-blue-300 bg-white px-2 py-1 text-sm font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:border-blue-700 dark:bg-gray-900 dark:text-blue-200 dark:hover:bg-blue-900 dark:focus-visible:outline-blue-400"
            >
              Use layout 1
            </button>
          </div>
        )}
        <Part title="Carton">
          <dl className="divide-y divide-gray-100 rounded border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
            {carton.map(([label, value]) => (
              <div key={label} className="px-3 py-1.5">
                <dt className="text-xs text-gray-600 dark:text-gray-300">{label}</dt>
                <dd className="text-base font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Part>
        <Part title="Stack, from the bottom">
          {/* role="list" keeps list semantics in Safari, which drops them with list-style none. */}
          <ol role="list" className="space-y-1.5">
            {stackRuns(layout).map((run) => (
              <li
                key={run.from}
                className="rounded border-l-4 border-blue-500 bg-gray-50 px-3 py-2 text-base font-medium text-gray-900 dark:border-blue-400 dark:bg-gray-800 dark:text-gray-100"
              >
                {describeRun(run)}
              </li>
            ))}
          </ol>
        </Part>
        <Part title="Finished load">
          <p className="text-base font-medium tabular-nums text-gray-900 dark:text-gray-100">
            {`${formatNumber(p.loadLength)} × ${formatNumber(p.loadWidth)} × ${formatNumber(p.totalLoadHeight)} in (including pallet)`}
          </p>
        </Part>
      </>
    );
  } else if (!empty && !error) {
    body = <p className="text-sm text-gray-600 dark:text-gray-300">{NO_LAYOUT}</p>;
  } else {
    // The status messages above already say why there is nothing to build.
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          What to build
        </h2>
        <StaleBadge />
      </div>
      {body}
    </section>
  );
}
