import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { PINWHEEL_INPUTS } from '../engine/packing/testSupport';
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
      { label: 'Stability', value: 'Fair' },
      {
        label: 'Stability warning',
        value: 'Stack is tall for its base (1.6 times its shorter side).',
      },
      {
        label: 'Turned layers',
        value: 'Layers 3, 5, 7 are pattern B turned half a turn (shown as pattern C).',
      },
    ]);
  });

  it('prints no stability rows for a layout stored before ratings', () => {
    const r = structuredClone(RESULT);
    for (const { layout } of r.layouts) {
      delete layout.stability;
      for (const layer of layout.layers) delete layer.turned;
    }
    const old = buildSheetContent({
      inputs: DEFAULT_INPUTS,
      result: r,
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
    });
    expect(old.palletAndLoad.map((row) => row.label)).toEqual([
      'Pallet',
      'Usable stacking height',
      'Finished load',
    ]);
  });

  it('patterns', () => {
    // Layers 3, 5 and 7 are turned half a turn, so they are drawn as their own pattern.
    expect(s.patterns.map((p) => p.heading)).toEqual([
      'Pattern A: layer 1',
      'Pattern B: layers 2, 4, 6',
      'Pattern C: layers 3, 5, 7',
    ]);
    expect(s.patterns.map((p) => p.letter)).toEqual(['A', 'B', 'C']);
    expect(s.patterns.map((p) => p.note)).toEqual([
      undefined,
      undefined,
      'Pattern B turned half a turn (180°).',
    ]);
    expect(s.stacking.map((r) => r.pattern)).toEqual(['A', 'B', 'C', 'B', 'C', 'B', 'C']);
    // A half turn does not swap a carton's footprint: C is described as its twin B.
    const footprint = (p: (typeof s.patterns)[number] | undefined) =>
      p?.facts.find((f) => f.label === 'Carton footprint as placed')?.value;
    expect(footprint(s.patterns[1])).toBe('13.00 × 21.00 in (some turned 90°)');
    expect(footprint(s.patterns[2])).toBe(footprint(s.patterns[1]));
    expect(s.patterns[0]?.facts.map((f) => f.label)).toEqual([
      'Cartons in layer',
      'Carton footprint as placed',
      'Layer height',
      'Side facing up',
      'Blocks (rows × columns)',
    ]);
    expect(s.patterns[0]?.facts[0]?.value).toBe('10');
    expect(s.patterns[0]?.facts[3]?.value).toBe('Product length');
    expect(s.patterns[1]?.facts[3]?.value).toBe('Product width');
    expect(s.patterns[0]?.facts[2]?.value).toMatch(/^\d+\.\d\d in$/);
  });

  it('drawings are inside the footprint and do not overlap', () => {
    expect(s.patterns[0]?.drawing.cartons.length).toBe(10);
    expect(s.patterns[1]?.drawing.cartons.length).toBe(7);
    expect(s.patterns[2]?.drawing.cartons.length).toBe(7);
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

  it('block rectangles cover exactly the cartons of their layer', () => {
    for (const p of s.patterns) {
      const { blocks, cartons } = p.drawing;
      expect(blocks.map((b) => b.label).join(', ')).toBe(p.facts[4]?.value);
      const area = (r: SheetRect) => r.dx * r.dy;
      const sum = (rs: SheetRect[]) => rs.reduce((n, r) => n + area(r), 0);
      expect(sum(blocks)).toBeCloseTo(sum(cartons), 9);
      for (let i = 0; i < blocks.length; i++)
        for (let k = i + 1; k < blocks.length; k++)
          expect(overlaps(blocks[i] as SheetRect, blocks[k] as SheetRect)).toBe(false);
      const inside = (c: SheetRect, b: SheetRect) =>
        c.x >= b.x - 1e-9 &&
        c.y >= b.y - 1e-9 &&
        c.x + c.dx <= b.x + b.dx + 1e-9 &&
        c.y + c.dy <= b.y + b.dy + 1e-9;
      for (const c of cartons) expect(blocks.filter((b) => inside(c, b)).length).toBe(1);
    }
    expect(s.patterns[0]?.drawing.blocks).toEqual([expect.objectContaining({ label: '2 × 5' })]);
  });

  it('has no layout note for layout 1', () => {
    expect(s.layoutNote).toBeNull();
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
      'Stability',
      'Stability warning',
      'Turned layers',
    ]);
    expect(s.palletAndLoad[1]?.value).toBe('2.00 in total, 1.00 in each side');
  });

  it('keys the two outlines when there is overhang', () => {
    const s = build({ pallet: { length: 48, width: 40, height: 72 }, overhang: 2 });
    expect(s.drawingKey).toEqual({
      palletSize: '48.00 × 40.00 in',
      limitSize: '50.00 × 42.00 in',
      text: 'Solid line: pallet 48.00 × 40.00 in. Dashed line: limit with overhang 50.00 × 42.00 in.',
    });
  });

  it('has no outline key without overhang', () => {
    expect(build().drawingKey).toBeNull();
    expect(build({ pallet: { length: 48, width: 40, height: 72 } }).drawingKey).toBeNull();
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

  it('footer says best fit when boxes per carton is blank', () => {
    expect(build().footer).toBe(
      'Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable. Desired boxes per carton: best fit.',
    );
  });

  it('notes a layout other than layout 1 on page 1', () => {
    const s = buildSheetContent({
      inputs: DEFAULT_INPUTS,
      result: RESULT,
      selectedIndex: 1,
      jobName: '',
      stale: false,
      now: NOW,
    });
    expect(s.layoutNote).toBe('Layout 2 of 5 selected. Layout 1 fits 260 boxes.');
    expect(s.layoutLabel).toBe('Layout 2 of 5');
  });
});

