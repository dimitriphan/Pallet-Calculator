import { SCORE_WEIGHTS } from '../domain/constants';
import type { RankedLayout } from '../domain/types';
import { formatNumber } from '../engine/units/units';

/** How the selected layout's score is built, and why it ranks where it does. */
export function ExplanationTab({ ranked }: { ranked: RankedLayout }) {
  const s = ranked.score;
  const rows: [string, number, number, number][] = [
    ['Quantity', s.quantity, SCORE_WEIGHTS.quantity, s.quantityContribution],
    ['Utilization', s.utilization, SCORE_WEIGHTS.utilization, s.utilizationContribution],
    ['Space', s.space, SCORE_WEIGHTS.space, s.spaceContribution],
  ];
  const cell = 'px-2 py-1 text-right tabular-nums';
  return (
    <div className="space-y-4">
      <table className="w-full border border-gray-200 bg-white text-sm dark:border-harbor-foam/40 dark:bg-harbor-panel dark:text-harbor-foam">
        <caption className="mb-1 text-left text-xs heading text-gray-500 dark:text-harbor-mist">
          Score of layout {ranked.rank}
        </caption>
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-harbor-foam/40 dark:bg-harbor-raised dark:text-harbor-mist">
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Component
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Value (0–100)
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Weight
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Contribution
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-harbor-foam/40">
          {rows.map(([name, value, weight, contribution]) => (
            <tr key={name}>
              <th
                scope="row"
                className="px-2 py-1 text-left font-medium text-gray-700 dark:text-harbor-mist"
              >
                {name}
              </th>
              <td className={cell}>{formatNumber(value)}</td>
              <td className={cell}>{formatNumber(weight)}</td>
              <td className={cell}>{formatNumber(contribution)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 dark:border-harbor-foam/40">
          <tr>
            <th
              scope="row"
              colSpan={3}
              className="px-2 py-1 text-left font-semibold text-gray-900 dark:text-harbor-foam"
            >
              Final score
            </th>
            <td className={`${cell} font-semibold text-blue-700 dark:text-harbor-foam`}>
              {formatNumber(s.total)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-sm leading-relaxed text-gray-800 dark:text-harbor-foam">
        {ranked.explanation}
      </p>
    </div>
  );
}
