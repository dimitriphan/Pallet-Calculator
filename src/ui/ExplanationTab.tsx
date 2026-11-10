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
      <table className="w-full rounded border border-gray-200 bg-white text-sm dark:border-gray-700 dark:bg-gray-900">
        <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Score of layout {ranked.rank}
        </caption>
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
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
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(([name, value, weight, contribution]) => (
            <tr key={name}>
              <th
                scope="row"
                className="px-2 py-1 text-left font-normal text-gray-700 dark:text-gray-300"
              >
                {name}
              </th>
              <td className={cell}>{formatNumber(value)}</td>
              <td className={cell}>{formatNumber(weight)}</td>
              <td className={cell}>{formatNumber(contribution)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 dark:border-gray-700">
          <tr>
            <th
              scope="row"
              colSpan={3}
              className="px-2 py-1 text-left font-semibold text-gray-900 dark:text-gray-100"
            >
              Final score
            </th>
            <td className={`${cell} font-semibold text-blue-700 dark:text-blue-400`}>
              {formatNumber(s.total)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
        {ranked.explanation}
      </p>
    </div>
  );
}