describe('buildSheetContent in another unit', () => {
  const sheet = (unit: 'in' | 'cm' | 'mm', over: Partial<Inputs> = {}) => {
    const inputs = { ...DEFAULT_INPUTS, ...over };
    return buildSheetContent({
      inputs,
      result: Object.keys(over).length === 0 ? RESULT : optimize(inputs),
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
      unit,
    });
  };

  it('is the same sheet as before in inches', () => {
    expect(sheet('in')).toEqual({ ...build(), unit: 'in' });
    expect(build().unit).toBe('in');
  });

  it('writes every length in centimetres', () => {
    const s = sheet('cm', { overhang: 2 });
    expect(s.unit).toBe('cm');
    expect(sheet('cm').carton[0]?.value).toBe('53.3 × 22.9 × 33.0 cm');
    expect(s.palletAndLoad).toEqual([
      { label: 'Pallet', value: '127.0 × 106.7 cm, 12.7 cm tall' },
      { label: 'Overhang', value: '5.1 cm total, 2.5 cm each side' },
      { label: 'Usable stacking height', value: '170.2 cm' },
      {
        label: 'Finished load',
        value: expect.stringMatching(/^[\d.]+ × [\d.]+ × [\d.]+ cm including pallet$/),
      },
      { label: 'Stability', value: 'Fair' },
      { label: 'Stability warning', value: expect.stringMatching(/^Stack is tall for its base/) },
      {
        label: 'Turned layers',
        value: 'Layers 2, 4 are pattern A turned half a turn (shown as pattern B).',
      },
    ]);
    expect(s.patterns[0]?.facts[1]?.value).toMatch(/^\d+\.\d × \d+\.\d cm/);
    expect(s.patterns[0]?.facts[2]?.value).toMatch(/^\d+\.\d cm$/);
    expect(s.stacking[0]?.topHeight).toMatch(/^\d+\.\d cm$/);
    expect(s.drawingKey?.palletSize).toBe('127.0 × 106.7 cm');
    expect(s.footer.startsWith('Using 1.3 cm leeway, 0.6 cm carton walls, 5.1 cm overhang')).toBe(
      true,
    );
    // The drawing stays in inches: only the words change.
    expect(s.patterns[0]?.drawing.pallet).toEqual({ x: 1, y: 1, dx: 50, dy: 42 });
  });

  it('writes millimetres without decimals', () => {
    const s = sheet('mm');
    expect(s.palletAndLoad[0]?.value).toBe('1270 × 1067 mm, 127 mm tall');
    expect(strings(s).join(' ')).not.toMatch(/\d in\b/);
  });
});

