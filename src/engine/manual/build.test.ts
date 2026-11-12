import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import { singleFieldVariants } from '../../domain/testSupport';
import type { Inputs, Layout, StabilityWarning } from '../../domain/types';
import { NAMED_CASES, randomCases } from '../autoBaseline.testSupport';
import { layoutWeight, trimToWeight } from '../analytics/weight';
import { optimize } from '../optimize';
import { usableFootprint } from '../packing/geometry';
import { assertNoOverlapWithin } from '../packing/overlap.testSupport';
import { cartonPlacements } from '../packing/positions';
import { overlappingPairs, PINWHEEL_INPUTS } from '../packing/testSupport';
import {
  bestCartonsFor,
  bestLayerFor,
  buildManualLayout,
  canSave,
  isOutOfDate,
  isValidDesign,
  isValidSpec,
  madeForOf,
  MANUAL_ID_PREFIX,
  specFromLayout,
  type ManualFlag,
  type ManualLayoutSpec,
} from './build';
import { designCarton, type CartonDesign } from './carton';
import { cartonBase, type ManualCarton } from './layer';

/** The default inputs with a maximum carton that the test carton (25 x 17 x 5) is within. */
const BASE: Inputs = { ...DEFAULT_INPUTS, maxCarton: { length: 26, width: 18, height: 16 } };
const asInputs = (i: object): Inputs => ({ ...BASE, ...i });
const at = (x: number, y: number, rotated = false): ManualCarton => ({ x, y, rotated });

/** Box 12 x 8 x 4 with leeway 0.5 and walls 0.25: a 2 x 2 x 1 carton is 25 x 17 x 5 outside. */
const DESIGN: CartonDesign = {
  counts: { length: 2, width: 2, height: 1 },
  facing: 'LWH',
  sideDown: 'base',
};

function spec(over: Partial<ManualLayoutSpec> = {}, inputs: Inputs = BASE) {
  const design = over.design ?? DESIGN;
  return {
    id: 'a1',
    name: 'Manual 1',
    design,
    cartons: [at(0, 0), at(25, 0), at(0, 17), at(25, 17)],
    upperLayers: 'same' as const,
    madeFor: madeForOf(design, inputs),
    ...over,
  };
}

const kinds = (flags: ManualFlag[]) => flags.map((f) => f.kind);
const flag = <K extends ManualFlag['kind']>(flags: ManualFlag[], kind: K) =>
  flags.find((f): f is Extract<ManualFlag, { kind: K }> => f.kind === kind);

