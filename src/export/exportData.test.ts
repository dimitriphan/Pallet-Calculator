import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { buildExportPayload, exportFilename } from './exportData';

const CUBES: Inputs = {
  ...DEFAULT_INPUTS,
  product: { length: 10, width: 10, height: 10 },
  leeway: 0,
  wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 },
  pallet: { length: 40, width: 40, height: 25 },
};
const NOW = new Date('2026-11-10T09:05:03Z');

describe('buildExportPayload', () => {
  const result = optimize(CUBES);
  const payload = buildExportPayload(CUBES, result, 0, NOW);

  it('describes the selected layout and the full comparison', () => {
    expect(payload.selectedLayout.rank).toBe(1);
    expect(payload.comparison).toHaveLength(result.layouts.length);
    expect(payload.exportedAt).toBe(NOW.toISOString());
    expect(payload.inputs).toEqual(CUBES);
    expect(payload.analytics.summary.totalBoxes).toBe(32);
  });

  it('selects by index', () => {
    const last = result.layouts.length - 1;
    expect(buildExportPayload(CUBES, result, last, NOW).selectedLayout.rank).toBe(last + 1);
  });

  it('fills each comparison row from its own layout', () => {
    const row = payload.comparison[0]!;
    expect(row).toMatchObject({ rank: 1, products: 32, cartons: 8 });
    expect(row.carton.height).toBeGreaterThan(0);
    expect(row.score).toBe(result.layouts[0]!.score.total);
  });

  it('survives a JSON round trip', () => {
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it('throws on an index with no layout', () => {
    expect(() => buildExportPayload(CUBES, result, 99, NOW)).toThrow();
  });
});

describe('exportFilename', () => {
  it('uses local time', () => {
    expect(exportFilename('png', new Date('2026-11-10T09:05:03'))).toBe(
      'pallet-layout-20261110-090503.png',
    );
    expect(exportFilename('csv', new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'pallet-layout-20260102-030405.csv',
    );
  });
});
