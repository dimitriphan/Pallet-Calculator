/**
 * Draws a BuildSheet onto US Letter pages with jsPDF. This is the only module that imports
 * jsPDF, and the app reaches it only through a dynamic import, so jsPDF stays out of the
 * initial chunk. Units are inches; font sizes are points.
 *
 * Layer drawings are a top view with x (pallet length) to the right and y (pallet width)
 * increasing DOWN the page, as in the app's Top view.
 */
import { jsPDF } from 'jspdf';
import type { Unit } from '../engine/units/units';
import { lengthText } from '../ui/format';
import type { BuildSheet, DrawingKey, SheetPattern, SheetRow } from './buildSheet';
import { STALE_NOTE } from './exportData';

/** PNG data URLs of the light-rendered 3D view as framed and the side view. */
export interface SheetPictures {
  current: string;
  side: string;
}

/** The print mascot as a PNG data URL (transparent, cropped to the figure) and width / height. */
export interface SheetMascot {
  dataUrl: string;
  aspect: number;
}

/** Page geometry shared by the planner and the renderer. */
export const PAGE = {
  width: 8.5,
  height: 11,
  margin: 0.5,
  /** Layer-plan pages: content starts below the running header. */
  bodyTop: 0.9,
  /** No content below this line; the footer sits under it. */
  bodyBottom: 9.95,
} as const;

const LEFT = PAGE.margin;
const RIGHT = PAGE.width - PAGE.margin;
const CONTENT_W = RIGHT - LEFT;

const BLOCK_H = 3.4;
const BLOCKS_PER_PAGE = 2;
const DRAW_W = 3.2;
const DRAW_H = 2.9;
const STACK_TITLE_H = 0.3;
const STACK_ROW_H = 0.22;
const EPS = 1e-9;
/** Fewest stacking rows worth starting or ending a page with. */
const MIN_ROWS = 5;

/** Height of a stacking-order table (title, header row and `rows` rows). */
export function stackingHeight(rows: number): number {
  return STACK_TITLE_H + STACK_ROW_H * (rows + 1);
}

export interface StackingPart {
  /** 1-based page number. */
  page: number;
  /** Top of the part's title, in inches from the top of the page. */
  top: number;
  /** Index of the first stacking row in this part. */
  first: number;
  count: number;
}

export interface PagePlan {
  /** Pattern letters on each layer-plan page; index 0 is page 2 (page 1 is the overview). */
  patternsPerPage: string[][];
  /** The page the "Stacking order" table starts on. */
  stackingOnPage: number;
  /** Where each part of the stacking table goes (one part unless it is longer than a page). */
  stackingParts: StackingPart[];
  totalPages: number;
}

/**
 * Pagination, pure. Two pattern blocks per page, never split. The stacking table follows
 * the last block when it fits in the space left, otherwise it starts a new page. A table
 * longer than a whole page continues over further pages, under a "(continued)" title.
 */