describe('buildSheetContent with weights', () => {
  const weighed = (maxPallet: number | null) =>
    build({ weights: { productBox: 2, emptyCarton: 1, maxPallet, pallet: 40 } });

  it('adds nothing about weight while the box weight is blank', () => {
    expect(strings(build()).join('\n')).not.toMatch(/weight/i);
    expect(build().stacking.every((r) => !('weight' in r))).toBe(true);
  });

  it('adds the weights, the trim and the room left to the pallet and load rows', () => {
    // Under 290 lb: 108 boxes in 13 lb cartons at 274 lb, two layers removed, room for one.
    const s = weighed(290);
    const rows = Object.fromEntries(s.palletAndLoad.map((r) => [r.label, r.value]));
    expect(rows['Total weight']).toBe('274.0 lb (maximum 290.0 lb)');
    expect(rows['Weight per carton']).toBe('13.0 lb');
    expect(rows['Limited by weight']).toBe('2 layers removed');
    expect(rows['Room by weight']).toBe('Room for 1 more carton by weight');
    expect(s.summary.find((r) => r.label === 'Total boxes per pallet')?.value).toBe('108');
    expect(s.footer).toContain('40.0 lb pallet, 1.0 lb per empty carton.');
  });

  it('gives each stacking row its layer weight', () => {
    const s = weighed(null);
    expect(s.stacking.map((r) => r.weight)).toEqual([
      '110.0 lb',
      '77.0 lb',
      '77.0 lb',
      '77.0 lb',
      '77.0 lb',
      '77.0 lb',
      '77.0 lb',
    ]);
    const rows = Object.fromEntries(s.palletAndLoad.map((r) => [r.label, r.value]));
    expect(rows['Total weight']).toBe('612.0 lb');
    expect(rows['Limited by weight']).toBeUndefined();
    expect(rows['Room by weight']).toBeUndefined();
  });

  it('writes kg with cm', () => {
    const s = buildSheetContent({
      inputs: {
        ...DEFAULT_INPUTS,
        weights: { productBox: 2, emptyCarton: 1, maxPallet: null, pallet: 40 },
      },
      result: RESULT,
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
      unit: 'cm',
    });
    // 612 lb = 277.6 kg; 110 lb = 49.9 kg.
    expect(s.palletAndLoad.find((r) => r.label === 'Total weight')?.value).toBe('277.6 kg');
    expect(s.stacking[0]?.weight).toBe('49.9 kg');
  });
});