describe('buildManualLayout', () => {
  it('stacks the layer to the height limit and counts like any layout', () => {
    // Pallet 50 x 42 x 72: 67 usable, cartons 5 tall: 13 layers of 4.
    const { layout, flags, status, inputs } = buildManualLayout(spec(), BASE);
    expect(status).toBe('current');
    expect(inputs).toBe(BASE);
    expect(flags).toEqual([]);
    expect(layout.id).toBe('manual:a1');
    expect(layout.id.startsWith(MANUAL_ID_PREFIX)).toBe(true);
    expect(layout.carton).toEqual(designCarton(DESIGN, BASE));
    expect(layout.layers).toHaveLength(13);
    expect(layout.totalCartons).toBe(52);
    expect(layout.totalProducts).toBe(208);
    expect(layout.layers.map((l) => l.z)).toEqual(Array.from({ length: 13 }, (_, k) => k * 5));
    for (const layer of layout.layers) {
      expect(layer.kind).toBe('manual');
      expect(layer.vertical).toBe('H');
      expect(layer.height).toBe(5);
      expect(layer.cartonCount).toBe(4);
      expect(layer.turned).toBeUndefined();
      // One block list for the whole stack, as calculated layers share theirs.
      expect(layer.blocks).toBe(layout.layers[0]!.blocks);
    }
    expect(layout.layers[0]!.blocks).toEqual([
      { x: 0, y: 0, cols: 1, rows: 1, rotated: false },
      { x: 25, y: 0, cols: 1, rows: 1, rotated: false },
      { x: 0, y: 17, cols: 1, rows: 1, rotated: false },
      { x: 25, y: 17, cols: 1, rows: 1, rotated: false },
    ]);
    expect(layout.layers[0]!.extent).toEqual({ x: 50, y: 34 });
    expect(layout.stability).toBeDefined();
    expect(canSave(flags)).toBe(true);
  });

  it('places cartons exactly where the spec says, not centred', () => {
    const { layout } = buildManualLayout(spec({ cartons: [at(3, 1), at(20, 20, true)] }), BASE);
    const placed = cartonPlacements(layout, BASE).filter((c) => c.layerIndex === 0);
    expect(placed.map((c) => [c.x, c.y, c.dx, c.dy])).toEqual([
      [3, 1, 25, 17],
      [20, 20, 17, 25],
    ]);
  });

  it('stands the carton on the side asked for', () => {
    const { layout } = buildManualLayout(
      spec({ design: { ...DESIGN, sideDown: 'side' }, cartons: [at(0, 0)] }),
      BASE,
    );
    // Width upright: 17 tall, base 25 x 5; 67 usable gives 3 layers.
    expect(layout.layers[0]!.vertical).toBe('W');
    expect(layout.layers).toHaveLength(3);
    const [c] = cartonPlacements(layout, BASE);
    expect([c!.dx, c!.dy, c!.dz]).toEqual([25, 5, 17]);
  });

  describe('upper layers', () => {
    // Off centre, so a half turn moves the cartons.
    const cartons = [at(0, 0), at(25, 0)];

    it("'same' repeats the layer", () => {
      const { layout } = buildManualLayout(spec({ cartons }), BASE);
      expect(layout.layers.every((l) => !l.turned)).toBe(true);
    });

    it("'alternate' turns every second layer half a turn about the footprint centre", () => {
      const { layout, flags } = buildManualLayout(
        spec({ cartons, upperLayers: 'alternate' }),
        BASE,
      );
      expect(flags).toEqual([]);
      expect(layout.layers.map((l) => !!l.turned)).toEqual(
        Array.from({ length: 13 }, (_, k) => k % 2 === 1),
      );
      // Footprint 50 x 42: (0, 0) 25 x 17 turns to (25, 25).
      const turned = layout.layers[1]!;
      expect(turned.kind).toBe('manual');
      expect(turned.blocks.map((b) => [b.x, b.y]).sort()).toEqual([
        [0, 25],
        [25, 25],
      ]);
      expect(layout.layers[3]!.blocks).toBe(turned.blocks);
      expect(layout.layers[2]!.blocks).toBe(layout.layers[0]!.blocks);
      expect(layout.totalCartons).toBe(26);
      // The turned layers rest on nothing here (the rows do not meet): a serious warning.
      expect(layout.stability?.rating).toBe('poor');
      expect(layout.stability?.warnings.find((w) => w.check === 'support')?.value).toBe(0);
      expect(overlappingPairs(cartonPlacements(layout, BASE))).toBe(0);
    });

    it("'alternate' leaves layers unmarked when the turn moves no carton", () => {
      // 50 x 34 block centred in 50 x 42: it is its own half turn.
      const centred = [at(0, 4), at(25, 4), at(0, 21), at(25, 21)];
      const { layout } = buildManualLayout(
        spec({ cartons: centred, upperLayers: 'alternate' }),
        BASE,
      );
      expect(layout.layers.every((l) => !l.turned)).toBe(true);
    });

    it('a turned layer overhangs exactly as the layer as built does, on the other side', () => {
      const inputs = asInputs({ overhang: 2 });
      const { x: ux } = usableFootprint(inputs);
      const { a: baseA } = cartonBase(designCarton(DESIGN, inputs), 'H');
      // One carton hanging 3 in off the left; nothing near the right edge.
      const cartons = [at(-3, 0), at(22, 0)];
      const same = buildManualLayout(spec({ cartons, upperLayers: 'same' }, inputs), inputs);
      const alt = buildManualLayout(spec({ cartons, upperLayers: 'alternate' }, inputs), inputs);
      expect(flag(same.flags, 'overhang')).toEqual({ kind: 'overhang', cartons: 1, by: 3 });
      // The half turn is about the centre of the usable footprint, so the flag is the same.
      expect(alt.flags).toEqual(same.flags);
      // And the turned layer really does hang off the right by as much.
      const turned = alt.layout.layers[1]!;
      expect(turned.turned).toBe(true);
      const right = Math.max(...turned.blocks.map((blk) => blk.x + baseA));
      const left = Math.min(...turned.blocks.map((blk) => blk.x));
      expect(right).toBeCloseTo(ux + 3, 9);
      expect(left).toBeGreaterThanOrEqual(0);
      const placed = cartonPlacements(alt.layout, inputs).filter((c) => c.layerIndex === 1);
      expect(Math.max(...placed.map((c) => c.x + c.dx))).toBeCloseTo(ux + 3, 9);
    });
  });

  describe('weight', () => {
    const weighed = (maxPallet: number | null) =>
      asInputs({ weights: { productBox: 5, maxPallet, emptyCarton: 1, pallet: 40 } });

    it('reports the weight of the full stack without a maximum', () => {
      const i = weighed(null);
      const { layout, flags } = buildManualLayout(spec({}, i), i);
      // 52 cartons of 4 x 5 + 1 lb, plus the pallet.
      expect(layoutWeight(layout, i)?.total).toBe(40 + 52 * 21);
      expect(flags).toEqual([]);
      expect(layout.weightTrim).toBeUndefined();
    });

    it('removes whole layers from the top exactly as the existing trim does', () => {
      const i = weighed(500);
      const full = buildManualLayout(spec({}, weighed(null)), weighed(null)).layout;
      const expected = trimToWeight(full, i)!;
      const { layout, flags } = buildManualLayout(spec({}, i), i);
      // (500 - 40) / 84 = 5.47: five layers.
      expect(layout.layers).toHaveLength(5);
      expect(layout.layers).toHaveLength(expected.layers.length);
      expect(layout.totalProducts).toBe(expected.totalProducts);
      expect(layout.weightTrim).toEqual({ layersRemoved: 8 });
      expect(layout.weightTrim).toEqual(expected.weightTrim);
      expect(layout.id).toBe('manual:a1');
      expect(layoutWeight(layout, i)!.total).toBeLessThanOrEqual(500);
      expect(flags).toEqual([]);
    });

    it('keeps one layer and flags the excess when even one layer is over', () => {
      const i = weighed(100);
      const { layout, flags } = buildManualLayout(spec({}, i), i);
      expect(layout.layers).toHaveLength(1);
      expect(layout.totalCartons).toBe(4);
      expect(layout.totalProducts).toBe(16);
      // 40 + 4 x 21 = 124 against 100.
      expect(flags).toEqual([{ kind: 'overWeight', by: 24 }]);
      expect(layout.weightTrim).toEqual({ layersRemoved: 12 });
      expect(canSave(flags)).toBe(true);
      expect(layout.stability).toBeDefined();
    });

    it('is not flagged when one layer is exactly at the maximum', () => {
      const i = weighed(124);
      const { layout, flags } = buildManualLayout(spec({}, i), i);
      expect(layout.layers).toHaveLength(1);
      expect(flags).toEqual([]);
    });
  });

  describe('flags', () => {
    it('counts the cartons outside the usable footprint and the largest overhang', () => {
      const cartons = [at(-1.5, 0), at(23.5, 0), at(0, 17), at(27, 26)];
      const { flags, layout } = buildManualLayout(spec({ cartons }), BASE);
      // The first is 1.5 out on the left; the last 2 out on the right and 1 out at the front.
      expect(flags).toEqual([{ kind: 'overhang', cartons: 2, by: 2 }]);
      expect(canSave(flags)).toBe(true);
      expect(layout.totalCartons).toBe(52);
    });

    it('the allowed overhang is part of the footprint', () => {
      const i = asInputs({ overhang: 4 });
      // Footprint 54 x 46, the pallet inset by 2: a carton at 0 overhangs the pallet, allowed.
      expect(buildManualLayout(spec({ cartons: [at(0, 0), at(29, 29)] }, i), i).flags).toEqual([]);
      expect(
        flag(buildManualLayout(spec({ cartons: [at(-0.5, 0)] }, i), i).flags, 'overhang'),
      ).toEqual({ kind: 'overhang', cartons: 1, by: 0.5 });
    });

    it('flags a carton over the maximum carton size, naming the sides', () => {
      const design: CartonDesign = { ...DESIGN, counts: { length: 3, width: 2, height: 1 } };
      const { flags } = buildManualLayout(spec({ design, cartons: [at(0, 0)] }), BASE);
      expect(flags).toEqual([
        { kind: 'overMaximum', sides: [{ side: 'longest', size: 37, max: 26, by: 11 }] },
      ]);
      expect(canSave(flags)).toBe(true);
    });

    it('flags an empty layer, which cannot be saved, and stacks nothing', () => {
      const { layout, flags } = buildManualLayout(spec({ cartons: [] }), BASE);
      expect(kinds(flags)).toEqual(['empty']);
      expect(canSave(flags)).toBe(false);
      expect(layout.layers).toEqual([]);
      expect(layout.totalProducts).toBe(0);
      expect(layout.stability?.rating).toBe('good');
    });

    it('flags a carton that cannot fit the footprint, which cannot be saved', () => {
      const design: CartonDesign = { ...DESIGN, counts: { length: 5, width: 1, height: 1 } };
      const { flags } = buildManualLayout(spec({ design, cartons: [at(0, 0)] }), BASE);
      expect(kinds(flags)).toEqual(['cannotFit', 'overMaximum', 'overhang']);
      expect(canSave(flags)).toBe(false);
    });

    it('flags a carton taller than the height limit, keeps one layer, and cannot be saved', () => {
      const i = asInputs({ pallet: { length: 50, width: 42, height: 8 } });
      const { layout, flags } = buildManualLayout(spec({}, i), i);
      expect(flag(flags, 'overHeight')).toEqual({ kind: 'overHeight', by: 2 });
      expect(layout.layers).toHaveLength(1);
      expect(canSave(flags)).toBe(false);
    });

    it('flags overlapping cartons in stored data, which cannot be saved', () => {
      const { flags } = buildManualLayout(spec({ cartons: [at(0, 0), at(10, 5)] }), BASE);
      expect(flag(flags, 'overlap')).toEqual({ kind: 'overlap', pairs: 1 });
      expect(canSave(flags)).toBe(false);
    });

    it('notes a box standing a way up the rotation inputs would not allow', () => {
      const i = asInputs({ rotationMode: 'upright' });
      const design: CartonDesign = { ...DESIGN, sideDown: 'side' };
      const { flags } = buildManualLayout(spec({ design, cartons: [at(0, 0)] }, i), i);
      expect(kinds(flags)).toEqual(['orientationNotAllowed']);
      expect(canSave(flags)).toBe(true);
    });
  });
});

