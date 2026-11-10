import { describe, expect, it } from 'vitest';
import { captionLines, pngLayout } from './png';
import { DEFAULT_INPUTS } from '../domain/constants';
import { optimize } from '../engine/optimize';
import { buildExportPayload } from './exportData';

describe('pngLayout', () => {
  const l = pngLayout();
  const rects = [l.current, l.top, l.side, l.caption];

  it('is 2400 x 1500', () => {
    expect([l.width, l.height]).toEqual([2400, 1500]);
  });

  it('places the panels as specified', () => {
    expect(l.current).toEqual({ x: 0, y: 0, width: 1500, height: 1200 });
    expect(l.top).toEqual({ x: 1500, y: 0, width: 900, height: 600 });
    expect(l.side).toEqual({ x: 1500, y: 600, width: 900, height: 600 });
    expect(l.caption).toEqual({ x: 0, y: 1200, width: 2400, height: 300 });
  });

  it('tiles the canvas without overlap', () => {
    const area = rects.reduce((s, r) => s + r.width * r.height, 0);
    expect(area).toBe(l.width * l.height);
    for (const [i, a] of rects.entries())
      for (const b of rects.slice(i + 1))
        expect(
          a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height,
        ).toBe(false);
  });
});

describe('captionLines', () => {
  it('states the five figures, load, carton and timestamp', () => {
    const p = buildExportPayload(
      DEFAULT_INPUTS,
      optimize(DEFAULT_INPUTS),
      0,
      new Date('2026-11-10T09:05:03Z'),
    );
    const text = captionLines(p).join('\n');
    expect(text).toContain(`Total boxes per pallet: ${p.analytics.summary.totalBoxes}`);
    expect(text).toContain('Boxes per carton:');
    expect(text).toContain('Cartons per layer:');
    expect(text).toContain('Layers:');
    expect(text).toContain('Cartons per pallet:');
    expect(text).toMatch(/Load: [\d.]+ × [\d.]+ × [\d.]+ in/);
    expect(text).toMatch(/Carton: [\d.]+ × [\d.]+ × [\d.]+ in/);
    expect(text).toContain('2026-11-10');
  });

  it('shows the export time in local time as YYYY-MM-DD HH:mm', () => {
    const now = new Date(2026, 10, 10, 9, 5, 3); // local time
    const p = buildExportPayload(DEFAULT_INPUTS, optimize(DEFAULT_INPUTS), 0, now);
    expect(p.exportedAt).toBe(now.toISOString());
    const last = captionLines(p).at(-1)!;
    expect(last).toContain('Exported 2026-11-10 09:05');
    expect(last).not.toContain(now.toISOString());
  });

  it('says when the result is out of date', () => {
    const r = optimize(DEFAULT_INPUTS);
    const now = new Date('2026-11-10T09:05:03Z');
    const note = 'Out of date: inputs changed after this calculation';
    expect(captionLines(buildExportPayload(DEFAULT_INPUTS, r, 0, now)).join('\n')).not.toContain(
      note,
    );
    expect(captionLines(buildExportPayload(DEFAULT_INPUTS, r, 0, now, true)).join('\n')).toContain(
      note,
    );
  });
});

describe('captionLines in another unit', () => {
  const p = buildExportPayload(
    DEFAULT_INPUTS,
    optimize(DEFAULT_INPUTS),
    0,
    new Date('2026-11-10T09:05:03Z'),
  );

  it('is unchanged in inches', () => {
    expect(captionLines(p, 'in')).toEqual(captionLines(p));
    expect(captionLines(p)[1]).toBe('Load: 47.00 × 42.00 × 72.00 in (including pallet)');
  });

  it('gives the load and carton in the unit', () => {
    expect(captionLines(p, 'cm')[1]).toBe('Load: 119.4 × 106.7 × 182.9 cm (including pallet)');
    expect(captionLines(p, 'mm')[2]).toBe('Carton: 533 × 330 × 229 mm (outer)');
  });
});
