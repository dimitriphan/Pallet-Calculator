/**
 * The content of the printable build sheet, as plain data. Pure: no DOM, no PDF library.
 * Every number and drawing coordinate comes from the same analytics and placement functions
 * the screen uses, taken from the inputs the result was computed from.
 */
import { PALLET_HEIGHT } from '../domain/constants';
import type { Inputs, OptimizeResult, ProductAxis } from '../domain/types';
import {
  cartonDisplayDims,
  computeAnalytics,
  describeBoxCounts,
} from '../engine/analytics/analytics';
import { describeLayerList, stackPatterns } from '../engine/analytics/stack';
import { cartonPlacements } from '../engine/packing/positions';
import { formatDims, formatNumber } from '../engine/units/units';
import { settingsSummary } from '../ui/settingsSummary';

export interface SheetRow {
  label: string;
  value: string;
}
export interface SheetRect {
  x: number;
  y: number;
  dx: number;
  dy: number;
}
export interface SheetPattern {
  letter: string;
  heading: string;
  facts: SheetRow[];
  drawing: { footprint: { x: number; y: number }; pallet: SheetRect; cartons: SheetRect[] };
}
export interface BuildSheet {
  title: 'Pallet build sheet';
  jobName: string | null;
  dateText: string;
  stale: boolean;
  summary: SheetRow[];
  carton: SheetRow[];
  palletAndLoad: SheetRow[];
  patterns: SheetPattern[];
  stacking: {
    layer: number;
    pattern: string;
    cartons: number;
    height: string;
    topHeight: string;
  }[];
  footer: string;
  layoutLabel: string;
}

const MAX_JOB_NAME = 80;
const SIDE_UP: Record<ProductAxis, string> = {
  L: 'Product length',
  W: 'Product width',
  H: 'Product height',
};

/** The PDF uses built-in Helvetica (Latin-1): map or replace anything it cannot draw. */
export function pdfSafe(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    const code = text.charCodeAt(i);
    if (c === '–' || c === '—') out += '-';
    else if (c === '“' || c === '”' || c === '„') out += '"';
    else if (c === '‘' || c === '’' || c === '‚') out += "'";
    else out += code > 0xff ? '?' : c;
  }
  return out;
}

/** Applies pdfSafe to every string in a plain data structure. */
function safeDeep<T>(value: T): T {
  if (typeof value === 'string') return pdfSafe(value) as T;
  if (Array.isArray(value)) return value.map((v) => safeDeep(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safeDeep(v)])) as T;
  }
  return value;
}

const inches = (n: number) => `${formatNumber(n)} in`;