describe('out of date (spec 6.6)', () => {
  const made = spec();
  const CARTON_INPUTS = /^(product\.|wallThickness$|leeway$)/;

  it('is current under the inputs it was made for', () => {
    expect(isOutOfDate(made, BASE)).toBe(false);
  });

  for (const { path, inputs } of singleFieldVariants(BASE)) {
    const expected = CARTON_INPUTS.test(path) ? 'outOfDate' : 'current';
    it(`${expected} when ${path} changes`, () => {
      const built = buildManualLayout(made, inputs);
      expect(built.status).toBe(expected);
      expect(isOutOfDate(made, inputs)).toBe(expected === 'outOfDate');
      if (expected === 'current') expect(built.inputs).toBe(inputs);
    });
  }

  it('covers every input that should and should not cause it', () => {
    const paths = singleFieldVariants(BASE).map((v) => v.path);
    for (const p of [
      'product.length',
      'product.width',
      'product.height',
      'wallThickness',
      'leeway',
      'pallet.length',
      'pallet.width',
      'pallet.height',
      'overhang',
      'maxCarton.length',
      'maxCarton.width',
      'maxCarton.height',
      'weights.productBox',
      'weights.maxPallet',
      'weights.emptyCarton',
      'weights.pallet',
    ]) {
      expect(paths).toContain(p);
    }
  });

  it('is current when the changes leave the carton the same size outside', () => {
    // Leeway up 0.5 and each wall down 0.25: the same outer size.
    const i = asInputs({ leeway: 1, wallThickness: 0 });
    expect(buildManualLayout(made, i).status).toBe('current');
  });

  it('a product change along a side with boxes puts it out of date, however small', () => {
    const i = asInputs({ product: { length: 12.01, width: 8, height: 4 } });
    expect(buildManualLayout(made, i).status).toBe('outOfDate');
  });

  it('is re-checked against a new pallet, overhang, height and weight while current', () => {
    const smaller = asInputs({ pallet: { length: 48, width: 40, height: 30 } });
    const built = buildManualLayout(made, smaller);
    expect(built.status).toBe('current');
    expect(built.layout.layers).toHaveLength(5);
    // 50 wide on a 48 pallet: both right-hand cartons overhang by 2.
    expect(built.flags).toEqual([{ kind: 'overhang', cartons: 2, by: 2 }]);
    const allowed = buildManualLayout(made, { ...smaller, overhang: 4 });
    expect(allowed.flags).toEqual([]);
    const max = asInputs({ maxCarton: { length: 20, width: 18, height: 16 } });
    expect(kinds(buildManualLayout(made, max).flags)).toEqual(['overMaximum']);
  });

  it('an out-of-date layout is built as it was made, on the current pallet', () => {
    const i = asInputs({
      product: { length: 14, width: 8, height: 4 },
      pallet: { length: 50, width: 42, height: 30 },
    });
    const built = buildManualLayout(made, i);
    expect(built.status).toBe('outOfDate');
    expect(built.layout.carton.outer).toEqual(made.madeFor.outer);
    expect(built.inputs.product).toEqual(BASE.product);
    expect(built.inputs.pallet).toEqual(i.pallet);
    expect(built.layout.layers).toHaveLength(5);
    expect(built.flags).toEqual([]);
  });
});

