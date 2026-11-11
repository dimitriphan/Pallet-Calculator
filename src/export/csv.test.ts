import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { buildCsv, csvField } from './csv';
import { buildExportPayload } from './exportData';

const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};
const NOW = new Date('2026-11-10T09:05:03Z');
const payload = buildExportPayload(CUBES, optimize(CUBES), 0, NOW);
const csv = buildCsv(payload);
const lines = csv.split('\r\n');

describe('csvField', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField('plain')).toBe('plain');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('+1 x')).toBe("'+1 x");
    expect(csvField('-cmd')).toBe("'-cmd");
    expect(csvField('@x')).toBe("'@x");
    expect(csvField('\tx')).toBe("'\tx");
    expect(csvField('\rx')).toBe('"\'\rx"');
  });
  it('leaves plain negative numbers alone', () => {
    expect(csvField('-5.25')).toBe('-5.25');
    expect(csvField('-5')).toBe('-5');
  });
});

describe('buildCsv', () => {
  it('starts with the metrics header and uses CRLF', () => {
    expect(lines[0]).toBe('Metric,Value');
    expect(csv).toContain('\r\n');
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('lists the metrics in order', () => {
    const labels = lines.slice(1, lines.indexOf('')).map((l) => l.split(',')[0]);
    expect(labels[0]).toBe('Exported at');
    const idx = (s: string) => labels.indexOf(s);
    expect(idx('Selected layout')).toBeGreaterThan(-1);
    expect(idx('Pallet length (in)')).toBeLessThan(idx('Product length (in)'));
    expect(idx('Keep cartons upright')).toBeLessThan(idx('Usable stacking height (in)'));
    expect(idx('Boxes per carton')).toBeLessThan(idx('Load length (in)'));
    expect(idx('Utilization (%)')).toBeLessThan(idx('Target status'));
    expect(labels.at(-1)).toBe('Space contribution');
  });

  it('writes counts as integers and other numbers with two decimals', () => {
    expect(lines).toContain('Total boxes per pallet,32');
    expect(lines).toContain(`Layers,${payload.analytics.summary.layers}`);
    expect(lines).toContain('Selected layout,1');
    expect(lines).toContain('Pallet length (in),40.00');
    expect(lines).toContain('Target quantity,');
    expect(lines).toContain('Box leeway (in),0.00');
  });

  it('separates the comparison table with a blank line and the on-screen titles', () => {
    const blank = lines.indexOf('');
    expect(blank).toBeGreaterThan(0);
    expect(lines[blank + 1]).toBe(
      '#,Carton (in),Products,Cartons,Layers,Utilization,Remaining volume (in³),Score',
    );
    expect(lines).toHaveLength(blank + 2 + payload.comparison.length + 1);
    expect(lines.at(-1)).toBe('');
    expect(lines[blank + 2]!.startsWith('1,')).toBe(true);
  });

  it('quotes a carton field with commas', () => {
    expect(csvField('1,5')).toBe('"1,5"');
  });

  it('states whether the result is out of date', () => {
    expect(lines[3]).toBe('Status,Current');
    const stale = buildCsv(buildExportPayload(CUBES, optimize(CUBES), 0, NOW, true));
    expect(stale.split('\r\n')).toContain(
      'Status,Out of date: inputs changed after this calculation',
    );
  });

  it('describes how the boxes sit inside the carton', () => {
    const d = buildCsv(buildExportPayload(DEFAULT_INPUTS, optimize(DEFAULT_INPUTS), 0, NOW));
    const out = d.split('\r\n');
    expect(out).toContain('Boxes along product length × width × height,1 × 1 × 5');
    expect(out).toContain('Product side facing up,Length up: 1 layer; Width up: 6 layers');
  });

  it('leaves the target rows blank without a target', () => {
    expect(lines).toContain('Cartons needed for target,');
    expect(lines).toContain('Layers needed for target,');
  });

  it('records the target when one is set', () => {
    const p = buildExportPayload({ ...CUBES, targetQuantity: 10 }, optimize(CUBES), 0, NOW);
    const out = buildCsv(p).split('\r\n');
    expect(out).toContain('Target quantity,10');
    expect(out).toContain('Target status,Target exceeded');
    expect(out).toContain(`Cartons needed for target,${p.analytics.target.cartonsNeeded}`);
    expect(out).toContain(`Layers needed for target,${p.analytics.target.layersNeeded}`);
  });

  it('writes the desired boxes per carton right after the target quantity', () => {
    expect(lines).toContain('Desired boxes per carton,');
    const i6 = { ...CUBES, boxesPerCarton: 2 };
    const p = buildExportPayload(i6, optimize(i6), 0, NOW);
    const out = buildCsv(p).split('\r\n');
    expect(out).toContain('Desired boxes per carton,2');
    expect(out.indexOf('Desired boxes per carton,2')).toBe(
      out.findIndex((l) => l.startsWith('Target quantity,')) + 1,
    );
    expect(p.inputs.boxesPerCarton).toBe(2);
  });
});

describe('buildCsv in another unit', () => {
  const cm = buildCsv(payload, 'cm').split('\r\n');
  const mm = buildCsv(payload, 'mm').split('\r\n');

  it('is the same file as before in inches', () => {
    expect(buildCsv(payload, 'in')).toBe(csv);
  });

  it('titles lengths and volumes with the unit and converts the values', () => {
    expect(cm).toContain('Pallet length (cm),101.6');
    expect(cm).toContain('Box leeway (cm),0.0');
    expect(cm).toContain('Load total height (cm),63.5');
    expect(mm).toContain('Pallet length (mm),1016');
    expect(cm.some((l) => /^Volume used \(cm³\),\d+\.\d$/.test(l))).toBe(true);
    expect(mm.some((l) => /^Volume used \(cm³\),\d+\.\d$/.test(l))).toBe(true);
    expect(cm).toContain('Total boxes per pallet,32');
    expect(cm.join('\n')).not.toMatch(/\(in\)|in³/);
  });

  it('titles the comparison table with the unit', () => {
    const blank = cm.indexOf('');
    expect(cm[blank + 1]).toBe(
      '#,Carton (cm),Products,Cartons,Layers,Utilization,Remaining volume (cm³),Score',
    );
    expect(cm[blank + 2]).toMatch(/^1,50\.8 × 25\.4 × 50\.8,/);
  });
});

describe('buildCsv with weights', () => {
  const W: Inputs = {
    ...DEFAULT_INPUTS,
    weights: { productBox: 2, emptyCarton: 1, maxPallet: 290, pallet: 40 },
  };
  const p = buildExportPayload(W, optimize(W), 0, NOW);
  const out = buildCsv(p).split('\r\n');

  it('writes nothing about weight while the box weight is blank', () => {
    expect(csv).not.toMatch(/weight/i);
    expect(
      buildCsv(buildExportPayload(DEFAULT_INPUTS, optimize(DEFAULT_INPUTS), 0, NOW)),
    ).not.toMatch(/weight/i);
  });

  it('adds the weight inputs and results after the score rows', () => {
    // The winner: 108 boxes in 13 lb cartons, 274 lb, two layers removed, room for one more.
    const end = out.indexOf('');
    const rows = out.slice(out.findIndex((l) => l.startsWith('Space contribution,')) + 1, end);
    expect(rows.map((l) => l.split(',')[0])).toEqual([
      'Weight per product box (lb)',
      'Maximum pallet weight (lb)',
      'Empty carton weight (lb)',
      'Pallet weight (lb)',
      'Total weight (lb)',
      'Weight per carton (lb)',
      'Weight per layer (lb)',
      'Centre of mass height above floor (in)',
      'Layers removed for weight',
      'Room for more cartons by weight',
    ]);
    expect(out).toContain('Weight per product box (lb),2.0');
    expect(out).toContain('Maximum pallet weight (lb),290.0');
    expect(out).toContain('Total weight (lb),274.0');
    expect(out).toContain('Weight per carton (lb),13.0');
    expect(out).toContain('Layers removed for weight,2');
    expect(out).toContain('Room for more cartons by weight,1');
    expect(out.find((l) => l.startsWith('Weight per layer (lb),'))).toMatch(
      /^Weight per layer \(lb\),\d+\.\d( \d+\.\d)*$/,
    );
  });

  it('adds a weight column to the comparison table', () => {
    const blank = out.indexOf('');
    expect(out[blank + 1]).toBe(
      '#,Carton (in),Products,Cartons,Layers,Utilization,Weight (lb),Remaining volume (in³),Score',
    );
    expect(out[blank + 2]?.split(',')[6]).toBe('274.0');
  });

  it('writes kg with cm and leaves a blank maximum empty', () => {
    const open = { ...W, weights: { ...W.weights, maxPallet: null } };
    const cm = buildCsv(buildExportPayload(open, optimize(open), 0, NOW), 'cm').split('\r\n');
    expect(cm).toContain('Weight per product box (kg),0.9');
    expect(cm).toContain('Maximum pallet weight (kg),');
    expect(cm).toContain('Pallet weight (kg),18.1');
    expect(cm).toContain('Layers removed for weight,0');
    expect(cm).toContain('Room for more cartons by weight,0');
    expect(cm.some((l) => /^Centre of mass height above floor \(cm\),\d+\.\d$/.test(l))).toBe(true);
  });
});
