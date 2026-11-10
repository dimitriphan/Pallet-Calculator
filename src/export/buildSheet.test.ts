import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { buildSheetContent, buildSheetFilename, pdfSafe, type SheetRect } from './buildSheet';

const NOW = new Date(2026, 10, 10, 9, 5);
const RESULT = optimize(DEFAULT_INPUTS);

function build(over: Partial<Inputs> = {}, extra: { jobName?: string; stale?: boolean } = {}) {
  const inputs = { ...DEFAULT_INPUTS, ...over };
  const result = Object.keys(over).length === 0 ? RESULT : optimize(inputs);
  return buildSheetContent({
    inputs,
    result,
    selectedIndex: 0,
    jobName: extra.jobName ?? '',
    stale: extra.stale ?? false,
    now: NOW,
  });
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

function overlaps(a: SheetRect, b: SheetRect): boolean {
  const e = 1e-9;
  return (
    Math.min(a.x + a.dx, b.x + b.dx) - Math.max(a.x, b.x) > e &&
    Math.min(a.y + a.dy, b.y + b.dy) - Math.max(a.y, b.y) > e
  );
}

describe('pdfSafe', () => {
  it('keeps Latin-1 and replaces the rest', () => {
    expect(pdfSafe('a – b — c “q” ‘s’ × ° №')).toBe('a - b - c "q" \'s\' × ° ?');
  });
});

describe('buildSheetFilename', () => {
  it('uses local time', () => {
    expect(buildSheetFilename(new Date(2026, 10, 10, 9, 5, 3))).toBe(
      'pallet-build-sheet-20261110-090503.pdf',
    );
  });
});

describe('buildSheetContent, default winner', () => {
  const s = build({}, { jobName: '  Dock 4 – run №7 🚚  ' });

  it('header', () => {
    expect(s.title).toBe('Pallet build sheet');
    expect(s.jobName).toMatch(/^Dock 4 - run \?7 \?+$/);
    expect(s.dateText).toBe('2026-11-10 09:05');
    expect(s.stale).toBe(false);
    expect(s.layoutLabel).toBe('Layout 1 of 5');
    expect(s.footer.startsWith('Using 0.50 in leeway')).toBe(true);
  });

  it('summary, carton and pallet rows', () => {
    expect(s.summary.map((r) => r.value)).toEqual(['5', '7-10', '7', '52', '260']);
    expect(s.summary.map((r) => r.label)).toEqual([
      'Boxes per carton',
      'Cartons per layer',
      'Layers',
      'Cartons per pallet',
      'Total boxes per pallet',
    ]);
    expect(s.carton.map((r) => r.label)).toEqual([
      'Outer size',
      'Inner size',
      'Boxes per carton',
      'Boxes inside',
    ]);
    expect(s.carton[3]?.value).toMatch(/ along the box's length × width × height$/);
    expect(s.palletAndLoad).toEqual([
      { label: 'Pallet', value: '50.00 × 42.00 in, 5.00 in tall' },
      { label: 'Usable stacking height', value: '67.00 in' },
      { label: 'Finished load', value: '47.00 × 42.00 × 72.00 in including pallet' },
    ]);
  });

  it('patterns', () => {
    expect(s.patterns.map((p) => p.heading)).toEqual([
      'Pattern A: layer 1',
      'Pattern B: layers 2-7',
    ]);
    expect(s.patterns.map((p) => p.letter)).toEqual(['A', 'B']);
    expect(s.patterns[0]?.facts.map((f) => f.label)).toEqual([
      'Cartons in layer',
      'Carton footprint as placed',
      'Layer height',
      'Side facing up',
      'Blocks',
    ]);
    expect(s.patterns[0]?.facts[0]?.value).toBe('10');
    expect(s.patterns[0]?.facts[3]?.value).toBe('Product length');
    expect(s.patterns[1]?.facts[3]?.value).toBe('Product width');
    expect(s.patterns[0]?.facts[2]?.value).toMatch(/^\d+\.\d\d in$/);
  });

  it('drawings are inside the footprint and do not overlap', () => {
    expect(s.patterns[0]?.drawing.cartons.length).toBe(10);
    expect(s.patterns[1]?.drawing.cartons.length).toBe(7);
    for (const p of s.patterns) {
      const { footprint, cartons, pallet } = p.drawing;
      expect(footprint).toEqual({ x: 50, y: 42 });
      expect(pallet).toEqual({ x: 0, y: 0, dx: 50, dy: 42 });
      for (const c of cartons) {
        expect(c.x).toBeGreaterThanOrEqual(-1e-9);
        expect(c.y).toBeGreaterThanOrEqual(-1e-9);
        expect(c.x + c.dx).toBeLessThanOrEqual(footprint.x + 1e-9);
        expect(c.y + c.dy).toBeLessThanOrEqual(footprint.y + 1e-9);
      }
      for (let i = 0; i < cartons.length; i++)
        for (let k = i + 1; k < cartons.length; k++)
          expect(overlaps(cartons[i] as SheetRect, cartons[k] as SheetRect)).toBe(false);
    }
  });

  it('stacking rows', () => {
    expect(s.stacking.length).toBe(7);
    expect(s.stacking[6]?.topHeight).toBe('72.00 in');
    expect(s.stacking.reduce((n, r) => n + r.cartons, 0)).toBe(52);
    expect(s.stacking[0]).toMatchObject({ layer: 1, pattern: 'A', cartons: 10 });
    expect(s.stacking[1]?.pattern).toBe('B');
    expect(s.stacking[0]?.height).toMatch(/^\d+\.\d\d in$/);
  });

  it('contains only characters the PDF font can draw', () => {
    for (const str of strings(s)) {
      for (let i = 0; i < str.length; i++) expect(str.charCodeAt(i)).toBeLessThanOrEqual(0xff);
    }
  });
});

describe('buildSheetContent, variations', () => {
  it('overhang', () => {
    const s = build({ overhang: 2 });
    const d = s.patterns[0]?.drawing;
    expect(d?.footprint).toEqual({ x: 52, y: 44 });
    expect(d?.pallet).toEqual({ x: 1, y: 1, dx: 50, dy: 42 });
    expect(s.palletAndLoad.map((r) => r.label)).toEqual([
      'Pallet',
      'Overhang',
      'Usable stacking height',
      'Finished load',
    ]);
    expect(s.palletAndLoad[1]?.value).toBe('2.00 in in total, 1.00 in each side');
  });

  it('stale flag', () => {
    expect(build({}, { stale: true }).stale).toBe(true);
  });

  it('job name trimming', () => {
    expect(build({}, { jobName: 'x'.repeat(81) }).jobName).toBe('x'.repeat(80));
    expect(build({}, { jobName: '   ' }).jobName).toBeNull();
  });

  it('footer mentions a desired boxes per carton', () => {
    const s = build({ boxesPerCarton: 5 });
    expect(s.footer.endsWith(' Desired boxes per carton: 5.')).toBe(true);
  });
});