export function planPages(sheet: BuildSheet): PagePlan {
  const letters = sheet.patterns.map((p) => p.letter);
  const patternsPerPage: string[][] = [];
  for (let i = 0; i < letters.length; i += BLOCKS_PER_PAGE)
    patternsPerPage.push(letters.slice(i, i + BLOCKS_PER_PAGE));

  const rows = sheet.stacking.length;
  let page = 1 + patternsPerPage.length;
  const lastBlocks = patternsPerPage.at(-1)?.length ?? 0;
  const top = PAGE.bodyTop + lastBlocks * BLOCK_H;
  const stackingParts: StackingPart[] = [];

  /** How many rows fit below `y` on a page. */
  const rowsFit = (y: number) =>
    Math.max(0, Math.floor((PAGE.bodyBottom - y - STACK_TITLE_H) / STACK_ROW_H + EPS) - 1);
  const perPage = rowsFit(PAGE.bodyTop);
  const afterBlocks = lastBlocks > 0 ? rowsFit(top) : 0;

  if (rows > 0 && rows <= afterBlocks) {
    stackingParts.push({ page, top, first: 0, count: rows });
  } else if (rows > 0) {
    // Longer than a page: flow on from below the last block when a useful number of rows
    // fits there, then fill whole pages. A table that fits a page starts a new one.
    let first = 0;
    if (rows > perPage && afterBlocks >= MIN_ROWS) {
      stackingParts.push({ page, top, first, count: afterBlocks });
      first = afterBlocks;
    }
    while (first < rows) {
      const count = Math.min(perPage, rows - first);
      stackingParts.push({ page: ++page, top: PAGE.bodyTop, first, count });
      first += count;
    }
    // No last page with a row or two on its own: borrow from the part before.
    const last = stackingParts.at(-1);
    const before = stackingParts.at(-2);
    if (last && before && last.count < MIN_ROWS) {
      const move = Math.min(MIN_ROWS - last.count, before.count - MIN_ROWS);
      if (move > 0) {
        before.count -= move;
        last.first -= move;
        last.count += move;
      }
    }
  }

  return {
    patternsPerPage,
    stackingOnPage: stackingParts[0]?.page ?? page,
    stackingParts,
    totalPages: page,
  };
}

// ---------------------------------------------------------------------------------------
// Drawing helpers

type RGB = [number, number, number];
const BLACK: RGB = [17, 24, 39];
const GREY_TEXT: RGB = [75, 85, 99];
const RULE: RGB = [209, 213, 219];
const FRAME: RGB = [156, 163, 175];
const CARTON_FILL: RGB = [229, 231, 235];
const ZEBRA: RGB = [243, 244, 246];

/** Line advance for a font size in points, in inches. */
const lineH = (pt: number) => (pt * 1.22) / 72;

function font(doc: jsPDF, size: number, style: 'normal' | 'bold' = 'normal', color = BLACK) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function rule(doc: jsPDF, x1: number, y: number, x2: number, width: number, color = RULE) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

/** The text, cut with "..." so it fits `width` in the current font. */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let cut = text;
  while (cut.length > 0 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

// ---------------------------------------------------------------------------------------
// Page 1

const MASCOT_H = 0.55;
/** Wrapped job-name lines stop at least this far left of the mascot. */
const MASCOT_GAP = 0.2;

function drawHeader(doc: jsPDF, sheet: BuildSheet, mascot?: SheetMascot): number {
  font(doc, 20, 'bold');
  let base = PAGE.margin + 0.2;
  doc.text(sheet.title, LEFT, base);
  // Top right, its top level with the cap height of the title (0.718 em of 20 pt).
  let wrapW = CONTENT_W;
  let mascotBottom = 0;
  if (mascot) {
    const w = MASCOT_H * mascot.aspect;
    const top = base - (0.718 * 20) / 72;
    doc.addImage(mascot.dataUrl, 'PNG', RIGHT - w, top, w, MASCOT_H);
    wrapW = CONTENT_W - w - MASCOT_GAP;
    mascotBottom = top + MASCOT_H;
  }
  if (sheet.jobName) {
    font(doc, 14);
    base += 0.1;
    for (const line of wrap(doc, sheet.jobName, wrapW)) {
      base += lineH(14);
      doc.text(line, LEFT, base);
    }
  }
  font(doc, 10, 'normal', GREY_TEXT);
  base += 0.22;
  doc.text(sheet.dateText, LEFT, base);
  if (sheet.layoutNote) {
    font(doc, 10, 'bold');
    base += lineH(10) + 0.04;
    doc.text(sheet.layoutNote, LEFT, base);
  }
  const ruleY = Math.max(base + 0.14, mascotBottom + 0.08);
  rule(doc, LEFT, ruleY, RIGHT, 0.015, BLACK);
  return ruleY + 0.22;
}

function drawStaleBox(doc: jsPDF, y: number): number {
  const h = 0.38;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.025);
  doc.rect(LEFT, y, CONTENT_W, h, 'S');
  font(doc, 11, 'bold');
  doc.text(`${STALE_NOTE}.`, LEFT + 0.15, y + h / 2 + 0.055);
  return y + h + 0.22;
}