describe('bestLayerFor', () => {
  const pinwheelDesign: CartonDesign = {
    counts: { length: 1, width: 1, height: 1 },
    facing: 'LWH',
    sideDown: 'base',
  };

  it('is the layer the search uses for that carton', () => {
    const best = optimize(DEFAULT_INPUTS).layouts[0]!.layout;
    const s = specFromLayout(best, DEFAULT_INPUTS, 'x', 'Manual 1')!;
    const layer = bestLayerFor(s.design, DEFAULT_INPUTS)!;
    expect(layer.cartonCount).toBe(best.layers[0]!.cartonCount);
    expect(layer.vertical).toBe(best.layers[0]!.vertical);
  });

  it('Auto takes the pinwheel that holds more', () => {
    const layer = bestLayerFor(pinwheelDesign, PINWHEEL_INPUTS)!;
    expect(layer.kind).toBe('pinwheel');
    expect(layer.cartonCount).toBe(10);
    const cartons = bestCartonsFor(pinwheelDesign, PINWHEEL_INPUTS);
    expect(cartons).toHaveLength(10);
    const { x, y } = usableFootprint(PINWHEEL_INPUTS);
    const blocks = cartons.map((c) => ({ ...c, cols: 1, rows: 1 }));
    assertNoOverlapWithin(blocks, 16.5, 10.5, x, y);
  });

  it('Prefer pinwheel takes a pinwheel that ties; Auto keeps straight cuts', () => {
    // 12 x 8 cartons on 40 x 40: straight cuts and a pinwheel both hold 16.
    const base = asInputs({
      pallet: { length: 40, width: 40, height: 60 },
      product: { length: 12, width: 8, height: 10 },
      leeway: 0,
      wallThickness: 0,
    });
    const auto = bestLayerFor(pinwheelDesign, base)!;
    const prefer = bestLayerFor(pinwheelDesign, { ...base, layerPattern: 'preferPinwheel' })!;
    expect(auto.kind).toBeUndefined();
    expect(prefer.cartonCount).toBeGreaterThanOrEqual(auto.cartonCount);
    expect(prefer.kind).toBe('pinwheel');
    const only = bestLayerFor(pinwheelDesign, { ...base, layerPattern: 'pinwheelOnly' })!;
    expect(only.kind).toBe('pinwheel');
  });

  it('Pinwheel only falls back to straight cuts when no pinwheel exists', () => {
    // A square base has no pinwheel.
    const square = asInputs({
      product: { length: 10, width: 10, height: 6 },
      leeway: 0,
      wallThickness: 0,
      layerPattern: 'pinwheelOnly',
    });
    const layer = bestLayerFor(pinwheelDesign, square)!;
    expect(layer.kind).toBeUndefined();
    expect(layer.cartonCount).toBe(20);
  });

  it('is null, and no cartons, when not one carton fits the footprint', () => {
    const big: CartonDesign = { ...pinwheelDesign, counts: { length: 5, width: 1, height: 1 } };
    expect(bestLayerFor(big, DEFAULT_INPUTS)).toBeNull();
    expect(bestCartonsFor(big, DEFAULT_INPUTS)).toEqual([]);
  });
});