describe('buildSheetContent with a pinwheel layer', () => {
  const NOTE =
    'Pinwheel layer: build the four blocks around the centre gap as shown in the top view.';
  const s = buildSheetContent({
    inputs: PINWHEEL_INPUTS,
    result: optimize(PINWHEEL_INPUTS),
    selectedIndex: 0,
    jobName: '',
    stale: false,
    now: NOW,
  });

  it('says how to build the pinwheel under its pattern', () => {
    expect(s.patterns).toHaveLength(1);
    expect(s.patterns[0]?.heading).toBe('Pattern A: layers 1-3');
    expect(s.patterns[0]?.note).toBe(NOTE);
    expect(s.patterns[0]?.facts.find((f) => f.label === 'Blocks (rows × columns)')?.value).toBe(
      '2 × 1, 1 × 3, 2 × 1, 1 × 3',
    );
  });

  it('draws the four blocks round the centre gap without overlaps', () => {
    const { cartons, blocks, footprint } = s.patterns[0]!.drawing;
    expect(cartons).toHaveLength(10);
    expect(blocks).toHaveLength(4);
    for (const c of cartons) {
      expect(c.x).toBeGreaterThanOrEqual(-1e-9);
      expect(c.y).toBeGreaterThanOrEqual(-1e-9);
      expect(c.x + c.dx).toBeLessThanOrEqual(footprint.x + 1e-9);
      expect(c.y + c.dy).toBeLessThanOrEqual(footprint.y + 1e-9);
    }
    for (let i = 0; i < cartons.length; i++)
      for (let k = i + 1; k < cartons.length; k++)
        expect(overlaps(cartons[i] as SheetRect, cartons[k] as SheetRect)).toBe(false);
  });

  it('adds no note to a straight-cut pattern that is not turned', () => {
    const plain = build().patterns.filter((p) => p.letter !== 'C');
    for (const p of plain) expect('note' in p).toBe(false);
  });

  it('names the pattern a turned pinwheel layer is a turn of, after the pinwheel note', () => {
    // 48 x 40 pallet, 13.5 x 10.5 x 10 cartons: an asymmetric pinwheel, turned on layers 2, 4.
    const s = build({
      ...PINWHEEL_INPUTS,
      pallet: { length: 48, width: 40, height: 55 },
      product: { length: 13.5, width: 10.5, height: 10 },
      maxCarton: { length: 13.5, width: 10.5, height: 10 },
    });
    expect(s.patterns.map((p) => [p.heading, p.note])).toEqual([
      [
        'Pattern A: layers 1, 3, 5',
        'Pinwheel layer: build the four blocks around the centre gap as shown in the top view.',
      ],
      [
        'Pattern B: layers 2, 4',
        'Pinwheel layer: build the four blocks around the centre gap as shown in the top view. Pattern A turned half a turn (180°).',
      ],
    ]);
    expect(s.palletAndLoad.at(-1)).toEqual({
      label: 'Turned layers',
      value: 'Layers 2, 4 are pattern A turned half a turn (shown as pattern B).',
    });
  });
});

describe('buildSheetContent, minimum stability and layer pattern', () => {
  const row = (s: ReturnType<typeof build>, label: string) =>
    s.palletAndLoad.find((r) => r.label === label)?.value;

  it('says nothing more under Auto', () => {
    const s = build();
    expect(row(s, 'Stability')).toBe('Fair');
    for (const label of ['Minimum stability', 'Layer pattern', 'Compared with Auto'])
      expect(row(s, label)).toBeUndefined();
  });

  it('marks a layout below the minimum and says nothing reached it', () => {
    const s = build({ ...PINWHEEL_INPUTS, minStability: 'good' });
    expect(row(s, 'Stability')).toBe('Fair (Below your minimum)');
    expect(row(s, 'Minimum stability')).toBe(
      'No layout reaches Good. Showing the most stable found.',
    );
    expect(row(s, 'Compared with Auto')).toBeUndefined();
    expect(s.footer).toContain('minimum stability Good only');
  });

  it('a limited search says only that none was found', () => {
    const inputs: Inputs = { ...PINWHEEL_INPUTS, minStability: 'good' };
    const s = buildSheetContent({
      inputs,
      result: { ...optimize(inputs), truncated: true },
      selectedIndex: 0,
      jobName: '',
      stale: false,
      now: NOW,
    });
    expect(row(s, 'Minimum stability')).toBe(
      'No layout reaching Good was found before the search was stopped. Showing the most stable found.',
    );
  });

  it('says how many more boxes Auto would give, under a minimum and under Pinwheel only', () => {
    const good = build({ minStability: 'good' });
    expect(row(good, 'Stability')).toBe('Good');
    expect(row(good, 'Compared with Auto')).toBe('Auto would give 15 more boxes.');
    const only = build({ layerPattern: 'pinwheelOnly' });
    expect(row(only, 'Compared with Auto')).toBe('Auto would give 30 more boxes.');
    expect(row(only, 'Layer pattern')).toBeUndefined();
    expect(only.footer).toContain('layer pattern Pinwheel only');
  });

  it('says when the straight-cut layouts are shown because no pinwheel exists', () => {
    const s = build({
      product: { length: 30, width: 25, height: 20 },
      maxCarton: { length: 31, width: 26, height: 21 },
      layerPattern: 'pinwheelOnly',
    });
    expect(row(s, 'Layer pattern')).toBe(
      'No pinwheel layout exists for these sizes. Showing straight-cut layouts.',
    );
    expect(row(s, 'Compared with Auto')).toBeUndefined();
  });
});
