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

  it('records the target when one is set', () => {
    const p = buildExportPayload({ ...CUBES, targetQuantity: 10 }, optimize(CUBES), 0, NOW);
    const out = buildCsv(p).split('\r\n');
    expect(out).toContain('Target quantity,10');
    expect(out).toContain('Target status,Target exceeded');
  });
});