/** Whether every layer of a calculated layout is its bottom layer, turned or not. */
function onePattern(l: Layout): boolean {
  const bottom = l.layers[0]!;
  const key = (blocks: Layout['layers'][number]['blocks']) =>
    blocks
      .map((b) => `${b.cols}x${b.rows}${b.rotated ? 'r' : 'u'}`)
      .sort()
      .join(',');
  return l.layers.every(
    (layer) =>
      layer.vertical === bottom.vertical &&
      layer.cartonCount === bottom.cartonCount &&
      (layer.blocks === bottom.blocks ||
        (layer.turned && key(layer.blocks) === key(bottom.blocks))),
  );
}

/**
 * What the rating of a manual copy must be, worked out here from the calculated layout's own
 * cartons. A copy is rated by the calculated layout's four checks with two differences, both
 * meant (a manual layout is checked for them, a calculated one is not):
 *
 * - `split`: the bottom layer stands in several groups that do not touch along an edge (some
 *   pinwheel layers leave a block a fraction of an inch clear of the others). The stack
 *   height check is then made on the narrowest group, so it can warn where the calculated
 *   layout does not, or more seriously.
 * - `deck`: a bottom carton has under 90% of its base on the pallet, which only the allowed
 *   overhang makes possible. The copy then has a deck warning the calculated layout lacks.
 *
 * With neither, the copy's rating and warnings are the calculated layout's, exactly.
 */