function localMinute(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** pallet-build-sheet-YYYYMMDD-HHmmss.pdf, in the viewer's local time. */
export function buildSheetFilename(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const date = `${p(now.getFullYear(), 4)}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `pallet-build-sheet-${date}-${time}.pdf`;
}

export function buildSheetContent(a: {
  inputs: Inputs;
  result: OptimizeResult;
  selectedIndex: number;
  jobName: string;
  stale: boolean;
  now: Date;
}): BuildSheet {
  const { inputs, result, selectedIndex } = a;
  const ranked = result.layouts[selectedIndex];
  if (!ranked) throw new Error(`No layout at index ${selectedIndex}`);
  const layout = ranked.layout;
  const analytics = computeAnalytics(layout, inputs);
  const { summary, pallet } = analytics;

  const trimmed = a.jobName.trim().slice(0, MAX_JOB_NAME);
  const placements = cartonPlacements(layout, inputs);
  const footprint = pallet.usableFootprint;
  const palletRect: SheetRect = {
    x: inputs.overhang / 2,
    y: inputs.overhang / 2,
    dx: inputs.pallet.length,
    dy: inputs.pallet.width,
  };

  const patterns: SheetPattern[] = stackPatterns(layout).map((p) => {
    const layer = layout.layers[p.layerIndex];
    if (!layer) throw new Error(`No layer at index ${p.layerIndex}`);
    const cartons = placements
      .filter((c) => c.layerIndex === p.layerIndex)
      .map((c) => ({ x: c.x, y: c.y, dx: c.dx, dy: c.dy }));
    const first = cartons[0];
    const mixed = layer.blocks.some((b) => b.rotated) && layer.blocks.some((b) => !b.rotated);
    const footprintText = first
      ? `${formatNumber(first.dx)} × ${formatNumber(first.dy)} in${mixed ? ' (some turned 90°)' : ''}`
      : '';
    return {
      letter: p.letter,
      heading: `Pattern ${p.letter}: ${describeLayerList(p.layerNumbers)}`,
      facts: [
        { label: 'Cartons in layer', value: String(p.cartonsPerLayer) },
        { label: 'Carton footprint as placed', value: footprintText },
        { label: 'Layer height', value: inches(p.height) },
        { label: 'Side facing up', value: SIDE_UP[p.vertical] },
        { label: 'Blocks', value: layer.blocks.map((b) => `${b.rows} × ${b.cols}`).join(', ') },
      ],
      drawing: { footprint: { ...footprint }, pallet: { ...palletRect }, cartons },
    };
  });

  const letterOfLayer = new Map<number, string>();
  for (const p of stackPatterns(layout))
    for (const n of p.layerNumbers) letterOfLayer.set(n, p.letter);
  let top = PALLET_HEIGHT;
  const stacking = layout.layers.map((layer, i) => {
    top += layer.height;
    return {
      layer: i + 1,
      pattern: letterOfLayer.get(i + 1) ?? '',
      cartons: layer.cartonCount,
      height: inches(layer.height),
      topHeight: inches(top),
    };
  });

  const palletAndLoad: SheetRow[] = [
    {
      label: 'Pallet',
      value: `${formatNumber(inputs.pallet.length)} × ${formatNumber(inputs.pallet.width)} in, ${inches(PALLET_HEIGHT)} tall`,
    },
    ...(inputs.overhang > 0
      ? [
          {
            label: 'Overhang',
            value: `${inches(inputs.overhang)} total, ${inches(inputs.overhang / 2)} each side`,
          },
        ]
      : []),
    { label: 'Usable stacking height', value: inches(pallet.usableHeight) },
    {
      label: 'Finished load',
      value: `${formatNumber(pallet.loadLength)} × ${formatNumber(pallet.loadWidth)} × ${formatNumber(pallet.totalLoadHeight)} in including pallet`,
    },
  ];

  const sheet: BuildSheet = {
    title: 'Pallet build sheet',
    jobName: trimmed === '' ? null : trimmed,
    dateText: localMinute(a.now),
    stale: a.stale,
    summary: [
      { label: 'Boxes per carton', value: String(summary.boxesPerCarton) },
      { label: 'Cartons per layer', value: summary.cartonsPerLayer },
      { label: 'Layers', value: String(summary.layers) },
      { label: 'Cartons per pallet', value: String(summary.cartonsPerPallet) },
      { label: 'Total boxes per pallet', value: String(summary.totalBoxes) },
    ],
    carton: [
      { label: 'Outer size', value: `${formatDims(cartonDisplayDims(layout, 'outer'))} in` },
      { label: 'Inner size', value: `${formatDims(cartonDisplayDims(layout, 'inner'))} in` },
      { label: 'Boxes per carton', value: String(layout.carton.boxesPerCarton) },
      {
        label: 'Boxes inside',
        value: `${describeBoxCounts(analytics.carton.counts)} along the box's length × width × height`,
      },
    ],
    palletAndLoad,
    patterns,
    stacking,
    footer:
      settingsSummary(inputs) +
      (inputs.boxesPerCarton !== null
        ? ` Desired boxes per carton: ${formatNumber(inputs.boxesPerCarton, 0)}.`
        : ''),
    layoutLabel: `Layout ${selectedIndex + 1} of ${result.layouts.length}`,
  };
  return safeDeep(sheet);
}
