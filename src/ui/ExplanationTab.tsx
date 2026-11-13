import { SCORE_WEIGHTS } from '../domain/constants';
import type { RankedLayout } from '../domain/types';
import { cartonDisplayDims, describeBoxCounts } from '../engine/analytics/analytics';
import { UPPER_LAYERS_TEXT } from '../export/csv';
import { MANUAL_OUT_OF_DATE_NOTE } from '../export/exportData';
import type { ManualMarker } from '../store/manualLayoutsStore';
import type { SelectedRanked } from '../store/selection';
import { DetailRows } from './DetailRows';
import { FlagList } from './editor/FlagList';
import { NOTE_BOX } from './editor/styles';
import { dimsText, fmtCount, fmtDecimal } from './format';
import { differenceText } from './manualDifference';
import { flagLines } from './manualFlags';
import { BelowMinimumBadge } from './MinimumNotes';
import { isBelowMinimum, MIN_STABILITY_LABEL } from './minStability';
import { useManualLayouts } from './StoreContext';
import { useUnit } from './useUnit';
import { ManualBadge, OutOfDateBadge, useBestCalculated } from './YourLayouts';

/**
 * What the selected layout is and why: for a calculated layout how its score is built and why
 * it ranks where it does; for a manual layout what it is, since it has no rank and no score.
 */
export function ExplanationTab({ ranked }: { ranked: SelectedRanked }) {
  return ranked.manual ? (
    <ManualExplanation ranked={ranked} manual={ranked.manual} />
  ) : (
    <ScoreExplanation ranked={ranked} />
  );
}

/** A manual layout: its name, the carton it is made of, the upper layers, flags, comparison. */
function ManualExplanation({ ranked, manual }: { ranked: SelectedRanked; manual: ManualMarker }) {
  const unit = useUnit();
  const best = useBestCalculated();
  const inputs = useManualLayouts(
    (m) => m.entries.find((e) => e.spec.id === manual.id)?.build.inputs ?? null,
  );
  const { layout } = ranked;
  const outOfDate = manual.status === 'outOfDate';
  const below = !!inputs && isBelowMinimum(layout.stability?.rating, inputs.minStability);
  const rows: [string, string][] = [
    ['Name', manual.name],
    ['Made', 'By hand, in the editor'],
    [
      'Carton',
      `${fmtCount(layout.carton.boxesPerCarton)} ${layout.carton.boxesPerCarton === 1 ? 'box' : 'boxes'}, ${dimsText(cartonDisplayDims(layout, 'outer'), unit)} outside`,
    ],
    ['Boxes along the box length × width × height', describeBoxCounts(layout.carton.counts)],
    ['Upper layers', UPPER_LAYERS_TEXT[manual.upperLayers]],
    ['Total boxes', fmtCount(layout.totalProducts)],
    ...(best !== null && !outOfDate
      ? ([['Compared', differenceText(layout.totalProducts, best)]] as [string, string][])
      : []),
  ];
  return (
    <div className="space-y-3" data-testid="manual-explanation">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs heading text-gray-500 dark:text-harbor-mist">Your layout</span>
        <ManualBadge />
        {outOfDate && <OutOfDateBadge />}
        {below && !outOfDate && <BelowMinimumBadge />}
      </p>
      <DetailRows rows={rows} />
      {outOfDate && (
        <p className={NOTE_BOX}>
          {`${MANUAL_OUT_OF_DATE_NOTE}. It was made for a product of ${dimsText(manual.madeFor.product, unit)} and is shown as it was made. Rebuild or discard it under “Your layouts”.`}
        </p>
      )}
      {below && !outOfDate && inputs && (
        <p className={NOTE_BOX}>
          {`This layout rates below your minimum stability (${MIN_STABILITY_LABEL[inputs.minStability]}). It is kept because you made it.`}
        </p>
      )}
      <FlagList lines={flagLines(manual.flags, unit)} label="Layout flags" />
      <p className="text-sm leading-relaxed text-gray-800 dark:text-harbor-foam">
        You placed the cartons of one layer; the tool stacked that layer as high as the height and
        weight limits allow and checked it like any other layout. A layout made by hand is not
        ranked against the calculated layouts and has no score.
      </p>
    </div>
  );
}

/** How the selected layout's score is built, and why it ranks where it does. */
function ScoreExplanation({ ranked }: { ranked: RankedLayout }) {
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
              <td className={cell}>{fmtDecimal(value)}</td>
              <td className={cell}>{fmtDecimal(weight)}</td>
              <td className={cell}>{fmtDecimal(contribution)}</td>
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
              {fmtDecimal(s.total)}
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