function expectedCopyStability(layout: Layout, inputs: Inputs) {
  const TOL = 1e-9;
  const rects = cartonPlacements(layout, inputs).filter((p) => p.layerIndex === 0);
  // Groups of cartons joined along an edge, the slow obvious way.
  const group = rects.map((_, k) => k);
  const touch = (p: (typeof rects)[number], q: (typeof rects)[number]) => {
    const alongX = Math.min(p.x + p.dx, q.x + q.dx) - Math.max(p.x, q.x);
    const alongY = Math.min(p.y + p.dy, q.y + q.dy) - Math.max(p.y, q.y);
    return (alongX >= -TOL && alongY > TOL) || (alongY >= -TOL && alongX > TOL);
  };
  for (let changed = true; changed;) {
    changed = false;
    for (let p = 0; p < rects.length; p++) {
      for (let q = p + 1; q < rects.length; q++) {
        if (group[p] !== group[q] && touch(rects[p]!, rects[q]!)) {
          const keep = Math.min(group[p]!, group[q]!);
          const drop = Math.max(group[p]!, group[q]!);
          group.forEach((g, k) => {
            if (g === drop) group[k] = keep;
          });
          changed = true;
        }
      }
    }
  }
  const ids = [...new Set(group)];
  const narrowest = Math.min(
    ...ids.map((id) => {
      const mine = rects.filter((_, k) => group[k] === id);
      const w = Math.max(...mine.map((r) => r.x + r.dx)) - Math.min(...mine.map((r) => r.x));
      const h = Math.max(...mine.map((r) => r.y + r.dy)) - Math.min(...mine.map((r) => r.y));
      return Math.min(w, h);
    }),
  );
  // The pallet in the frame of the placements: inset by half the allowed overhang.
  const inset = inputs.overhang / 2;
  const shares = rects.map((r) => {
    const w = Math.min(r.x + r.dx, inset + inputs.pallet.length) - Math.max(r.x, inset);
    const h = Math.min(r.y + r.dy, inset + inputs.pallet.width) - Math.max(r.y, inset);
    return (Math.max(0, w) * Math.max(0, h)) / (r.dx * r.dy);
  });
  const worst = Math.min(...shares);

  const split = ids.length > 1;
  const deck = worst < 0.9 - TOL;
  let warnings: StabilityWarning[] = layout.stability!.warnings.map((w) => ({ ...w }));
  if (split) {
    const height = layout.layers.reduce((sum, l) => sum + l.height, 0);
    const value = height / narrowest;
    warnings = warnings.filter((w) => w.check !== 'stackHeight');
    if (value > 1.5 + TOL) {
      warnings.unshift({
        check: 'stackHeight',
        level: value > 2 + TOL ? 'serious' : 'caution',
        value,
        freeStanding: true,
      });
    }
  }
  if (deck) {
    warnings.push({
      check: 'deck',
      level: worst < 0.7 - TOL ? 'serious' : 'caution',
      value: worst,
      cartons: shares.filter((s) => s < 0.9 - TOL).length,
    });
  }
  const rating = warnings.some((w) => w.level === 'serious')
    ? 'poor'
    : warnings.length > 0
      ? 'fair'
      : 'good';
  return { split, deck, rating, warnings };
}

interface CopyTally {
  same: number;
  turned: number;
  trimmed: number;
  mixed: number;
  /** Copies whose bottom layer stands in several groups. */
  split: number;
  /** Copies with a deck warning. */
  deck: number;
  /** Copies rated worse than the calculated layout (never better). */
  worse: number;
}
const noTally = (): CopyTally => ({
  same: 0,
  turned: 0,
  trimmed: 0,
  mixed: 0,
  split: 0,
  deck: 0,
  worse: 0,
});
const RANK = { good: 0, fair: 1, poor: 2 } as const;