function drawSummary(doc: jsPDF, rows: SheetRow[], y: number): number {
  const gap = 0.12;
  const w = (CONTENT_W - gap * (rows.length - 1)) / rows.length;
  const h = 0.92;
  rows.forEach((row, i) => {
    const x = LEFT + i * (w + gap);
    doc.setDrawColor(...FRAME);
    doc.setLineWidth(0.012);
    doc.rect(x, y, w, h, 'S');
    font(doc, 8.5, 'normal', GREY_TEXT);
    wrap(doc, row.label, w - 0.16)
      .slice(0, 2)
      .forEach((line, k) =>
        doc.text(line, x + w / 2, y + 0.19 + k * lineH(8.5), { align: 'center' }),
      );
    font(doc, 24, 'bold');
    doc.text(fit(doc, row.value, w - 0.12), x + w / 2, y + h - 0.16, { align: 'center' });
  });
  return y + h + 0.32;
}

const LABEL_W = 1.3;

/** A heading and label/value rows; returns the bottom of the table. */
function drawRowsTable(
  doc: jsPDF,
  title: string,
  rows: SheetRow[],
  x: number,
  y: number,
  w: number,
) {
  font(doc, 12, 'bold');
  doc.text(title, x, y + 0.17);
  let top = y + 0.27;
  rule(doc, x, top, x + w, 0.012, BLACK);
  for (const row of rows) {
    font(doc, 10);
    const lines = wrap(doc, row.value, w - LABEL_W - 0.05);
    font(doc, 9, 'normal', GREY_TEXT);
    const labels = wrap(doc, row.label, LABEL_W - 0.1);
    const h = Math.max(lines.length, labels.length) * lineH(10) + 0.13;
    labels.forEach((l, k) => doc.text(l, x, top + 0.2 + k * lineH(10)));
    font(doc, 10);
    lines.forEach((l, k) => doc.text(l, x + LABEL_W, top + 0.2 + k * lineH(10)));
    top += h;
    rule(doc, x, top, x + w, 0.006);
  }
  return top;
}

function drawPictures(doc: jsPDF, pictures: SheetPictures | null, y: number) {
  if (!pictures) {
    doc.setDrawColor(...FRAME);
    doc.setLineWidth(0.01);
    doc.rect(LEFT, y, CONTENT_W, 0.7, 'S');
    font(doc, 10, 'normal', GREY_TEXT);
    doc.text('3D pictures unavailable', PAGE.width / 2, y + 0.39, { align: 'center' });
    return;
  }
  const frameW = 3.6;
  const frameH = 3.0;
  const gap = CONTENT_W - 2 * frameW;
  const frames: [string, string][] = [
    ['3D view', pictures.current],
    ['Side view', pictures.side],
  ];
  frames.forEach(([caption, src], i) => {
    const x = LEFT + i * (frameW + gap);
    font(doc, 12, 'bold');
    doc.text(caption, x, y + 0.17);
    const top = y + 0.27;
    const { width, height } = doc.getImageProperties(src);
    const scale = Math.min(frameW / width, frameH / height);
    const w = width * scale;
    const h = height * scale;
    doc.addImage(src, 'PNG', x + (frameW - w) / 2, top + (frameH - h) / 2, w, h);
    doc.setDrawColor(...FRAME);
    doc.setLineWidth(0.01);
    doc.rect(x, top, frameW, frameH, 'S');
  });
}

