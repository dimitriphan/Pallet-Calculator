import {
  describeBoxCounts,
  describeLayerOrientations,
  type TargetStatus,
} from '../engine/analytics/analytics';
import type { RotationMode, StabilityRating } from '../domain/types';
import { describeWarning } from '../engine/analytics/stability';
import type { Unit } from '../engine/units/units';
import {
  dimsText,
  fmtDecimal,
  fmtPct,
  formatLength,
  formatVolume,
  formatWeight,
  ratioText,
  shareText,
  unitLabel,
  volumeLabel,
  weightLabel,
  withUnit,
} from '../ui/format';
import { LAYER_PATTERN_LABEL } from '../ui/layerPattern';
import { BELOW_MINIMUM, MIN_STABILITY_LABEL } from '../ui/minStability';
import { flagLines } from '../ui/manualFlags';
import { outsideVolume } from '../ui/outsideVolume';
import { isManualSelected, type ExportPayload } from './exportData';

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** One CSV field: formula-looking text is prefixed with ' and risky text is quoted. */
export function csvField(value: string): string {
  let text = value;
  if (/^[=+@\t\r]/.test(text) || (text.startsWith('-') && !PLAIN_NUMBER.test(text)))
    text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const ROTATION: Record<RotationMode, string> = {
  full: 'Fully rotatable',
  upright: 'Keep upright',
  noSide: 'No side rotation',
  custom: 'Custom',
};

const TARGET: Record<TargetStatus, string> = {
  none: 'No target',
  met: 'Target met',
  exceeded: 'Target exceeded',
  notAchievable: 'Target not achievable',
};

type Row = [string, string | number];

/** As the editor's choice is worded. */
export const UPPER_LAYERS_TEXT = {
  same: 'All the same',
  alternate: 'Alternate layers turned',
} as const;

/** Added to the choice where it changes nothing, wherever the choice is reported. */
export const UPPER_LAYERS_NO_EFFECT = 'no effect: the layer is the same after a half turn';

/**
 * A manual layout's upper-layers choice in words. "Alternate layers turned" is said to have no
 * effect when the layer is the same after a half turn, so that no report claims layers are
 * turned while the stability figures say none is.
 */
export function upperLayersText(manual: {
  upperLayers: keyof typeof UPPER_LAYERS_TEXT;
  upperLayersNoEffect?: boolean;
}): string {
  const text = UPPER_LAYERS_TEXT[manual.upperLayers];
  return manual.upperLayers === 'alternate' && manual.upperLayersNoEffect
    ? `${text} (${UPPER_LAYERS_NO_EFFECT})`
    : text;
}

const RATING: Record<StabilityRating, string> = { good: 'Good', fair: 'Fair', poor: 'Poor' };

/**
 * Two sections: Metric,Value rows, a blank line, then the layout comparison table. Lengths and
 * volumes are in `unit` (cm³ for mm), with the unit in each title.
 */
export function buildCsv(p: ExportPayload, unit: Unit = 'in'): string {
  const { inputs: i, analytics: a, selectedLayout: sel } = p;
  const n = (v: number) => fmtDecimal(v);
  const len = (v: number) => formatLength(v, unit);
  const vol = (v: number) => formatVolume(v, unit);
  const L = (title: string) => withUnit(title, unitLabel(unit));
  const V = (title: string) => withUnit(title, volumeLabel(unit));
  const wt = (v: number) => formatWeight(v, unit);
  const W = (title: string) => withUnit(title, weightLabel(unit));
  const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
  const ratio = (v: number) => ratioText(v);
  const share = (v: number) => shareText(v);
  const st = a.stability;
  const outside = outsideVolume(a);
  // A manual layout was not ranked or scored: it is named, with its flags, and nothing of a
  // ranking is written (no rank, no score rows, no comparison table).
  const manual = isManualSelected(sel) ? sel.manual : null;
  const manualRows: Row[] = manual
    ? [
        [
          'Manual layout flags',
          // As on screen: an out-of-date layout is shown as it was made and is not checked
          // against inputs that no longer apply.
          manual.status === 'outOfDate'
            ? 'Not checked: this layout is out of date'
            : flagLines(manual.flags, unit)
                .map((f) => f.text)
                .join('; ') || 'None',
        ],
        ['Upper layers', upperLayersText(manual)],
        ...(manual.status === 'outOfDate'
          ? ([
              ['Made for product', dimsText(manual.madeFor.product, unit)],
              [L('Made for carton wall thickness'), len(manual.madeFor.wallThickness)],
              [L('Made for box leeway'), len(manual.madeFor.leeway)],
            ] as Row[])
          : []),
      ]
    : [];
  const rows: Row[] = [
    ['Exported at', p.exportedAt],
    ['Selected layout', manual ? `Manual: ${manual.name}` : (sel.rank ?? '')],
    ['Status', p.status],
    ...manualRows,
    [L('Pallet length'), len(i.pallet.length)],
    [L('Pallet width'), len(i.pallet.width)],
    [L('Pallet height'), len(i.pallet.height)],
    [L('Product length'), len(i.product.length)],
    [L('Product width'), len(i.product.width)],
    [L('Product height'), len(i.product.height)],
    [L('Max carton length'), len(i.maxCarton.length)],
    [L('Max carton width'), len(i.maxCarton.width)],
    [L('Max carton height'), len(i.maxCarton.height)],
    ['Target quantity', i.targetQuantity === null ? '' : i.targetQuantity],
    ['Desired boxes per carton', i.boxesPerCarton === null ? '' : i.boxesPerCarton],
    [L('Box leeway'), len(i.leeway)],
    [L('Carton wall thickness'), len(i.wallThickness)],
    [L('Pallet overhang'), len(i.overhang)],
    ['Product rotation', ROTATION[i.rotationMode]],
    ['Custom orientations', i.rotationMode === 'custom' ? i.customOrientations.join(' ') : ''],
    ['Keep cartons upright', yesNo(i.keepCartonsUpright)],
    ['Minimum stability', MIN_STABILITY_LABEL[i.minStability]],
    ['Layer pattern', LAYER_PATTERN_LABEL[i.layerPattern]],
    // What those two settings did to the result, as the screen says it; blank when nothing.
    ['Result notes', p.notes.join(' ')],
    [L('Usable stacking height'), len(a.pallet.usableHeight)],
    [L('Carton inner length'), len(a.carton.inner.length)],
    [L('Carton inner width'), len(a.carton.inner.width)],
    [L('Carton inner height'), len(a.carton.inner.height)],
    [L('Carton outer length'), len(a.carton.outer.length)],
    [L('Carton outer width'), len(a.carton.outer.width)],
    [L('Carton outer height'), len(a.carton.outer.height)],
    ['Boxes along product length × width × height', describeBoxCounts(a.carton.counts)],
    ['Product side facing up', describeLayerOrientations(a.carton.layerOrientations)],
    ['Boxes per carton', a.summary.boxesPerCarton],
    ['Cartons per layer', a.summary.cartonsPerLayer],
    ['Layers', a.summary.layers],
    ['Cartons per pallet', a.summary.cartonsPerPallet],
    ['Total boxes per pallet', a.summary.totalBoxes],
    [L('Load length'), len(a.pallet.loadLength)],
    [L('Load width'), len(a.pallet.loadWidth)],
    [L('Load total height'), len(a.pallet.totalLoadHeight)],
    [V('Volume used'), vol(a.totals.volumeUsed)],
    // Only for a layout placed by hand with cartons outside: "Volume used" leaves this out.
    ...(outside ? ([[V(outside.label), vol(outside.volume)]] as Row[]) : []),
    [V('Volume available'), vol(a.totals.volumeAvailable)],
    ['Utilization (%)', n(a.totals.utilizationPct)],
    [V('Remaining volume'), vol(a.totals.remainingVolume)],
    [L('Remaining height'), len(a.pallet.remainingHeight)],
    ['Target status', TARGET[a.target.status]],
    ['Maximum quantity possible', a.target.maxPossible],
    ['Cartons needed for target', a.target.cartonsNeeded ?? ''],
    ['Layers needed for target', a.target.layersNeeded ?? ''],
    // Stability: blank for a layout stored before layouts were rated.
    ['Stability rating', st ? RATING[st.rating] : ''],
    // The mark the screen puts beside the rating when nothing reached the minimum.
    ['Stability mark', p.belowMinimum ? BELOW_MINIMUM : ''],
    ['Stability warnings', st ? st.warnings.map(describeWarning).join(' ') : ''],
    [
      // A layout placed by hand whose bottom layer stands in separate groups.
      (st?.measures.freeStandingGroups ?? 1) > 1
        ? 'Stack height ÷ shorter side of the narrowest free-standing group'
        : 'Stack height ÷ shorter side of base',
      st ? ratio(st.measures.stackHeightRatio) : '',
    ],
    [
      'Carton height ÷ shorter base side, worst layer',
      st?.measures.cartonHeight ? ratio(st.measures.cartonHeight.ratio) : '',
    ],
    [
      'Least support from the layer below',
      st?.measures.support ? share(st.measures.support.share) : '',
    ],
    // Only for a layout placed by hand: calculated layouts keep the rows they had.
    ...(st?.measures.deck
      ? ([
          ['Least share of a bottom carton resting on the pallet', share(st.measures.deck.share)],
        ] as Row[])
      : []),
    ['Layers turned half a turn (180°)', st ? st.turnedLayers.join(' ') : ''],
    ...(sel.score
      ? ([
          ['Overall score', n(sel.score.total)],
          ['Quantity contribution', n(sel.score.quantityContribution)],
          ['Utilization contribution', n(sel.score.utilizationContribution)],
          ['Space contribution', n(sel.score.spaceContribution)],
        ] as Row[])
      : []),
  ];
  // Weight is reported only when the box weight was set; otherwise the file is as before.
  const w = a.weight;
  if (w) {
    rows.push(
      [W('Weight per product box'), i.weights.productBox === null ? '' : wt(i.weights.productBox)],
      [W('Maximum pallet weight'), i.weights.maxPallet === null ? '' : wt(i.weights.maxPallet)],
      [W('Empty carton weight'), wt(i.weights.emptyCarton)],
      [W('Pallet weight'), wt(i.weights.pallet)],
      [W('Total weight'), wt(w.total)],
      [W('Weight per carton'), wt(w.perCarton)],
      [W('Weight per layer'), w.perLayer.map(wt).join(' ')],
      [L('Centre of mass height above floor'), len(w.centreOfMassHeight)],
      ['Layers removed for weight', w.layersRemoved],
    );
    // Only for a load trimmed by weight: otherwise the height is the limit.
    if (w.layersRemoved >= 1) rows.push(['Room for more cartons by weight', w.roomForCartons]);
  }
  const weighed = p.comparison.some((c) => c.weight !== undefined);
  // "Pinwheel" where the table shows the badge; the column only when some layout has one.
  const patterned = p.comparison.some((c) => c.pinwheel);

  const header = [
    '#',
    L('Carton'),
    'Products',
    'Cartons',
    'Layers',
    ...(patterned ? ['Pattern'] : []),
    'Stability',
    'Utilization',
    ...(weighed ? [W('Weight')] : []),
    V('Remaining volume'),
    'Score',
  ];
  const table = p.comparison.map((c) => [
    c.rank,
    `${len(c.carton.length)} × ${len(c.carton.width)} × ${len(c.carton.height)}`,
    c.products,
    c.cartons,
    c.layers,
    ...(patterned ? [c.pinwheel ? 'Pinwheel' : ''] : []),
    c.stability ? `${RATING[c.stability]}${p.belowMinimum ? ` (${BELOW_MINIMUM})` : ''}` : '',
    fmtPct(c.utilizationPct),
    ...(weighed ? [c.weight === undefined ? '' : wt(c.weight)] : []),
    vol(c.remainingVolume),
    n(c.score),
  ]);

  const line = (cells: (string | number)[]) => cells.map((c) => csvField(String(c))).join(',');
  // A manual layout is not ranked against the calculated ones: no comparison table.
  if (manual) return [line(['Metric', 'Value']), ...rows.map(line), ''].join('\r\n');
  return [
    line(['Metric', 'Value']),
    ...rows.map(line),
    '',
    line(header),
    ...table.map(line),
    '',
  ].join('\r\n');
}