/** Copies one calculated layout by hand and checks the copy against it. */
function checkCopy(name: string, layout: Layout, inputs: Inputs, tally: CopyTally) {
  const copy = specFromLayout(layout, inputs, 'copy', 'Manual 1')!;
  const built = buildManualLayout(copy, inputs);
  expect(built.status).toBe('current');
  expect(built.layout.carton).toEqual(layout.carton);
  const base = cartonBase(layout.carton, layout.layers[0]!.vertical);
  const { x, y } = usableFootprint(inputs);
  assertNoOverlapWithin(built.layout.layers[0]!.blocks, base.a, base.b, x, y);
  if (!onePattern(layout)) {
    // A layout that mixes layer patterns: the copy stacks its bottom layer only.
    tally.mixed++;
    expect(built.layout.layers[0]!.cartonCount).toBe(layout.layers[0]!.cartonCount);
    expect(built.layout.layers.every((l) => l.vertical === layout.layers[0]!.vertical)).toBe(true);
    return;
  }
  tally.same++;
  if (layout.layers.some((l) => l.turned)) tally.turned++;
  if (layout.weightTrim) tally.trimmed++;
  const where = `${name} ${layout.id}`;
  expect(built.flags, where).toEqual([]);
  expect(built.layout.layers.length, where).toBe(layout.layers.length);
  expect(built.layout.totalCartons, where).toBe(layout.totalCartons);
  expect(built.layout.totalProducts, where).toBe(layout.totalProducts);
  expect(
    built.layout.layers.map((l) => !!l.turned),
    where,
  ).toEqual(layout.layers.map((l) => !!l.turned));
  expect(layoutWeight(built.layout, inputs), where).toEqual(layoutWeight(layout, inputs));

  // Stability: the calculated layout's, but for the two differences said above.
  const expected = expectedCopyStability(layout, inputs);
  const calculated = layout.stability!;
  if (!expected.split && !expected.deck) {
    expect(expected.warnings, where).toEqual(calculated.warnings);
    expect(expected.rating, where).toBe(calculated.rating);
  }
  if (expected.split) tally.split++;
  if (expected.deck) tally.deck++;
  const stability = built.layout.stability!;
  expect(stability.rating, where).toBe(expected.rating);
  expect(RANK[stability.rating], where).toBeGreaterThanOrEqual(RANK[calculated.rating]);
  if (stability.rating !== calculated.rating) tally.worse++;
  const fields = (w: StabilityWarning) => [w.check, w.level, w.layer, w.freeStanding, w.cartons];
  expect(stability.warnings.map(fields), where).toEqual(expected.warnings.map(fields));
  stability.warnings.forEach((w, k) => {
    expect(w.value, where).toBeCloseTo(expected.warnings[k]!.value, 9);
  });
  // Every warning but the deck's, and the stack's of a split layer, is the calculated one.
  const kept = (w: StabilityWarning) =>
    w.check !== 'deck' && !(expected.split && w.check === 'stackHeight');
  expect(
    stability.warnings.filter(kept).map((w) => [w.check, w.level, w.layer]),
    where,
  ).toEqual(calculated.warnings.filter(kept).map((w) => [w.check, w.level, w.layer]));

  // Carton for carton in the same places.
  const mine = cartonPlacements(built.layout, inputs);
  const theirs = cartonPlacements(layout, inputs);
  expect(mine.length).toBe(theirs.length);
  const spot = (p: { x: number; y: number; z: number; dx: number; dy: number }) =>
    [p.z, p.x, p.y, p.dx, p.dy].map((v) => v.toFixed(6)).join(',');
  expect(mine.map(spot).sort(), where).toEqual(theirs.map(spot).sort());
}

