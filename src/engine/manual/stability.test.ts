/**
 * The stability rating of a layout placed by hand: the stack height check on each
 * free-standing group of the bottom layer, and the deck check (how much of each bottom carton
 * rests on the pallet). Calculated layouts keep the four checks unchanged.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import { analyticsSchema, optimizeResultSchema } from '../../domain/resultSchemas';
import { STABILITY } from '../../domain/stabilityThresholds';
import type { Inputs, Layout, StabilityRating, StabilityWarning } from '../../domain/types';
import { computeAnalytics } from '../analytics/analytics';
import {
  assessStability,
  describeWarning,
  freeStandingGroups,
  measureStability,
  ratingOf,
  stabilityWarnings,
} from '../analytics/stability';
import { optimize } from '../optimize';
import { PINWHEEL_INPUTS } from '../packing/testSupport';
import { buildManualLayout, type UpperLayers } from './build';
import type { ManualCarton } from './layer';
import { manualSpec, OVERHANG_INPUTS, pick, resultOf, seeded } from './testSupport';

/** Pallet 50 x 42 x 72, no overhang: the usable footprint is the pallet. Carton 25 x 17 x 5. */
const FLUSH: Inputs = { ...OVERHANG_INPUTS, overhang: 0 };
/** The same pallet with 2 in of overhang: the pallet is at 1..51 by 1..43 of the frame. */
const OVER: Inputs = OVERHANG_INPUTS;
const at = (x: number, y: number, rotated = false): ManualCarton => ({ x, y, rotated });

function build(cartons: ManualCarton[], inputs: Inputs = FLUSH, upperLayers: UpperLayers = 'same') {
  return buildManualLayout(manualSpec({ cartons, upperLayers }, inputs), inputs).layout;
}
const warning = (l: Layout, check: StabilityWarning['check']) =>
  l.stability!.warnings.find((w) => w.check === check);

/** The rule before Round 5's change: the four checks, the stack by the whole bottom layer. */
function oldRule(l: Layout): { rating: StabilityRating; stackHeightRatio: number } {
  const m = measureStability(l);
  const bottom = l.layers[0];
  const height = l.layers.reduce((s, layer) => s + layer.height, 0);
  const base = bottom ? Math.min(bottom.extent.x, bottom.extent.y) : 0;
  const stackHeightRatio = base > 0 ? height / base : 0;
  const warnings = stabilityWarnings({
    stackHeightRatio,
    cartonHeight: m.cartonHeight,
    support: m.support,
    columns: m.columns,
  });
  return { rating: ratingOf(warnings), stackHeightRatio };
}
const RANK: Record<StabilityRating, number> = { good: 0, fair: 1, poor: 2 };

