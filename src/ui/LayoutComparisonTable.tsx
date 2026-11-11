import { useMemo, type KeyboardEvent } from 'react';
import {
  computeAnalytics,
  cartonDisplayDims,
  type TargetStatus,
} from '../engine/analytics/analytics';
import { hasPinwheelLayer } from '../engine/analytics/stack';
import {
  fmtDecimal,
  fmtPct,
  formatDims,
  formatVolume,
  formatWeight,
  unitLabel,
  volumeLabel,
  weightLabel,
  weightTrimText,
  withUnit,
} from './format';
import { useUnit } from './useUnit';
import { StabilityBadge } from './StabilityBadge';
import { StatusMessages } from './StatusMessages';
import { useResults } from './StoreContext';

/** "Pinwheel" under the layer count of a layout that has a pinwheel layer. */
const PINWHEEL_BADGE =
  'bg-gray-100 text-gray-800 dark:border dark:border-harbor-foam/40 dark:bg-harbor-raised dark:text-harbor-foam';

/**
 * Limited-by-weight note under a layout's products, wrapped onto two lines so neither its
 * column nor the Weight column grows wide enough to push the table past its panel.
 */
const WEIGHT_BADGE =
  'w-[6.5rem] bg-amber-100 text-amber-900 dark:bg-harbor-sand dark:text-harbor-deep';

const TARGET_BADGE: Record<Exclude<TargetStatus, 'none'>, { label: string; className: string }> = {
  met: {
    label: 'Target met',
    className: 'bg-green-100 text-green-800 dark:bg-harbor-green dark:text-harbor-deep',
  },
  exceeded: {
    label: 'Target exceeded',
    className: 'bg-blue-100 text-blue-800 dark:bg-harbor-green dark:text-harbor-deep',
  },
  notAchievable: {
    label: 'Target not achievable',
    className:
      'bg-red-100 text-red-800 dark:border dark:border-harbor-coral dark:bg-harbor-raised dark:text-harbor-foam',
  },
};

/** Every returned layout side by side; a row click selects it everywhere. */
export function LayoutComparisonTable() {
  const result = useResults((s) => s.result);
  const inputs = useResults((s) => s.inputs);
  const selectedIndex = useResults((s) => s.selectedIndex);
  const select = useResults((s) => s.select);
  const unit = useUnit();
  // Weight is shown only when the result was computed with a box weight.
  const weighed = !!inputs && inputs.weights.productBox !== null;

  const rows = useMemo(
    () =>
      result && inputs
        ? result.layouts.map((r) => ({ ranked: r, analytics: computeAnalytics(r.layout, inputs) }))
        : [],
    [result, inputs],
  );

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(index);
    }
  };

  const th = 'whitespace-nowrap px-1 py-1.5 font-medium';
  const td = 'whitespace-nowrap px-1 py-1.5 tabular-nums';
  return (
    <section aria-labelledby="comparison-heading" className="shrink-0 space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="comparison-heading" className="heading text-sm text-gray-900 dark:text-harbor-foam">
          Layout comparison
        </h2>
      </div>
      <StatusMessages />
      {rows.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 bg-white dark:border-harbor-foam/40 dark:bg-harbor-panel">
          <table aria-label="Layout comparison" className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-harbor-foam/40 dark:bg-harbor-raised dark:text-harbor-mist">
              <tr>
                <th scope="col" className={`${th} w-8`}>
                  #
                </th>
                <th scope="col" className={th}>
                  {withUnit('Carton', unitLabel(unit))}
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
                <th scope="col" className={th}>
                  Stability
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Utilization
                </th>
                {weighed && (
                  <th scope="col" className={`${th} text-right`}>
                    {withUnit('Weight', weightLabel(unit))}
                  </th>
                )}
                <th scope="col" className={`${th} text-right`}>
                  {withUnit('Remaining volume', volumeLabel(unit))}
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
                    className={`focus-ticks-row cursor-pointer border-b border-gray-100 last:border-b-0 dark:border-harbor-foam/40 dark:border-l-[3px] ${
                      selected
                        ? 'bg-blue-50 text-blue-950 dark:border-l-harbor-green dark:bg-harbor-raised dark:font-semibold dark:text-harbor-foam'
                        : 'hover:bg-gray-50 dark:border-l-transparent dark:text-harbor-foam dark:hover:bg-harbor-raised'
                    }`}
                  >
                    <td className={td}>{ranked.rank}</td>
                    <td className={td}>
                      {formatDims(cartonDisplayDims(ranked.layout, 'outer'), unit)}
                    </td>
                    <td className={`${td} text-right`}>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold">{ranked.layout.totalProducts}</span>
                        {badge && (
                          <span
                            className={`whitespace-nowrap px-1.5 text-[11px] leading-4 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        )}
                        {analytics.weight && analytics.weight.layersRemoved > 0 && (
                          <span
                            className={`whitespace-normal px-1.5 text-right text-[11px] leading-4 ${WEIGHT_BADGE}`}
                          >
                            {weightTrimText(analytics.weight.layersRemoved)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>{ranked.layout.totalCartons}</td>
                    <td className={`${td} text-right`}>
                      {hasPinwheelLayer(ranked.layout) ? (
                        <span className="flex flex-col items-end gap-0.5">
                          <span>{ranked.layout.layers.length}</span>
                          <span
                            className={`whitespace-nowrap px-1.5 text-[11px] leading-4 ${PINWHEEL_BADGE}`}
                          >
                            Pinwheel
                          </span>
                        </span>
                      ) : (
                        ranked.layout.layers.length
                      )}
                    </td>
                    <td className={td}>
                      <StabilityBadge stability={ranked.layout.stability} short />
                    </td>
                    <td className={`${td} text-right`}>
                      {fmtPct(analytics.totals.utilizationPct)}
                    </td>
                    {weighed && (
                      <td className={`${td} text-right`}>
                        {analytics.weight ? formatWeight(analytics.weight.total, unit) : ''}
                      </td>
                    )}
                    <td className={`${td} text-right`}>
                      {formatVolume(analytics.totals.remainingVolume, unit)}
                    </td>
                    <td className={`${td} text-right`}>{fmtDecimal(ranked.score.total)}</td>
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