describe('a manual copy of a calculated layout', () => {
  it('reports the same boxes, weight, layers and stability as the calculated layout', () => {
    const tally = noTally();
    for (const c of [...NAMED_CASES, ...randomCases(40, 5150)]) {
      const inputs = asInputs(c.inputs);
      for (const { layout } of optimize(inputs).layouts) checkCopy(c.name, layout, inputs, tally);
    }
    // The run must really cover turned, trimmed and mixed layouts.
    expect(tally.same).toBeGreaterThan(150);
    expect(tally.turned).toBeGreaterThan(20);
    expect(tally.trimmed).toBeGreaterThan(5);
    expect(tally.mixed).toBeGreaterThan(5);
    // Exactly how many copies in this run differ in stability, and why: 4 have a deck warning
    // (cautions on layouts already Fair or Poor, so no rating changes) and none has a split
    // bottom layer. A change to any of these numbers is a change to the rating.
    expect({ split: tally.split, deck: tally.deck, worse: tally.worse }).toEqual({
      split: 0,
      deck: 4,
      worse: 0,
    });
  }, 120_000);

  it('is rated worse where its layer stands in separate groups or hangs off the pallet', () => {
    // A longer run, in which both differences occur and change ratings. Of its 2321
    // one-pattern layouts (730 of them from the 187 inputs that allow overhang), 114 copies
    // get a deck warning, 36 stand in separate groups (all pinwheel layers) and 31 are rated
    // worse than the calculated layout. Every one is checked against the expected rating.
    const tally = noTally();
    for (const c of [...NAMED_CASES, ...randomCases(600, 77)]) {
      const inputs = asInputs(c.inputs);
      for (const { layout } of optimize(inputs).layouts) checkCopy(c.name, layout, inputs, tally);
    }
    expect(tally).toMatchObject({ same: 2321, split: 36, deck: 114, worse: 31 });
  }, 300_000);
});

describe('a spec the editor could not have made', () => {
  const bad: [string, Partial<ManualLayoutSpec>][] = [
    ['a position that is NaN', { cartons: [at(NaN, 0)] }],
    ['a position that is infinite', { cartons: [at(0, Infinity)] }],
    ['a position that is not a number', { cartons: [{ x: '1', y: 0, rotated: false } as never] }],
    ['a turn that is not a boolean', { cartons: [{ x: 0, y: 0, rotated: 1 } as never] }],
    ['a missing carton', { cartons: [null as never] }],
    ['cartons that are not a list', { cartons: null as never }],
    ['a count of 0', { design: { ...DESIGN, counts: { length: 0, width: 2, height: 1 } } }],
    ['a count of 1.5', { design: { ...DESIGN, counts: { length: 2, width: 1.5, height: 1 } } }],
    ['a count of -1', { design: { ...DESIGN, counts: { length: 2, width: 2, height: -1 } } }],
    [
      'a count that is NaN',
      { design: { ...DESIGN, counts: { length: NaN, width: 2, height: 1 } } },
    ],
    ['an unknown facing', { design: { ...DESIGN, facing: 'XYZ' as never } }],
    ['an unknown side down', { design: { ...DESIGN, sideDown: 'top' as never } }],
    ['an unknown upper-layer choice', { upperLayers: 'spiral' as never }],
  ];

  it.each(bad)('%s is refused: flagged invalid, nothing built, cannot be saved', (_, over) => {
    const s = spec(over);
    expect(isValidSpec(s)).toBe(false);
    const build = buildManualLayout(s, BASE);
    expect(build.flags).toEqual([{ kind: 'invalid' }]);
    expect(canSave(build.flags)).toBe(false);
    expect(build.layout).toMatchObject({
      id: MANUAL_ID_PREFIX + s.id,
      layers: [],
      totalCartons: 0,
      totalProducts: 0,
    });
    expect(Number.isFinite(build.layout.carton.boxesPerCarton)).toBe(true);
  });

  it.each([
    ['a product size of 0', { product: { length: 0, width: 8, height: 4 } }],
    ['an outer size that is NaN', { outer: { L: NaN, W: 17, H: 5 } }],
    ['a negative wall thickness', { wallThickness: -1 }],
    ['an infinite leeway', { leeway: Infinity }],
  ])('%s in madeFor is refused', (_, over) => {
    const good = spec();
    const s = { ...good, madeFor: { ...good.madeFor, ...over } };
    expect(isValidSpec(s)).toBe(false);
    expect(buildManualLayout(s, BASE).flags).toEqual([{ kind: 'invalid' }]);
  });

  it('isValidDesign and isValidSpec pass what the editor makes', () => {
    expect(isValidDesign(DESIGN)).toBe(true);
    expect(isValidSpec(spec())).toBe(true);
    expect(isValidSpec(spec({ cartons: [] }))).toBe(true);
    expect(isValidSpec(spec({ cartons: [at(-30.5, 1e6, true)] }))).toBe(true);
    expect(flag(buildManualLayout(spec(), BASE).flags, 'invalid')).toBeUndefined();
  });
});
