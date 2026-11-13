/**
 * The content of the printable build sheet, as plain data. Pure: no DOM, no PDF library.
 * Every number and drawing coordinate comes from the same analytics and placement functions
 * the screen uses, taken from the inputs the result was computed from.
 */
import { EPS, PALLET_HEIGHT } from '../domain/constants';
import type { Inputs, Layout, OptimizeResult, ProductAxis } from '../domain/types';
import {
  cartonDisplayDims,
  computeAnalytics,
  describeBoxCounts,
} from '../engine/analytics/analytics';
import {
  describeLayerList,
  PINWHEEL_NOTE,
  stackPatterns,
  turnedPatternsText,
} from '../engine/analytics/stack';
import { describeWarning } from '../engine/analytics/stability';
import { cartonPlacements } from '../engine/packing/positions';
import { footprintAxes } from '../engine/packing/stacking';
import type { Unit } from '../engine/units/units';
import { dimsText, fmtCount, lengthText, pairText, roomText, weightText } from '../ui/format';
import { settingsSummary } from '../ui/settingsSummary';
import { flagLines } from '../ui/manualFlags';
import { BELOW_MINIMUM, isBelowMinimum } from '../ui/minStability';
import { resultNotes } from '../ui/resultNotes';
import type { ManualMarker } from '../store/manualLayoutsStore';
import { UPPER_LAYERS_TEXT } from './csv';
import { STALE_NOTE } from './exportData';

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
  /** How to build the layer; only on a pinwheel pattern or a pattern turned half a turn. */
  note?: string;
  drawing: {
    footprint: { x: number; y: number };
    pallet: SheetRect;
    cartons: SheetRect[];
    blocks: SheetBlock[];
    /**
     * What the drawing must show, in the footprint's frame: the footprint itself, grown to
     * hold any carton that lies outside it (a layer placed by hand may overhang, so x and y
     * may be negative). Equal to the footprint at the origin when every carton is inside.
     */
    bounds: SheetRect;
  };
}
/** Says which outline in the layer drawings is the pallet and which the overhang limit. */
export interface DrawingKey {
  palletSize: string;
  limitSize: string;
  text: string;
}
/** What the sheet says of a manual layout (spec 6.3, 6.4); null on a calculated layout's. */
export interface SheetManual {
  /** "Manual layout: <name>": the sheet's heading. */
  heading: string;
  /** Every broken limit, as the screen words it: printed in the error style near the top. */
  flags: string[];
  /** Flags that are information, not a broken limit. */
  notes: string[];
}
export interface BuildSheet {
  title: 'Pallet build sheet';
  /** Present for a manual layout: its heading and flags. */
  manual: SheetManual | null;
  jobName: string | null;
  dateText: string;
  /** Page 1 note when the selected layout is not layout 1, else null. */
  layoutNote: string | null;
  stale: boolean;
  /** What the out-of-date box says when `stale`. */
  staleNote: string;
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

const RATING_WORD = { good: 'Good', fair: 'Fair', poor: 'Poor' } as const;

/**
 * The stability rating, one row per warning, and which layers are drawn turned half a turn (as
 * which pattern). Nothing for a layout stored before layouts were rated.
 */
function stabilityRows(layout: Layout, belowMinimum: boolean): SheetRow[] {
  const rows: SheetRow[] = [];
  if (layout.stability) {
    const rating = RATING_WORD[layout.stability.rating];
    // The mark the screen puts beside the rating when nothing reached the minimum.
    rows.push({
      label: 'Stability',
      value: belowMinimum ? `${rating} (${BELOW_MINIMUM})` : rating,
    });
    for (const w of layout.stability.warnings)
      rows.push({ label: 'Stability warning', value: describeWarning(w) });
  }
  const turned = turnedPatternsText(layout);
  if (turned) rows.push({ label: 'Turned layers', value: turned });
  return rows;
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
  if (w.layersRemoved >= 1 && w.roomForCartons >= 1)
    rows.push({ label: 'Room by weight', value: roomText(w.roomForCartons) });
  return rows;
}

/** The footprint at the origin, grown to hold every carton (see SheetPattern.drawing.bounds). */
export function drawingBounds(
  footprint: { x: number; y: number },
  cartons: SheetRect[],
): SheetRect {
  let [x0, y0, x1, y1] = [0, 0, footprint.x, footprint.y];
  // Float noise at an edge is not a carton outside: only a real overhang grows the bounds.
  for (const c of cartons) {
    if (c.x < x0 - EPS) x0 = c.x;
    if (c.y < y0 - EPS) y0 = c.y;
    if (c.x + c.dx > x1 + EPS) x1 = c.x + c.dx;
    if (c.y + c.dy > y1 + EPS) y1 = c.y + c.dy;
  }
  return { x: x0, y: y0, dx: x1 - x0, dy: y1 - y0 };
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
  /**
   * Present when the layout is a manual one (given as a result of that one layout): the sheet
   * is headed with its name and lists its flags, and says nothing of a rank.
   */
  manual?: ManualMarker;
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
  // The notes are about the calculated result; a manual layout is not one of its layouts.
  const notes = a.manual
    ? { belowMinimum: null, patternFallback: null, autoMore: null }
    : resultNotes(inputs, result);
  const manualLines = a.manual ? flagLines(a.manual.flags, unit) : [];
  const outOfDate = a.manual?.status === 'outOfDate';
  // As on screen: an out-of-date layout is not judged against the minimum now set.
  const manualBelow =
    !!a.manual && !outOfDate && isBelowMinimum(layout.stability?.rating, inputs.minStability);

  const trimmed = a.jobName.trim().slice(0, MAX_JOB_NAME);
  const placements = cartonPlacements(layout, inputs);
  const footprint = pallet.usableFootprint;
  const palletRect: SheetRect = {
    x: inputs.overhang / 2,
    y: inputs.overhang / 2,
    dx: inputs.pallet.length,
    dy: inputs.pallet.width,
  };

  const stack = stackPatterns(layout);
  // Keyed by 1-based layer number; letterAt takes a 0-based layer index.
  const letterOfLayer = new Map<number, string>();
  for (const p of stack) for (const n of p.layerNumbers) letterOfLayer.set(n, p.letter);
  const letterAt = (index: number) => letterOfLayer.get(index + 1);

  const patterns: SheetPattern[] = stack.map((p) => {
    const layer = layout.layers[p.layerIndex];
    if (!layer) throw new Error(`No layer at index ${p.layerIndex}`);
    const cartons = placements
      .filter((c) => c.layerIndex === p.layerIndex)
      .map((c) => ({ x: c.x, y: c.y, dx: c.dx, dy: c.dy }));
    // Placements come block by block, rows × cols each: each block's region bounds its run.
    // A layer placed by hand has one block per carton: nothing to label.
    const blocks: SheetBlock[] = [];
    let next = 0;
    for (const b of p.kind === 'manual' ? [] : layer.blocks) {
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
    // A turned layer sits on the layer it is a turn of: name the pattern of the layer below.
    const notes: string[] = p.kind === 'pinwheel' ? [PINWHEEL_NOTE] : [];
    const twin = layer.turned ? letterAt(p.layerIndex - 1) : undefined;
    if (twin) notes.push(`Pattern ${twin} turned half a turn (180°).`);
    // Described from the first block not turned 90° (else the first block), so a layer and
    // its half-turned twin, whose blocks come in the opposite order, read the same.
    const shown = layer.blocks.find((b) => !b.rotated) ?? layer.blocks[0];
    const mixed = layer.blocks.some((b) => b.rotated) && layer.blocks.some((b) => !b.rotated);
    let footprintText = '';
    if (shown && cartons.length > 0) {
      const [fa, fb] = footprintAxes(layer.vertical);
      const [a, b] = [layout.carton.outer[fa], layout.carton.outer[fb]];
      footprintText = `${shown.rotated ? sizeText(b, a) : sizeText(a, b)}${mixed ? ' (some turned 90°)' : ''}`;
    }
    return {
      letter: p.letter,
      heading: `Pattern ${p.letter}: ${describeLayerList(p.layerNumbers)}`,
      facts: [
        { label: 'Cartons in layer', value: String(p.cartonsPerLayer) },
        { label: 'Carton footprint as placed', value: footprintText },
        { label: 'Layer height', value: length(p.height) },
        { label: 'Side facing up', value: SIDE_UP[p.vertical] },
        p.kind === 'manual'
          ? { label: 'Arrangement', value: 'Placed by hand: build as drawn' }
          : {
              label: 'Blocks (rows × columns)',
              value: layer.blocks.map((b) => `${b.rows} × ${b.cols}`).join(', '),
            },
      ],
      drawing: {
        footprint: { ...footprint },
        pallet: { ...palletRect },
        cartons,
        blocks,
        bounds: drawingBounds(footprint, cartons),
      },
      ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    };
  });
  let top = PALLET_HEIGHT;
  const stacking = layout.layers.map((layer, i) => {
    top += layer.height;
    return {
      layer: i + 1,
      pattern: letterAt(i) ?? '',
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
    ...stabilityRows(layout, notes.belowMinimum !== null || manualBelow),
    ...(a.manual
      ? [{ label: 'Upper layers', value: UPPER_LAYERS_TEXT[a.manual.upperLayers] }]
      : []),
    // What the minimum stability and the layer pattern setting did, as the screen says it.
    ...(notes.belowMinimum ? [{ label: 'Minimum stability', value: notes.belowMinimum }] : []),
    ...(notes.patternFallback ? [{ label: 'Layer pattern', value: notes.patternFallback }] : []),
    ...(notes.autoMore ? [{ label: 'Compared with Auto', value: notes.autoMore }] : []),
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
    manual: a.manual
      ? {
          heading: `Manual layout: ${a.manual.name}`,
          flags: manualLines.filter((l) => l.tone === 'error').map((l) => `${l.text}.`),
          notes: manualLines.filter((l) => l.tone === 'note').map((l) => `${l.text}.`),
        }
      : null,
    jobName: trimmed === '' ? null : trimmed,
    dateText: localMinute(a.now),
    layoutNote:
      !a.manual && selectedIndex > 0 && best
        ? `Layout ${selectedIndex + 1} of ${result.layouts.length} selected. Layout 1 fits ${best.layout.totalProducts} boxes.`
        : null,
    stale: a.stale,
    staleNote:
      a.manual && outOfDate
        ? `Out of date: this layout was made for a product of ${dimsText(a.manual.madeFor.product, unit)} (carton wall ${length(a.manual.madeFor.wallThickness)}, leeway ${length(a.manual.madeFor.leeway)}). The inputs have changed since; it is shown as it was made.`
        : `${STALE_NOTE}.`,
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
    // A manual layout is not one of the ranked layouts: never "Layout 1 of 1".
    layoutLabel: a.manual
      ? `Manual layout: ${a.manual.name}`
      : `Layout ${selectedIndex + 1} of ${result.layouts.length}`,
    unit,
  };
  return safeDeep(sheet);
}