describe('stack height of a layout placed by hand', () => {
  it('two columns standing apart are rated as the columns they are (review I1)', () => {
    // 13 layers of 5 in: 65 in. Whole bottom layer 50 x 42: 65 / 42 = 1.55, a caution.
    const two = build([at(0, 0), at(25, 25)]);
    expect(two.layers).toHaveLength(13);
    expect(oldRule(two).stackHeightRatio).toBeCloseTo(65 / 42, 12);
    const m = measureStability(two, FLUSH);
    expect(m.freeStandingGroups).toBe(2);
    expect(m.stackHeightRatio).toBeCloseTo(65 / 17, 12);
    const w = warning(two, 'stackHeight')!;
    expect(w).toEqual({
      check: 'stackHeight',
      level: 'serious',
      value: m.stackHeightRatio,
      freeStanding: true,
    });
    expect(two.stability!.rating).toBe('poor');
    expect(describeWarning(w)).toBe(
      'A free-standing column of the load is tall for its base (3.8 times its shorter side).',
    );

    // One column alone: the same ratio, said as the whole stack.
    const one = build([at(0, 0)]);
    const single = warning(one, 'stackHeight')!;
    expect(single.value).toBeCloseTo(65 / 17, 12);
    expect(single.level).toBe('serious');
    expect('freeStanding' in single).toBe(false);
    expect(measureStability(one, FLUSH).freeStandingGroups).toBe(1);
    expect(describeWarning(single)).toBe(
      'Stack is tall for its base (3.8 times its shorter side).',
    );
  });

  it('the worst group decides, by the shorter side of its own bounding box', () => {
    const big = { ...FLUSH, pallet: { length: 120, width: 60, height: 72 } };
    // A 2 x 2 block (50 x 34) and, apart from it, two turned cartons side by side (34 x 25).
    const block = [at(0, 0), at(25, 0), at(0, 17), at(25, 17)];
    const l = build([...block, at(60, 0, true), at(77, 0, true)], big);
    expect(measureStability(l, big).freeStandingGroups).toBe(2);
    // The narrower group is 25 across: 65 / 25. The whole layer is 94 x 34: 65 / 34.
    expect(measureStability(l, big).stackHeightRatio).toBeCloseTo(65 / 25, 12);
    expect(oldRule(l).stackHeightRatio).toBeCloseTo(65 / 34, 12);
    // A third group narrower still, 1 in above the turned pair: one carton, 17 across.
    const three = build([...block, at(60, 0, true), at(77, 0, true), at(60, 26)], big);
    expect(measureStability(three, big).freeStandingGroups).toBe(3);
    expect(measureStability(three, big).stackHeightRatio).toBeCloseTo(65 / 17, 12);
    // Moved down to touch the pair, it joins it: 34 x 42, and 25 is the narrowest again.
    const joined = build([...block, at(60, 0, true), at(77, 0, true), at(60, 25)], big);
    expect(measureStability(joined, big).freeStandingGroups).toBe(2);
    expect(measureStability(joined, big).stackHeightRatio).toBeCloseTo(65 / 34, 12);
    const fat = build([at(0, 0), at(25, 0), at(0, 17), at(25, 17)]);
    expect(measureStability(fat).freeStandingGroups).toBe(1);
    expect(measureStability(fat).stackHeightRatio).toBeCloseTo(65 / 34, 12);
  });

  it('cartons that meet only at a corner are not joined', () => {
    const corner = build([at(0, 0), at(25, 17)]);
    expect(measureStability(corner).freeStandingGroups).toBe(2);
    expect(measureStability(corner).stackHeightRatio).toBeCloseTo(65 / 17, 12);
    expect(warning(corner, 'stackHeight')!.freeStanding).toBe(true);
    // The old rule saw one 50 x 34 base.
    expect(oldRule(corner).stackHeightRatio).toBeCloseTo(65 / 34, 12);
  });

  it('cartons that share a stretch of edge are joined, also through other cartons', () => {
    const rect = (x: number, y: number, w = 25, h = 17) => ({ x, y, w, h });
    expect(freeStandingGroups([rect(0, 0), rect(25, 0)])).toEqual([rect(0, 0, 50, 17)]);
    // Half an edge is enough; so is an edge within the engine's tolerance.
    expect(freeStandingGroups([rect(0, 0), rect(25, 8.5)])).toHaveLength(1);
    expect(freeStandingGroups([rect(0, 0), rect(25 + 1e-12, 0)])).toHaveLength(1);
    expect(freeStandingGroups([rect(0, 0), rect(0, 17 - 1e-12)])).toHaveLength(1);
    // A chain: the first and last do not touch each other.
    expect(freeStandingGroups([rect(50, 0), rect(0, 0), rect(25, 0)])).toEqual([
      rect(0, 0, 75, 17),
    ]);
    // Corner to corner, a hair of a gap, a shared stretch no longer than the tolerance: apart.
    expect(freeStandingGroups([rect(0, 0), rect(25, 17)])).toHaveLength(2);
    expect(freeStandingGroups([rect(0, 0), rect(25, -17)])).toHaveLength(2);
    expect(freeStandingGroups([rect(0, 0), rect(25.01, 0)])).toHaveLength(2);
    expect(freeStandingGroups([rect(0, 0), rect(25, 17 - 1e-12)])).toHaveLength(2);
    // Two corner-joined pairs stay two groups, each with its own bounding box.
    const groups = freeStandingGroups([rect(0, 0), rect(25, 0), rect(50, 17), rect(75, 17)]);
    expect(groups.sort((p, q) => p.x - q.x)).toEqual([rect(0, 0, 50, 17), rect(50, 17, 50, 17)]);
    expect(freeStandingGroups([])).toEqual([]);
  });

  it('one group is rated exactly as before, with no mention of columns', () => {
    const cartons = [at(0, 0), at(25, 0), at(0, 17, true), at(17, 17, true)];
    for (const upper of ['same', 'alternate'] as const) {
      const l = build(cartons, FLUSH, upper);
      const m = measureStability(l, FLUSH);
      expect(m.freeStandingGroups).toBe(1);
      // Not merely close: the very number the old rule gives.
      expect(m.stackHeightRatio).toBe(oldRule(l).stackHeightRatio);
      expect(l.stability!.rating).toBe(oldRule(l).rating);
      expect(l.stability!.warnings.some((w) => w.freeStanding)).toBe(false);
      expect(warning(l, 'deck')).toBeUndefined();
    }
  });
});