function drawOverview(
  doc: jsPDF,
  sheet: BuildSheet,
  pictures: SheetPictures | null,
  mascot?: SheetMascot,
) {
  let y = drawHeader(doc, sheet, mascot);
  if (sheet.stale) y = drawStaleBox(doc, y);
  y = drawSummary(doc, sheet.summary, y);
  const colW = (CONTENT_W - 0.35) / 2;
  const bottom = Math.max(
    drawRowsTable(doc, 'Carton', sheet.carton, LEFT, y, colW),
    drawRowsTable(doc, 'Pallet and load', sheet.palletAndLoad, RIGHT - colW, y, colW),
  );
  drawPictures(doc, pictures, bottom + 0.35);
}

// ---------------------------------------------------------------------------------------
// Layer plan pages

function drawRunningHeader(doc: jsPDF, sheet: BuildSheet) {
  const base = PAGE.margin + 0.12;
  font(doc, 9, 'normal', GREY_TEXT);
  const date = sheet.dateText;
  const dateW = doc.getTextWidth(date);
  doc.text(date, RIGHT, base, { align: 'right' });
  font(doc, 9, 'bold', GREY_TEXT);
  doc.text(sheet.title, LEFT, base);
  if (sheet.jobName) {
    const titleW = doc.getTextWidth(sheet.title);
    font(doc, 9, 'normal', GREY_TEXT);
    const room = CONTENT_W - titleW - dateW - 0.3;
    doc.text(fit(doc, ` - ${sheet.jobName}`, room), LEFT + titleW, base);
  }
  rule(doc, LEFT, base + 0.1, RIGHT, 0.008);
}

/**
 * Each block's "rows × columns" centred in its region, on a white patch so carton lines do
 * not run through the text. A block too small for its label gets none.
 */
function drawBlockLabels(
  doc: jsPDF,
  blocks: SheetPattern['drawing']['blocks'],
  ox: number,
  oy: number,
  s: number,
) {
  font(doc, 7, 'normal', GREY_TEXT);
  const textH = 0.075;
  const pad = 0.025;
  for (const b of blocks) {
    const w = doc.getTextWidth(b.label);
    if (w + 2 * pad > b.dx * s || textH + 2 * pad > b.dy * s) continue;
    const cx = ox + (b.x + b.dx / 2) * s;
    const cy = oy + (b.y + b.dy / 2) * s;
    // Set every time: jsPDF draws text colour with the fill operator.
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - w / 2 - pad, cy - textH / 2 - pad, w + 2 * pad, textH + 2 * pad, 'F');
    doc.text(b.label, cx, cy + textH / 2, { align: 'center' });
  }
}

/** Height kept under a layer drawing for the outline key, when there is one. */
const KEY_H = 0.2;

