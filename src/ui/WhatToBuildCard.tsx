import { useId, useRef, type ReactNode } from 'react';
import { cartonDisplayDims, describeBoxCounts } from '../engine/analytics/analytics';
import { describeRun, stackRuns } from '../engine/analytics/stack';
import { formatDims, formatNumber } from '../engine/units/units';
import { Mascot } from './Mascot';
import { StaleBadge } from './StaleBadge';
import { useStatusContent } from './StatusMessages';
import { useResults } from './StoreContext';
import { useSelectedAnalytics } from './useSelectedAnalytics';

const NO_LAYOUT = 'Enter the three sizes to see what to build.';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm heading text-gray-500 dark:text-harbor-mist">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Basic mode's plain build instructions for the selected layout: the carton, the stack from
 * the bottom, and the finished load. Every number comes from the result, not the draft.
 * Renders nothing when the status messages already explain an empty or failed result, or
 * while a first calculation runs.
 */
export function WhatToBuildCard() {
  const headingId = useId();
  const selected = useSelectedAnalytics();
  const best = useResults((s) => s.result?.layouts[0] ?? null);
  const select = useResults((s) => s.select);
  const running = useResults((s) => s.status === 'running');
  const { error, empty } = useStatusContent();
  const heading = useRef<HTMLHeadingElement>(null);

  const showBest = () => {
    select(0);
    // The note and its button go away; keep the keyboard user in the card.
    heading.current?.focus();
  };

  // The status messages above already say why there is nothing to build, or that the
  // calculation failed; a card for the previous inputs would contradict them.
  if (error || empty) return null;

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
          <div className="space-y-2 border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-harbor-foam/40 dark:bg-harbor-raised dark:text-harbor-foam">
            <p>
              Showing layout {ranked.rank}, chosen in Full view. Layout 1 fits{' '}
              {best.layout.totalProducts} boxes.
            </p>
            <button
              type="button"
              onClick={showBest}
              className="focus-ticks border border-blue-300 bg-white px-2 py-1 text-sm text-blue-800 hover:bg-blue-100 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline"
            >
              Use layout 1
            </button>
          </div>
        )}
        <Part title="Carton">
          <dl className="bracket divide-y divide-gray-100 dark:divide-harbor-foam/40">
            {carton.map(([label, value]) => (
              <div key={label} className="px-3 py-1.5">
                <dt className="text-xs text-gray-600 dark:text-harbor-mist">{label}</dt>
                <dd className="text-base tabular-nums text-gray-900 dark:text-harbor-foam">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Part>
        <div className="root-divider" aria-hidden="true" />
        <Part title="Stack, from the bottom">
          {/* role="list" keeps list semantics in Safari, which drops them with list-style none. */}
          <ol role="list" className="space-y-1.5">
            {stackRuns(layout).map((run) => (
              <li
                key={run.from}
                className="border-l-4 border-blue-500 bg-gray-50 px-3 py-2 text-base text-gray-900 dark:border-l-2 dark:border-harbor-teal dark:bg-harbor-raised dark:text-harbor-foam"
              >
                {describeRun(run)}
              </li>
            ))}
          </ol>
        </Part>
        <div className="root-divider" aria-hidden="true" />
        <Part title="Finished load">
          <p className="text-base tabular-nums text-gray-900 dark:text-harbor-foam">
            {`${formatNumber(p.loadLength)} × ${formatNumber(p.loadWidth)} × ${formatNumber(p.totalLoadHeight)} in (including pallet)`}
          </p>
        </Part>
      </>
    );
  } else if (!running) {
    body = (
      <div className="flex items-center gap-3">
        <Mascot pose="idle" size={64} />
        <p className="text-sm text-gray-600 dark:text-harbor-mist">{NO_LAYOUT}</p>
      </div>
    );
  } else {
    // "Calculating…" above says a first calculation is under way.
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="bracket space-y-4 bg-white p-4 dark:bg-harbor-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          ref={heading}
          id={headingId}
          tabIndex={-1}
          className="heading text-lg text-gray-900 focus:outline-none dark:text-harbor-foam"
        >
          What to build
        </h2>
        <StaleBadge />
      </div>
      {body}
    </section>
  );
}
