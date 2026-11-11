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
import { describeLayerList, PINWHEEL_NOTE, stackPatterns } from '../engine/analytics/stack';
import { cartonPlacements } from '../engine/packing/positions';
import type { Unit } from '../engine/units/units';
import { dimsText, fmtCount, lengthText, pairText, roomText, weightText } from '../ui/format';
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
/** One block of a layer drawing: the region its cartons cover and its "rows × columns". */
export interface SheetBlock extends SheetRect {
  label: string;
}
export interface SheetPattern {
  letter: string;
  heading: string;
  facts: SheetRow[];
  /** How to build the layer; only on a pinwheel pattern. */
  note?: string;
  drawing: {
    footprint: { x: number; y: number };
    pallet: SheetRect;
    cartons: SheetRect[];
    blocks: SheetBlock[];
  };
}
/** Says which outline in the layer drawings is the pallet and which the overhang limit. */
export interface DrawingKey {
  palletSize: string;
  limitSize: string;
  text: string;
}
export interface BuildSheet {
  title: 'Pallet build sheet';
  jobName: string | null;
  dateText: string;
  /** Page 1 note when the selected layout is not layout 1, else null. */
  layoutNote: string | null;
  stale: boolean;
  summary: SheetRow[];
  carton: SheetRow[];
  palletAndLoad: SheetRow[];
  patterns: SheetPattern[];
  /** Present only when the usable footprint differs from the pallet (overhang). */
  drawingKey: DrawingKey | null;
  stacking: {
    layer: number;
    pattern: string;
    cartons: number;
    height: string;
    topHeight: string;
    /** The layer's weight; only when the box weight was set. */
    weight?: string;
  }[];
  footer: string;
  layoutLabel: string;
  /** The unit every length in the text is in; drawing coordinates stay in inches. */
  unit: Unit;
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

/** Total and per-carton weight, then the trim and the room left when there is a maximum. */
function weightRows(
  w: NonNullable<ReturnType<typeof computeAnalytics>['weight']>,
  weightOf: (lb: number) => string,
): SheetRow[] {
  const rows: SheetRow[] = [
    {
      label: 'Total weight',
      value:
        w.max === null ? weightOf(w.total) : `${weightOf(w.total)} (maximum ${weightOf(w.max)})`,
    },
    { label: 'Weight per carton', value: weightOf(w.perCarton) },
  ];
  if (w.layersRemoved > 0)
    rows.push({
      label: 'Limited by weight',
      value: `${fmtCount(w.layersRemoved)} ${w.layersRemoved === 1 ? 'layer' : 'layers'} removed`,
    });
  if (w.roomForCartons >= 1)
    rows.push({ label: 'Room by weight', value: roomText(w.roomForCartons) });
  return rows;
}

export function buildSheetContent(a: {
  inputs: Inputs;
  result: OptimizeResult;
  selectedIndex: number;
  jobName: string;
  stale: boolean;
  now: Date;
  /** Display unit of the text; inches when omitted. */
  unit?: Unit;
}): BuildSheet {
  const { inputs, result, selectedIndex } = a;
  const unit = a.unit ?? 'in';
  const length = (n: number) => lengthText(n, unit);
  const sizeText = (x: number, y: number) => pairText(x, y, unit);
  const ranked = result.layouts[selectedIndex];
  if (!ranked) throw new Error(`No layout at index ${selectedIndex}`);
  const layout = ranked.layout;
  const best = result.layouts[0];
  const analytics = computeAnalytics(layout, inputs);
  const { summary, pallet, weight } = analytics;
  const weightOf = (lb: number) => weightText(lb, unit);

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
    // Placements come block by block, rows × cols each: each block's region bounds its run.
    const blocks: SheetBlock[] = [];
    let next = 0;
    for (const b of layer.blocks) {
      const run = cartons.slice(next, next + b.rows * b.cols);
      next += run.length;
      if (run.length === 0) continue;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const c of run) {
        x0 = Math.min(x0, c.x);
        y0 = Math.min(y0, c.y);
        x1 = Math.max(x1, c.x + c.dx);
        y1 = Math.max(y1, c.y + c.dy);
      }
      blocks.push({
        x: x0,
        y: y0,
        dx: x1 - x0,
        dy: y1 - y0,
        label: `${b.rows} × ${b.cols}`,
      });
    }
    const first = cartons[0];
    const mixed = layer.blocks.some((b) => b.rotated) && layer.blocks.some((b) => !b.rotated);
    const footprintText = first
      ? `${sizeText(first.dx, first.dy)}${mixed ? ' (some turned 90°)' : ''}`
      : '';
    return {
      letter: p.letter,
      heading: `Pattern ${p.letter}: ${describeLayerList(p.layerNumbers)}`,
      facts: [
        { label: 'Cartons in layer', value: String(p.cartonsPerLayer) },
        { label: 'Carton footprint as placed', value: footprintText },
        { label: 'Layer height', value: length(p.height) },
        { label: 'Side facing up', value: SIDE_UP[p.vertical] },
        {
          label: 'Blocks (rows × columns)',
          value: layer.blocks.map((b) => `${b.rows} × ${b.cols}`).join(', '),
        },
      ],
      drawing: { footprint: { ...footprint }, pallet: { ...palletRect }, cartons, blocks },
      ...(p.kind === 'pinwheel' ? { note: PINWHEEL_NOTE } : {}),
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
      height: length(layer.height),
      topHeight: length(top),
      ...(weight ? { weight: weightOf(weight.perLayer[i] as number) } : {}),
    };
  });

  const palletAndLoad: SheetRow[] = [
    {
      label: 'Pallet',
      value: `${sizeText(inputs.pallet.length, inputs.pallet.width)}, ${length(PALLET_HEIGHT)} tall`,
    },
    ...(inputs.overhang > 0
      ? [
          {
            label: 'Overhang',
            value: `${length(inputs.overhang)} total, ${length(inputs.overhang / 2)} each side`,
          },
        ]
      : []),
    { label: 'Usable stacking height', value: length(pallet.usableHeight) },
    {
      label: 'Finished load',
      value: `${dimsText({ length: pallet.loadLength, width: pallet.loadWidth, height: pallet.totalLoadHeight }, unit)} including pallet`,
    },
    ...(weight ? weightRows(weight, weightOf) : []),
  ];

  const palletSize = sizeText(palletRect.dx, palletRect.dy);
  const limitSize = sizeText(footprint.x, footprint.y);
  const drawingKey: DrawingKey | null =
    inputs.overhang > 0
      ? {
          palletSize,
          limitSize,
          text: `Solid line: pallet ${palletSize}. Dashed line: limit with overhang ${limitSize}.`,
        }
      : null;

  const sheet: BuildSheet = {
    title: 'Pallet build sheet',
    jobName: trimmed === '' ? null : trimmed,
    dateText: localMinute(a.now),
    layoutNote:
      selectedIndex > 0 && best
        ? `Layout ${selectedIndex + 1} of ${result.layouts.length} selected. Layout 1 fits ${best.layout.totalProducts} boxes.`
        : null,
    stale: a.stale,
    summary: [
      { label: 'Boxes per carton', value: String(summary.boxesPerCarton) },
      { label: 'Cartons per layer', value: summary.cartonsPerLayer },
      { label: 'Layers', value: String(summary.layers) },
      { label: 'Cartons per pallet', value: String(summary.cartonsPerPallet) },
      { label: 'Total boxes per pallet', value: String(summary.totalBoxes) },
    ],
    carton: [
      { label: 'Outer size', value: dimsText(cartonDisplayDims(layout, 'outer'), unit) },
      { label: 'Inner size', value: dimsText(cartonDisplayDims(layout, 'inner'), unit) },
      { label: 'Boxes per carton', value: String(layout.carton.boxesPerCarton) },
      {
        label: 'Boxes inside',
        value: `${describeBoxCounts(analytics.carton.counts)} along the box's length × width × height`,
      },
    ],
    palletAndLoad,
    patterns,
    drawingKey,
    stacking,
    footer:
      settingsSummary(inputs, unit) +
      ` Desired boxes per carton: ${
        inputs.boxesPerCarton !== null ? fmtCount(inputs.boxesPerCarton) : 'best fit'
      }.`,
    layoutLabel: `Layout ${selectedIndex + 1} of ${result.layouts.length}`,
    unit,
  };
  return safeDeep(sheet);
}
