import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { optimize } from '../engine/optimize';
import { PINWHEEL_INPUTS } from '../engine/packing/testSupport';
import { buildSheetContent, type BuildSheet } from './buildSheet';
import { PAGE, planPages, renderBuildSheetPdf, stackingHeight } from './buildSheetPdf';

const NOW = new Date(2026, 10, 10, 9, 5);

function defaultSheet(over: { jobName?: string; stale?: boolean } = {}): BuildSheet {
  return buildSheetContent({
    inputs: DEFAULT_INPUTS,
    result: optimize(DEFAULT_INPUTS),
    selectedIndex: 0,
    jobName: over.jobName ?? '',
    stale: over.stale ?? false,
    now: NOW,
  });
}

/** The default sheet with `patterns` copies of its first pattern and `rows` stacking rows. */
function syntheticSheet(patterns: number, rows: number): BuildSheet {
  const base = defaultSheet({ jobName: 'Synthetic' });
  const first = base.patterns[0]!;
  const row = base.stacking[0]!;
  return {
    ...base,
    patterns: Array.from({ length: patterns }, (_, i) => {
      const letter = String.fromCharCode(65 + i);
      return { ...first, letter, heading: `Pattern ${letter}: layer ${i + 1}` };
    }),
    stacking: Array.from({ length: rows }, (_, i) => ({ ...row, layer: i + 1 })),
  };
}

/** The PDF's bytes as Latin-1 text. */
async function pdfText(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await blob.arrayBuffer());
}

const pageObjects = (text: string) => (text.match(/\/Type \/Page(?!s)/g) ?? []).length;

// A 2 x 1 white PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAC0lEQVR4nGP4DwYAFPIF+6QNfF4AAAAASUVORK5CYII=';

describe('planPages', () => {
  it('puts the default patterns two per page and the stacking table after them', () => {
    // Layers 3, 5 and 7 are turned half a turn: their pattern C needs a third block, so
    // the sheet has three pages where it had two.
    const plan = planPages(defaultSheet());
    expect(plan.patternsPerPage).toEqual([['A', 'B'], ['C']]);
    expect(plan.stackingOnPage).toBe(3);
    expect(plan.totalPages).toBe(3);
  });

  it('flows five patterns two per page and keeps the stacking table on the page', () => {
    const plan = planPages(syntheticSheet(5, 40));
    expect(plan.patternsPerPage).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
    expect(plan.stackingOnPage).toBeGreaterThanOrEqual(4);
    expect(plan.stackingParts.reduce((n, p) => n + p.count, 0)).toBe(40);
    expect(plan.stackingParts[0]?.page).toBe(plan.stackingOnPage);
    for (const part of plan.stackingParts) {
      expect(part.top + stackingHeight(part.count)).toBeLessThanOrEqual(PAGE.bodyBottom + 1e-9);
      expect(part.page).toBeLessThanOrEqual(plan.totalPages);
    }
    expect(plan.totalPages).toBe(plan.stackingParts.at(-1)?.page);
  });

  it('continues a table longer than a page on the next pages', () => {
    const plan = planPages(syntheticSheet(3, 60));
    expect(plan.patternsPerPage).toEqual([['A', 'B'], ['C']]);
    expect(plan.stackingOnPage).toBe(3);
    let next = 0;
    plan.stackingParts.forEach((part, k) => {
      expect(part.first).toBe(next);
      expect(part.page).toBe(plan.stackingOnPage + k);
      expect(part.top + stackingHeight(part.count)).toBeLessThanOrEqual(PAGE.bodyBottom + 1e-9);
      expect(part.count).toBeGreaterThanOrEqual(5);
      next += part.count;
    });
    expect(next).toBe(60);
    expect(plan.totalPages).toBe(plan.stackingParts.at(-1)?.page);
  });

  it('places a short table below the last pattern on the same page', () => {
    const plan = planPages(syntheticSheet(1, 1));
    expect(plan).toMatchObject({ patternsPerPage: [['A']], stackingOnPage: 2, totalPages: 2 });
  });
});

// A 1 x 1 brown PNG, different from the pictures' PNG (jsPDF stores identical images once).
const MASCOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOYEu78HwAE3wIucvoh+gAAAABJRU5ErkJggg==';
const MASCOT = { dataUrl: MASCOT_PNG, aspect: 17 / 27 };
const imageCount = (text: string) => (text.match(/\/Subtype \/Image/g) ?? []).length;

describe('renderBuildSheetPdf mascot', () => {
  it('adds one image to page 1 and keeps the page count', async () => {
    const sheet = defaultSheet({ jobName: 'Dock 4' });
    const without = await pdfText(await renderBuildSheetPdf(sheet, null));
    const withMascot = await pdfText(await renderBuildSheetPdf(sheet, null, MASCOT));
    expect(imageCount(withMascot)).toBe(imageCount(without) + 1);
    expect(pageObjects(withMascot)).toBe(planPages(sheet).totalPages);
    expect(pageObjects(withMascot)).toBe(pageObjects(without));
  });

  it('draws the mascot once even with pictures and a long job name', async () => {
    const sheet = defaultSheet({ jobName: 'x'.repeat(80) });
    const pics = { current: PNG, side: PNG };
    const without = await pdfText(await renderBuildSheetPdf(sheet, pics));
    const withMascot = await pdfText(await renderBuildSheetPdf(sheet, pics, MASCOT));
    expect(imageCount(withMascot)).toBe(imageCount(without) + 1);
  });

  it('is unchanged when the mascot is undefined', async () => {
    const sheet = defaultSheet();
    const a = await pdfText(await renderBuildSheetPdf(sheet, null));
    const b = await pdfText(await renderBuildSheetPdf(sheet, null, undefined));
    expect(imageCount(b)).toBe(imageCount(a));
    expect(b.length).toBe(a.length);
  });
});