describe('deck check of a layout placed by hand', () => {
  it('a layer wholly off the pallet is rated poor (review I2)', () => {
    const off = build([at(-60, 0), at(-35, 0), at(-60, 17), at(-35, 17)]);
    // Before: one 50 x 34 group, 65 / 34 = 1.91, columns: cautions at most, nothing about where.
    expect(measureStability(off, FLUSH).deck).toEqual({ share: 0, cartons: 4 });
    const w = warning(off, 'deck')!;
    expect(w).toEqual({ check: 'deck', level: 'serious', value: 0, cartons: 4 });
    expect(off.stability!.rating).toBe('poor');
    expect(describeWarning(w)).toBe(
      '4 cartons in the bottom layer hang off the pallet; the worst does not rest on it at all.',
    );
    // A single layer of it (2 in of usable height... one layer): the deck warning alone.
    const low = { ...FLUSH, pallet: { ...FLUSH.pallet, height: 10 } };
    const flat = build([at(-60, 0), at(-35, 0), at(-60, 17), at(-35, 17)], low);
    expect(flat.layers).toHaveLength(1);
    expect(flat.stability).toEqual({
      rating: 'poor',
      warnings: [{ check: 'deck', level: 'serious', value: 0, cartons: 4 }],
    });
  });

  it('measures each carton against the pallet, the worst carton deciding', () => {
    // Carton 25 x 17 = 425 sq in. 2 in off the left: 23 / 25 = 92%. 5 in off: 80%. 10: 60%.
    expect(warning(build([at(-2, 0)]), 'deck')).toBeUndefined();
    expect(measureStability(build([at(-2, 0)]), FLUSH).deck).toEqual({ share: 0.92, cartons: 0 });
    const caution = build([at(-5, 0), at(20, 0)]);
    expect(warning(caution, 'deck')).toEqual({
      check: 'deck',
      level: 'caution',
      value: 0.8,
      cartons: 1,
    });
    // The load as a whole is 90% on the pallet; one carton is 60% on it.
    const serious = build([at(-10, 0), at(15, 0), at(-10, 17), at(15, 17), at(-5, 34, true)], {
      ...FLUSH,
      pallet: { length: 50, width: 60, height: 72 },
    });
    const w = warning(serious, 'deck')!;
    expect(w.level).toBe('serious');
    expect(w.value).toBeCloseTo(0.6, 12);
    // Under 90%: the two at -10 (60%) and the turned one 5 in off (12 / 17 = 71%).
    expect(w.cartons).toBe(3);
    expect(describeWarning(w)).toBe(
      '3 cartons in the bottom layer hang off the pallet; the worst rests only 60% on it.',
    );
  });

  it('a share exactly at a threshold gives no warning of that level', () => {
    // 2.5 of 25 in off: exactly 90%. 7.5 off: exactly 70%, a caution but not serious.
    expect(STABILITY.deckShare).toEqual({ caution: 0.9, serious: 0.7 });
    expect(warning(build([at(-2.5, 0)]), 'deck')).toBeUndefined();
    expect(warning(build([at(-2.75, 0)]), 'deck')!.level).toBe('caution');
    expect(warning(build([at(-7.5, 0)]), 'deck')!.level).toBe('caution');
    expect(warning(build([at(-7.75, 0)]), 'deck')!.level).toBe('serious');
  });

  it('measures from the pallet, not from the usable footprint with its allowed overhang', () => {
    // 2 in of overhang: the frame is 52 x 44 and the pallet lies at 1..51 by 1..43 of it.
    // A carton in the frame's far corner (27..52 by 27..44) is 24 x 16 of 25 x 17 on the
    // pallet, 90.4%: no warning. Measured against a pallet at 0..50 by 0..42 it would be
    // 23 x 15, 81%.
    const corner = build([at(27, 27)], OVER);
    expect(measureStability(corner, OVER).deck!.share).toBeCloseTo((24 * 16) / 425, 12);
    expect(warning(corner, 'deck')).toBeUndefined();
    // The near corner is the same: 1 in off on two sides.
    expect(measureStability(build([at(0, 0)], OVER), OVER).deck!.share).toBeCloseTo(384 / 425, 12);
    // Standing exactly on the pallet's corner: all of it.
    expect(measureStability(build([at(1, 1)], OVER), OVER).deck).toEqual({ share: 1, cartons: 0 });
    // 2.6 in left of the pallet's edge is x = -1.6 here: 22.4 / 25 = 89.6%, a caution.
    // (Against a pallet at 0..50 it would be 93.6% and pass.)
    const left = build([at(-1.6, 1)], OVER);
    expect(warning(left, 'deck')).toEqual({
      check: 'deck',
      level: 'caution',
      value: expect.closeTo(0.896, 12),
      cartons: 1,
    });
    expect(describeWarning(warning(left, 'deck')!)).toBe(
      '1 carton in the bottom layer rests only 89% on the pallet.',
    );
    // The same carton with no overhang allowed stands at the same place on the pallet.
    expect(measureStability(build([at(-2.6, 0)], FLUSH), FLUSH).deck!.share).toBeCloseTo(0.896, 12);
    // With a wide overhang, a carton inside the usable footprint can be mostly off the pallet.
    const wide = { ...FLUSH, overhang: 30 }; // pallet at 15..65 by 15..57
    const inFrame = buildManualLayout(manualSpec({ cartons: [at(0, 15)] }, wide), wide);
    expect(inFrame.flags).toEqual([]);
    expect(warning(inFrame.layout, 'deck')).toEqual({
      check: 'deck',
      level: 'serious',
      value: expect.closeTo(0.4, 12),
      cartons: 1,
    });
  });

  it('says one carton, several cartons, and none of a carton, in plain words', () => {
    const say = (value: number, cartons: number) =>
      describeWarning({
        check: 'deck',
        level: value < 0.7 ? 'serious' : 'caution',
        value,
        cartons,
      });
    expect(say(0.55, 1)).toBe('1 carton in the bottom layer rests only 55% on the pallet.');
    expect(say(0.55, 2)).toBe(
      '2 cartons in the bottom layer hang off the pallet; the worst rests only 55% on it.',
    );
    expect(say(0, 1)).toBe('1 carton in the bottom layer does not rest on the pallet at all.');
    // Rounded down: never the 90 it is under.
    expect(say(0.8999, 1)).toContain('only 89%');
    expect(say(0.004, 1)).toContain('only 0%');
  });

  it('is only made with the inputs, and only on the bottom layer', () => {
    const off = build([at(-60, 0)]);
    expect(measureStability(off).deck).toBeUndefined();
    expect(assessStability(off).warnings.some((w) => w.check === 'deck')).toBe(false);
    expect(assessStability(off, FLUSH)).toEqual(off.stability);
    // Turned upper layers reach elsewhere; the deck share is the bottom layer's.
    const turned = build([at(0, 0)], FLUSH, 'alternate');
    expect(turned.layers[1]!.turned).toBe(true);
    expect(measureStability(turned, FLUSH).deck).toEqual({ share: 1, cartons: 0 });
  });

  it('an empty layout has no deck or group figures to warn about', () => {
    const empty = build([]);
    expect(empty.stability).toEqual({ rating: 'good', warnings: [] });
    expect(measureStability(empty, FLUSH)).toEqual({
      stackHeightRatio: 0,
      cartonHeight: null,
      support: null,
      columns: null,
    });
  });
});

