import {
  describeBoxCounts,
  describeLayerOrientations,
  type TargetStatus,
} from '../engine/analytics/analytics';
import { formatNumber } from '../engine/units/units';
import type { RotationMode } from '../domain/types';
import type { ExportPayload } from './exportData';

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

/** Two sections: Metric,Value rows, a blank line, then the layout comparison table. */
export function buildCsv(p: ExportPayload): string {
  const { inputs: i, analytics: a, selectedLayout: sel } = p;
  const n = (v: number) => formatNumber(v);
  const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
  const rows: Row[] = [
    ['Exported at', p.exportedAt],
    ['Selected layout', sel.rank],
    ['Status', p.status],
    ['Pallet length (in)', n(i.pallet.length)],
    ['Pallet width (in)', n(i.pallet.width)],
    ['Pallet height (in)', n(i.pallet.height)],
    ['Product length (in)', n(i.product.length)],
    ['Product width (in)', n(i.product.width)],
    ['Product height (in)', n(i.product.height)],
    ['Max carton length (in)', n(i.maxCarton.length)],
    ['Max carton width (in)', n(i.maxCarton.width)],
    ['Max carton height (in)', n(i.maxCarton.height)],
    ['Target quantity', i.targetQuantity === null ? '' : i.targetQuantity],
    ['Desired boxes per carton', i.boxesPerCarton === null ? '' : i.boxesPerCarton],
    ['Box leeway (in)', n(i.leeway)],
    ['Carton wall thickness (in)', n(i.wallThickness)],
    ['Pallet overhang (in)', n(i.overhang)],
    ['Product rotation', ROTATION[i.rotationMode]],
    ['Custom orientations', i.rotationMode === 'custom' ? i.customOrientations.join(' ') : ''],
    ['Keep cartons upright', yesNo(i.keepCartonsUpright)],
    ['Usable stacking height (in)', n(a.pallet.usableHeight)],
    ['Carton inner length (in)', n(a.carton.inner.length)],
    ['Carton inner width (in)', n(a.carton.inner.width)],
    ['Carton inner height (in)', n(a.carton.inner.height)],
    ['Carton outer length (in)', n(a.carton.outer.length)],
    ['Carton outer width (in)', n(a.carton.outer.width)],
    ['Carton outer height (in)', n(a.carton.outer.height)],
    ['Boxes along product length × width × height', describeBoxCounts(a.carton.counts)],
    ['Product side facing up', describeLayerOrientations(a.carton.layerOrientations)],
    ['Boxes per carton', a.summary.boxesPerCarton],
    ['Cartons per layer', a.summary.cartonsPerLayer],
    ['Layers', a.summary.layers],
    ['Cartons per pallet', a.summary.cartonsPerPallet],
    ['Total boxes per pallet', a.summary.totalBoxes],
    ['Load length (in)', n(a.pallet.loadLength)],
    ['Load width (in)', n(a.pallet.loadWidth)],
    ['Load total height (in)', n(a.pallet.totalLoadHeight)],
    ['Volume used (in³)', n(a.totals.volumeUsed)],
    ['Volume available (in³)', n(a.totals.volumeAvailable)],
    ['Utilization (%)', n(a.totals.utilizationPct)],
    ['Remaining volume (in³)', n(a.totals.remainingVolume)],
    ['Remaining height (in)', n(a.pallet.remainingHeight)],
    ['Target status', TARGET[a.target.status]],
    ['Maximum quantity possible', a.target.maxPossible],
    ['Cartons needed for target', a.target.cartonsNeeded ?? ''],
    ['Layers needed for target', a.target.layersNeeded ?? ''],
    ['Overall score', n(sel.score.total)],
    ['Quantity contribution', n(sel.score.quantityContribution)],
    ['Utilization contribution', n(sel.score.utilizationContribution)],
    ['Space contribution', n(sel.score.spaceContribution)],
  ];

  const header = [
    '#',
    'Carton (in)',
    'Products',
    'Cartons',
    'Layers',
    'Utilization',
    'Remaining volume (in³)',
    'Score',
  ];
  const table = p.comparison.map((c) => [
    c.rank,
    `${n(c.carton.length)} × ${n(c.carton.width)} × ${n(c.carton.height)}`,
    c.products,
    c.cartons,
    c.layers,
    `${n(c.utilizationPct)}%`,
    n(c.remainingVolume),
    n(c.score),
  ]);

  const line = (cells: (string | number)[]) => cells.map((c) => csvField(String(c))).join(',');
  return [
    line(['Metric', 'Value']),
    ...rows.map(line),
    '',
    line(header),
    ...table.map(line),
    '',
  ].join('\r\n');
}