function drawLayerDrawing(
  doc: jsPDF,
  drawing: SheetPattern['drawing'],
  key: DrawingKey | null,
  x: number,
  y: number,
  unit: Unit,
) {
  const labelW = 0.3;
  const below = 0.48;
  const availW = DRAW_W - labelW - 0.04;
  const availH = DRAW_H - below - (key ? KEY_H : 0);
  const { footprint, pallet, cartons } = drawing;
  const s = Math.min(availW / footprint.x, availH / footprint.y);
  const w = footprint.x * s;
  const h = footprint.y * s;
  const ox = x + labelW + (availW - w) / 2;
  const oy = y + (availH - h) / 2;

  const differs =
    Math.abs(footprint.x - pallet.dx) > EPS ||
    Math.abs(footprint.y - pallet.dy) > EPS ||
    Math.abs(pallet.x) > EPS ||
    Math.abs(pallet.y) > EPS;
  if (differs) {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.01);
    doc.setLineDashPattern([0.06, 0.04], 0);
    doc.rect(ox, oy, w, h, 'S');
    doc.setLineDashPattern([], 0);
  }

  doc.setFillColor(...CARTON_FILL);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.008);
  for (const c of cartons) doc.rect(ox + c.x * s, oy + c.y * s, c.dx * s, c.dy * s, 'FD');

  drawBlockLabels(doc, drawing.blocks, ox, oy, s);

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.02);
  const px = ox + pallet.x * s;
  const py = oy + pallet.y * s;
  const pw = pallet.dx * s;
  const ph = pallet.dy * s;
  doc.rect(px, py, pw, ph, 'S');

  // Dimension lines measure the solid pallet outline, ticked at its edges.
  const tick = 0.04;
  doc.setLineWidth(0.006);
  const dimY = oy + h + 0.08;
  doc.line(px, dimY, px + pw, dimY);
  doc.line(px, dimY - tick, px, dimY + tick);
  doc.line(px + pw, dimY - tick, px + pw, dimY + tick);
  const dimX = ox - 0.08;
  doc.line(dimX, py, dimX, py + ph);
  doc.line(dimX - tick, py, dimX + tick, py);
  doc.line(dimX - tick, py + ph, dimX + tick, py + ph);

  font(doc, 9);
  doc.text(lengthText(pallet.dx, unit), px + pw / 2, dimY + 0.16, { align: 'center' });
  const widthText = lengthText(pallet.dy, unit);
  doc.text(widthText, dimX - 0.07, py + ph / 2 + doc.getTextWidth(widthText) / 2, { angle: 90 });
  font(doc, 8, 'normal', GREY_TEXT);
  doc.text('Top view, pallet length across', ox + w / 2, oy + h + 0.4, { align: 'center' });
  if (key) {
    font(doc, 8, 'normal', BLACK);
    doc.text(key.text, x, oy + h + 0.4 + KEY_H);
  }
}

function drawFacts(doc: jsPDF, facts: SheetRow[], x: number, y: number, w: number) {
  let top = y;
  facts.forEach((fact, i) => {
    if (i > 0) rule(doc, x, top, x + w, 0.006);
    font(doc, 8, 'normal', GREY_TEXT);
    doc.text(fact.label, x, top + 0.17);
    font(doc, 10.5);
    const lines = wrap(doc, fact.value, w);
    lines.forEach((l, k) => doc.text(l, x, top + 0.36 + k * lineH(10.5)));
    top += 0.36 + (lines.length - 1) * lineH(10.5) + 0.11;
  });
}

function drawPatternBlock(
  doc: jsPDF,
  pattern: SheetPattern,
  key: DrawingKey | null,
  y: number,
  unit: Unit,
) {
  font(doc, 13, 'bold');
  doc.text(pattern.heading, LEFT, y + 0.2);
  rule(doc, LEFT, y + 0.3, RIGHT, 0.012, BLACK);
  const top = y + 0.42;
  drawLayerDrawing(doc, pattern.drawing, key, LEFT, top, unit);
  const factsX = LEFT + DRAW_W + 0.35;
  drawFacts(doc, pattern.facts, factsX, top - 0.04, RIGHT - factsX);
}

const STACK_COLUMNS: { title: string; width: number }[] = [
  { title: 'Layer', width: 1.1 },
  { title: 'Pattern', width: 1.1 },
  { title: 'Cartons', width: 1.2 },
  { title: 'Layer height', width: 1.7 },
  { title: 'Top of layer (incl. pallet)', width: 2.4 },
];