describe('renderBuildSheetPdf', () => {
  it('renders the default winner as text, without pictures', async () => {
    const text = await pdfText(
      await renderBuildSheetPdf(defaultSheet({ jobName: 'Dock 4' }), null),
    );
    expect(text.startsWith('%PDF')).toBe(true);
    for (const s of [
      'Pallet build sheet',
      'Dock 4',
      '260',
      'Pattern B: layers 2, 4, 6',
      'Pattern C: layers 3, 5, 7',
      'Pattern B turned half a turn \\(180°\\).',
      'Stability',
      'Fair',
      'Stack is tall for its base',
      '3D pictures unavailable',
      'Page 3 of 3',
      '72.00 in',
    ])
      expect(text).toContain(s);
    expect(text).not.toContain('Out of date');
    // Page 1 names the turned layers as drawn, it does not tell builders to turn them again.
    expect(text).toContain('(Layers 3, 5, 7 are pattern B turned) Tj');
    expect(text).toContain('(half a turn \\(shown as pattern C\\).) Tj');
    expect(text).not.toContain('Turn these layers');
    expect(pageObjects(text)).toBe(3);
  });

  it('prints the outline key only with overhang', async () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      pallet: { length: 48, width: 40, height: 72 },
      overhang: 2,
    };
    const sheet = buildSheetContent({
      inputs,
      result: optimize(inputs),
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
    });
    const withOverhang = await pdfText(await renderBuildSheetPdf(sheet, null));
    expect(withOverhang).toContain('Dashed line');
    // The edge labels measure the pallet, not the overhang limit.
    expect(withOverhang).toContain('(48.00 in)');
    expect(withOverhang).toContain('(40.00 in)');
    expect(withOverhang).not.toContain('(50.00 in)');
    expect(withOverhang).not.toContain('(42.00 in)');
    const without = await pdfText(await renderBuildSheetPdf(defaultSheet(), null));
    expect(without).not.toContain('Dashed line');
  });

  it('labels blocks inside the drawing and notes a non-default layout', async () => {
    const text = await pdfText(await renderBuildSheetPdf(defaultSheet(), null));
    // "2 × 5" appears twice: in the Blocks fact and inside the drawing.
    expect(text.split('(2 \xd7 5) Tj').length - 1).toBe(2);
    expect(text).toContain('(Blocks \\(rows \xd7 columns\\)) Tj');
    expect(text).not.toContain('selected. Layout 1 fits');
    const second = buildSheetContent({
      inputs: DEFAULT_INPUTS,
      result: optimize(DEFAULT_INPUTS),
      selectedIndex: 1,
      jobName: '',
      stale: false,
      now: NOW,
    });
    const text2 = await pdfText(await renderBuildSheetPdf(second, null));
    expect(text2).toContain('Layout 2 of 5 selected. Layout 1 fits 260 boxes.');
  });

  it('prints how to build a pinwheel layer under its facts, and nothing for straight cuts', async () => {
    const sheet = buildSheetContent({
      inputs: PINWHEEL_INPUTS,
      result: optimize(PINWHEEL_INPUTS),
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
    });
    const text = await pdfText(await renderBuildSheetPdf(sheet, null));
    // Wrapped to the facts column, so look for the start and the end of the sentence.
    expect(text).toMatch(/\(Pinwheel layer: build the four/);
    expect(text).toMatch(/as shown in the top view\.\) Tj/);
    const plain = await pdfText(await renderBuildSheetPdf(defaultSheet(), null));
    expect(plain).not.toContain('Pinwheel');
  });

  it('boxes the out-of-date line when stale', async () => {
    const text = await pdfText(await renderBuildSheetPdf(defaultSheet({ stale: true }), null));
    expect(text).toContain('Out of date: inputs changed after this calculation.');
  });

  it('embeds the two pictures', async () => {
    const text = await pdfText(
      await renderBuildSheetPdf(defaultSheet(), { current: PNG, side: PNG }),
    );
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(text).toContain('3D view');
    expect(text).toContain('Side view');
    expect(text).not.toContain('3D pictures unavailable');
  });

  it.each([
    [2, 7],
    [5, 40],
    [1, 1],
    [3, 60],
  ])('prints as many pages as planned (%i patterns, %i rows)', async (patterns, rows) => {
    const sheet = syntheticSheet(patterns, rows);
    const { totalPages } = planPages(sheet);
    const text = await pdfText(await renderBuildSheetPdf(sheet, null));
    expect(pageObjects(text)).toBe(totalPages);
    for (let p = 1; p <= totalPages; p++) expect(text).toContain(`Page ${p} of ${totalPages}`);
    expect(text).not.toContain(`Page ${totalPages + 1} of`);
  });
});

describe('renderBuildSheetPdf with weights', () => {
  it('adds a layer weight column only when the sheet has weights', async () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      weights: { productBox: 2, emptyCarton: 1, maxPallet: 290, pallet: 40 },
    };
    const sheet = buildSheetContent({
      inputs,
      result: optimize(inputs),
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
    });
    const text = await pdfText(await renderBuildSheetPdf(sheet, null));
    for (const s of [
      'Layer weight',
      'Total weight',
      '274.0 lb \\(maximum 290.0 lb\\)',
      'Limited by weight',
    ])
      expect(text).toContain(s);
    const plain = await pdfText(await renderBuildSheetPdf(defaultSheet(), null));
    expect(plain).not.toContain('Layer weight');
    expect(plain).not.toMatch(/weight/i);
  });
});