describe('stored results', () => {
  it('keep the new warning and its fields through the result and analytics schemas', () => {
    const l = build([at(-60, 0), at(20, 25)]);
    expect(l.stability!.warnings.map((w) => w.check)).toEqual(['stackHeight', 'columns', 'deck']);
    const stored = optimizeResultSchema.parse(JSON.parse(JSON.stringify(resultOf(l))));
    expect(stored.layouts[0]!.layout.stability).toEqual(l.stability);
    expect(stored.layouts[0]!.layout.stability!.warnings[0]!.freeStanding).toBe(true);
    const a = computeAnalytics(l, FLUSH);
    const read = analyticsSchema.parse(JSON.parse(JSON.stringify(a)));
    expect(read.stability!.warnings).toEqual(l.stability!.warnings);
    expect(read.stability!.measures).toEqual(a.stability!.measures);
    expect(read.stability!.measures.freeStandingGroups).toBe(2);
  });
});

describe('calculated layouts', () => {
  it('are measured and rated by the four checks only, inputs given or not', () => {
    for (const inputs of [
      DEFAULT_INPUTS,
      OVER,
      PINWHEEL_INPUTS,
      { ...PINWHEEL_INPUTS, overhang: 6 },
    ]) {
      const { layouts } = optimize(inputs);
      expect(layouts.length).toBeGreaterThan(0);
      for (const { layout } of layouts) {
        const m = measureStability(layout, inputs);
        expect(Object.keys(m)).toEqual(['stackHeightRatio', 'cartonHeight', 'support', 'columns']);
        expect(m).toEqual(measureStability(layout));
        expect(m.stackHeightRatio).toBe(oldRule(layout).stackHeightRatio);
        expect(assessStability(layout, inputs)).toEqual(layout.stability);
        for (const w of layout.stability!.warnings) {
          expect(w.check).not.toBe('deck');
          expect('freeStanding' in w).toBe(false);
          expect('cartons' in w).toBe(false);
        }
      }
    }
  });
});