function drawStacking(doc: jsPDF, sheet: BuildSheet, part: StackingPart) {
  font(doc, 13, 'bold');
  doc.text(
    part.first === 0 ? 'Stacking order' : 'Stacking order (continued)',
    LEFT,
    part.top + 0.2,
  );
  font(doc, 9, 'normal', GREY_TEXT);
  doc.text('Bottom to top', RIGHT, part.top + 0.2, { align: 'right' });

  const cell = (values: string[], top: number) => {
    let x = LEFT;
    values.forEach((v, i) => {
      const col = STACK_COLUMNS[i];
      if (!col) return;
      doc.text(v, x + col.width / 2, top + 0.155, { align: 'center' });
      x += col.width;
    });
  };

  let top = part.top + STACK_TITLE_H;
  doc.setFillColor(...CARTON_FILL);
  doc.rect(LEFT, top, CONTENT_W, STACK_ROW_H, 'F');
  font(doc, 9, 'bold');
  cell(
    STACK_COLUMNS.map((c) => c.title),
    top,
  );
  top += STACK_ROW_H;
  rule(doc, LEFT, top, RIGHT, 0.012, BLACK);
  font(doc, 9.5);
  sheet.stacking.slice(part.first, part.first + part.count).forEach((row, k) => {
    if (k % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(LEFT, top, CONTENT_W, STACK_ROW_H, 'F');
    }
    cell([String(row.layer), row.pattern, String(row.cartons), row.height, row.topHeight], top);
    top += STACK_ROW_H;
  });
  rule(doc, LEFT, top, RIGHT, 0.012, BLACK);
}

// ---------------------------------------------------------------------------------------
// Footer and document

const FOOTER_RULE_Y = PAGE.bodyBottom + 0.1;

/** The settings text in at most two lines: 8 pt, else 7 pt, else cut with "...". */
function footerLines(doc: jsPDF, text: string, width: number): { size: number; lines: string[] } {
  for (const size of [8, 7]) {
    font(doc, size, 'normal', GREY_TEXT);
    const lines = wrap(doc, text, width);
    if (lines.length <= 2) return { size, lines };
  }
  const lines = wrap(doc, text, width);
  return { size: 7, lines: [lines[0] ?? '', fit(doc, lines.slice(1).join(' '), width)] };
}

function drawFooter(doc: jsPDF, sheet: BuildSheet, page: number, total: number) {
  rule(doc, LEFT, FOOTER_RULE_Y, RIGHT, 0.008);
  const right = `${sheet.layoutLabel} - Page ${page} of ${total}`;
  font(doc, 8, 'bold', GREY_TEXT);
  const rightW = doc.getTextWidth(right);
  doc.text(right, RIGHT, FOOTER_RULE_Y + 0.16, { align: 'right' });
  const { size, lines } = footerLines(doc, sheet.footer, CONTENT_W - rightW - 0.35);
  font(doc, size, 'normal', GREY_TEXT);
  lines.forEach((l, k) => doc.text(l, LEFT, FOOTER_RULE_Y + 0.16 + k * lineH(size)));
}

/**
 * The build sheet as a PDF: page 1 is the overview, then the layer plan. The optional mascot
 * is drawn once, top right of page 1.
 */
export async function renderBuildSheetPdf(
  sheet: BuildSheet,
  pictures: SheetPictures | null,
  mascot?: SheetMascot,
): Promise<Blob> {
  const plan = planPages(sheet);
  const doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait', compress: false });
  doc.setProperties({
    title: sheet.jobName ? `${sheet.title} - ${sheet.jobName}` : sheet.title,
    creator: 'Pallet Calculator',
  });

  drawOverview(doc, sheet, pictures, mascot);

  const byLetter = new Map(sheet.patterns.map((p) => [p.letter, p]));
  const newPage = () => {
    doc.addPage('letter', 'portrait');
    drawRunningHeader(doc, sheet);
  };
  for (const letters of plan.patternsPerPage) {
    newPage();
    letters.forEach((letter, i) => {
      const pattern = byLetter.get(letter);
      if (pattern)
        drawPatternBlock(doc, pattern, sheet.drawingKey, PAGE.bodyTop + i * BLOCK_H, sheet.unit);
    });
  }
  for (const part of plan.stackingParts) {
    if (part.page > doc.getNumberOfPages()) newPage();
    drawStacking(doc, sheet, part);
  }

  const total = doc.getNumberOfPages();
  if (total !== plan.totalPages) throw new Error(`Planned ${plan.totalPages} pages, drew ${total}`);
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    drawFooter(doc, sheet, page, total);
  }
  return doc.output('blob');
}