describe('any layout placed by hand', () => {
  it('is never rated better than by the old rule, and its stack ratio is never lower', () => {
    const rnd = seeded(20261112);
    const tally = { good: 0, fair: 0, poor: 0, worse: 0, split: 0, deck: 0, oneGroup: 0 };
    for (let n = 0; n < 400; n++) {
      const inputs: Inputs = {
        ...FLUSH,
        overhang: pick(rnd, 0, 6, 1),
        // Four in ten are low loads (1 to 3 layers), which can rate Good.
        pallet: {
          length: 80,
          width: 80,
          height: rnd() < 0.4 ? pick(rnd, 10, 20, 5) : pick(rnd, 22, 72, 2),
        },
      };
      // Cartons on a 25 x 17 grid of cells (no overlap), some turned in a cell of their own
      // size, on an 80 x 80 pallet; half the layers are then moved, a few of them far off it.
      const cells = new Set<string>();
      const cartons: ManualCarton[] = [];
      const count = pick(rnd, 1, 6, 1);
      const kind = rnd();
      const far = kind < 0.5 ? 0 : kind < 0.8 ? 4 : 40;
      const shift = { x: pick(rnd, -far, far, 0.5), y: pick(rnd, -far, far, 0.5) };
      while (cartons.length < count) {
        const cx = pick(rnd, 0, 2, 1);
        const cy = pick(rnd, 0, 2, 1);
        if (cells.has(`${cx},${cy}`)) continue;
        cells.add(`${cx},${cy}`);
        // Cells are 25 x 25. An unturned carton (25 x 17) fills its cell across and touches
        // the cells beside it; a turned one (17 x 25) those above and below. Some are moved
        // within the cell, which leaves corner contacts and gaps.
        const turned = rnd() < 0.3;
        const nudge = rnd() < 0.3 ? pick(rnd, 0, 8, 1) : 0;
        cartons.push(
          at(
            cx * 25 + shift.x + (turned ? nudge : 0),
            cy * 25 + shift.y + (turned ? 0 : nudge),
            turned,
          ),
        );
      }
      const upper = rnd() < 0.5 ? 'same' : 'alternate';
      const { layout, flags } = buildManualLayout(
        manualSpec({ cartons, upperLayers: upper }, inputs),
        inputs,
      );
      expect(flags.some((f) => f.kind === 'overlap')).toBe(false);
      const old = oldRule(layout);
      const rating = layout.stability!.rating;
      const m = measureStability(layout, inputs);
      expect(RANK[rating]).toBeGreaterThanOrEqual(RANK[old.rating]);
      expect(m.stackHeightRatio).toBeGreaterThanOrEqual(old.stackHeightRatio);
      if (m.freeStandingGroups === 1) {
        tally.oneGroup++;
        expect(m.stackHeightRatio).toBe(old.stackHeightRatio);
        // With one group and no deck warning, nothing has changed at all.
        if (!warning(layout, 'deck')) expect(rating).toBe(old.rating);
      } else {
        tally.split++;
      }
      // The warnings are the old ones, with the stack check possibly raised, and the deck's.
      const checks = layout.stability!.warnings.map((w) => w.check);
      expect(checks.filter((c) => c === 'deck').length).toBeLessThanOrEqual(1);
      if (warning(layout, 'deck')) tally.deck++;
      if (RANK[rating] > RANK[old.rating]) tally.worse++;
      tally[rating]++;
    }
    // The run really covers every rating, both new causes, and layouts left as they were.
    expect(tally.good).toBeGreaterThan(5);
    expect(tally.fair).toBeGreaterThan(20);
    expect(tally.poor).toBeGreaterThan(20);
    expect(tally.split).toBeGreaterThan(50);
    expect(tally.oneGroup).toBeGreaterThan(50);
    expect(tally.deck).toBeGreaterThan(50);
    expect(tally.worse).toBeGreaterThan(50);
  });
});
