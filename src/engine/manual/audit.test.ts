/**
 * Everything that reads a layer's blocks, given a layer placed by hand: cartons at negative
 * positions and beyond the usable footprint, not centred, one block per carton.
 */
import { describe, expect, it } from 'vitest';
import type { Layer, Layout } from '../../domain/types';
import { computeAnalytics } from '../analytics/analytics';
import { stackPatterns, stackRuns, turnedLayerNumbers, layerKind } from '../analytics/stack';
import {
  assessStability,
  measureStability,
  sameCartonRects,
  supportShare,
} from '../analytics/stability';
import { unusedSpace } from '../analytics/unusedSpace';
import { availableVolume, usableFootprint, usableHeight } from '../packing/geometry';
import { interlockLayers, turnBlocks } from '../packing/interlock';
import { optimize } from '../optimize';
import { layoutMetrics } from '../packing/metrics';
import { cartonPlacements, layerOffset } from '../packing/positions';
import { layoutSignature } from '../packing/stacking';
import { overlappingPairs } from '../packing/testSupport';
import { isPinwheelLayout } from '../ranking/score';
import { buildManualLayout } from './build';
import { manualPattern } from './layer';
import {
  manualSpec,
  overhangingLayout,
  OVERHANG_INPUTS as I,
  OVERHANGING_CARTONS,
  TEST_DESIGN,
} from './testSupport';

const finite = (value: unknown, path = ''): void => {
  if (typeof value === 'number') expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) finite(v, `${path}.${k}`);
  }
};

const L = overhangingLayout();
const SAME = overhangingLayout({ upperLayers: 'same' });
const usable = usableFootprint(I); // 52 x 44

describe('placements of a manual layer', () => {
  it('are where the blocks say, negative and beyond the footprint included, never centred', () => {
    expect(layerOffset(L.layers[0]!, 25, 17, usable)).toEqual({ x: 0, y: 0 });
    const bottom = cartonPlacements(L, I).filter((c) => c.layerIndex === 0);
    expect(bottom.map((c) => [c.x, c.y, c.dx, c.dy])).toEqual([
      [-3, -2, 25, 17],
      [32, 20, 25, 17],
      [5, 16, 17, 25],
    ]);
    expect(overlappingPairs(cartonPlacements(L, I))).toBe(0);
  });

  it('a turned layer is the half turn about the footprint centre, wherever that puts cartons', () => {
    const turned = cartonPlacements(L, I).filter((c) => c.layerIndex === 1);
    // (x, y) w x h turns to (52 - x - w, 44 - y - h).
    expect(turned.map((c) => [c.x, c.y, c.dx, c.dy]).sort((p, q) => p[0]! - q[0]!)).toEqual([
      [-5, 7, 25, 17],
      [30, 3, 17, 25],
      [30, 29, 25, 17],
    ]);
  });
});

describe('turnBlocks and interlocking', () => {
  it('turns single-carton blocks at negative positions', () => {
    const blocks = L.layers[0]!.blocks;
    const turned = turnBlocks(blocks, 25, 17, usable.x, usable.y, 'manual');
    expect(turned).toHaveLength(3);
    // Turning twice gives the layer back.
    const back = turnBlocks(turned, 25, 17, usable.x, usable.y, 'manual');
    expect(back).toEqual(blocks);
  });

  it('interlocking leaves a manual layout exactly as it is, id included', () => {
    expect(interlockLayers(SAME, I)).toBe(SAME);
    expect(interlockLayers(L, I)).toBe(L);
    expect(interlockLayers(SAME, I).id).toBe('manual:test');
  });
});

describe('stability of a manual layout', () => {
  it('measures support where the cartons really are, not centred layer on layer', () => {
    const [bottom, second] = L.layers as [Layer, Layer];
    // Bottom: A (-3,-2) 25x17, B (32,20) 25x17, C (5,16) 17x25.
    // Turned: A' (30,29) 25x17, B' (-5,7) 25x17, C' (30,3) 17x25.
    // Overlaps: A' on B 23 x 8 = 184; B' on A 23 x 8 = 184, on C 15 x 8 = 120;
    // C' on B 15 x 8 = 120. Total 608 of 3 x 425.
    expect(supportShare(second, bottom, L)).toBeCloseTo(608 / 1275, 12);
    // A second call (answered from the remembered pair) says the same.
    expect(supportShare(second, bottom, L)).toBeCloseTo(608 / 1275, 12);
    expect(supportShare(bottom, second, L)).toBeCloseTo(608 / 1275, 12);
    expect(supportShare(bottom, bottom, L)).toBe(1);
  });

  it('a layer moved sideways is less supported, though its bounding box is the same size', () => {
    // Centring by bounding box would call these two identical.
    const carton = L.carton;
    const lower = { ...manualPattern([{ x: 0, y: 0, rotated: false }], carton, 'H'), z: 0 };
    const upper = { ...manualPattern([{ x: 10, y: 0, rotated: false }], carton, 'H'), z: 5 };
    const layout: Layout = { ...L, layers: [lower, upper] };
    expect(supportShare(upper, lower, layout)).toBeCloseTo(15 / 25, 12);
    expect(sameCartonRects(upper, lower, carton)).toBe(false);
    expect(sameCartonRects(lower, { ...lower, blocks: [...lower.blocks] }, carton)).toBe(true);
  });

  it('remembers a support share per carton footprint, not per block list alone', () => {
    const lower = { ...manualPattern([{ x: 0, y: 0, rotated: false }], L.carton, 'H'), z: 0 };
    const upper = { ...manualPattern([{ x: 10, y: 0, rotated: false }], L.carton, 'H'), z: 5 };
    const layout: Layout = { ...L, layers: [lower, upper] };
    expect(supportShare(upper, lower, layout)).toBeCloseTo(0.6, 12);
    const wider = { ...L.carton, outer: { ...L.carton.outer, L: 50 } };
    expect(supportShare(upper, lower, { ...layout, carton: wider })).toBeCloseTo(0.8, 12);
  });

  it('rates the layout with finite measures; identical layers count as columns', () => {
    const m = measureStability(L);
    finite(m);
    expect(m.support?.share).toBeCloseTo(608 / 1275, 12);
    expect(m.columns?.layers).toBe(1);
    expect(assessStability(L, I).rating).toBe('poor');
    const same = measureStability(SAME);
    expect(same.support?.share).toBe(1);
    expect(same.columns?.layers).toBe(SAME.layers.length);
    // A and C stand 1 in apart, alongside for 17 in: one group, 25 x 43. B is 10 in from C:
    // a group of its own, 25 x 17. The stack height is over the shorter side of the narrower
    // group (17), not of the bottom layer's bounding box (60 x 43) as for a calculated layout.
    expect(same.freeStandingGroups).toBe(2);
    expect(same.stackHeightRatio).toBeCloseTo((SAME.layers.length * 5) / 17, 12);
    expect(SAME.stability!.warnings[0]).toMatchObject({ check: 'stackHeight', freeStanding: true });
    // The pallet is at 1..51 by 1..43 of the frame: A has 21 x 14 of its 25 x 17 on it, B
    // 19 x 17, C all of it. Measured only with the inputs.
    expect(same.deck).toBeUndefined();
    expect(measureStability(SAME, I).deck).toEqual({ share: 294 / 425, cartons: 2 });
    expect(SAME.stability!.warnings.at(-1)).toEqual({
      check: 'deck',
      level: 'serious',
      value: 294 / 425,
      cartons: 2,
    });
  });
});

describe('extent and bounds', () => {
  it('a manual layer extent is the bounding box of its cartons, from the least edge', () => {
    expect(L.layers[0]!.extent).toEqual({ x: 60, y: 43 });
    expect(L.layers[1]!.extent).toEqual({ x: 60, y: 43 });
  });

  it('the load extent spans every layer where it stands, turned layers included', () => {
    // Bottom x -3..57, turned x -5..55: together -5..57. y -2..41 and 3..46: -2..46.
    expect(layoutMetrics(L, I).loadExtent).toEqual({ x: 62, y: 48, z: L.layers.length * 5 });
    expect(layoutMetrics(SAME, I).loadExtent).toEqual({ x: 60, y: 43, z: 65 });
    finite(layoutMetrics(L, I));
  });
});

describe('unused space with overhanging cartons', () => {
  it('counts only what is inside the envelope: never negative, never NaN', () => {
    for (const layout of [L, SAME]) {
      const u = unusedSpace(layout, I);
      finite(u);
      expect(u.gapVolume).toBeGreaterThanOrEqual(0);
      expect(u.headroomVolume).toBeGreaterThanOrEqual(0);
      for (const g of u.gaps) {
        expect(g.dx).toBeGreaterThan(0);
        expect(g.dy).toBeGreaterThan(0);
        expect(g.dz).toBeGreaterThan(0);
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.x + g.dx).toBeLessThanOrEqual(usable.x + 1e-9);
        expect(g.y + g.dy).toBeLessThanOrEqual(usable.y + 1e-9);
      }
      expect(u.gapVolume + u.headroomVolume).toBeLessThanOrEqual(availableVolume(I) + 1e-6);
    }
  });

  it('measures the free part of the footprint exactly', () => {
    // Inside 52 x 44: A covers 22 x 15 = 330, B 20 x 17 = 340, C 17 x 25 = 425: 1095 of 2288.
    const u = unusedSpace(SAME, I);
    expect(u.gapVolume).toBeCloseTo((2288 - 1095) * 5 * 13, 6);
    expect(u.headroomVolume).toBeCloseTo(2288 * (usableHeight(I) - 65), 6);
  });

  it('a carton wholly outside the footprint leaves the whole layer free', () => {
    const out = overhangingLayout({
      cartons: [{ x: -40, y: -40, rotated: false }],
      upperLayers: 'same',
    });
    const u = unusedSpace(out, I);
    expect(u.gapVolume).toBeCloseTo(2288 * 65, 6);
    finite(u);
  });

  it('a layer standing above the height limit adds no space above the envelope', () => {
    const low = { ...I, pallet: { ...I.pallet, height: 8 } }; // 3 usable, carton 5 tall
    const { layout, flags } = buildManualLayout(manualSpec({}, low), low);
    expect(flags.some((f) => f.kind === 'overHeight')).toBe(true);
    const u = unusedSpace(layout, low);
    finite(u);
    expect(u.headroomVolume).toBe(0);
    expect(u.headroom).toBeNull();
    expect(u.gapVolume).toBeCloseTo((2288 - 1095) * 3, 6);
    expect(u.gapVolume).toBeLessThanOrEqual(availableVolume(low));
  });
});

/** Used, remaining and utilisation are one measurement inside the envelope. */
function reconciles(a: ReturnType<typeof computeAnalytics>, layout: Layout) {
  const t = a.totals;
  expect(t.volumeUsed + t.remainingVolume).toBeCloseTo(t.volumeAvailable, 6);
  expect(t.volumeUsed).toBeGreaterThanOrEqual(0);
  expect(t.utilizationPct).toBeCloseTo((t.volumeUsed / t.volumeAvailable) * 100, 9);
  const { L: l, W: w, H: h } = layout.carton.outer;
  expect(t.volumeUsed + (t.volumeOutsideEnvelope ?? 0)).toBeCloseTo(
    layout.totalCartons * l * w * h,
    6,
  );
}

describe('analytics of a manual layout', () => {
  it('has no negative or NaN figure, and what is left adds up inside the envelope', () => {
    for (const layout of [L, SAME]) {
      const a = computeAnalytics(layout, I);
      finite(a);
      expect(a.totals.remainingVolume).toBeGreaterThanOrEqual(0);
      expect(a.totals.remainingVolume).toBeCloseTo(
        a.totals.headroomVolume + a.totals.layerGapVolume,
        6,
      );
      expect(a.totals.utilizationPct).toBeGreaterThanOrEqual(0);
      expect(a.totals.utilizationPct).toBeLessThanOrEqual(100);
      reconciles(a, layout);
      expect(a.totals.volumeOutsideEnvelope).toBeGreaterThan(0);
      expect(a.pallet.remainingFootprintArea).toBeGreaterThanOrEqual(0);
      expect(a.pallet.remainingHeight).toBeGreaterThanOrEqual(0);
      expect(a.totals.products).toBe(layout.totalProducts);
      expect(a.weight?.total).toBe(40 + layout.totalCartons * 9);
    }
    const a = computeAnalytics(SAME, I);
    // Inside 52 x 44, 1095 of the cartons' 3 x 425 = 1275 sq in, 13 layers of 5.
    expect(a.totals.volumeUsed).toBeCloseTo(1095 * 65, 6);
    expect(a.totals.volumeOutsideEnvelope).toBeCloseTo((1275 - 1095) * 65, 6);
    expect(a.totals.utilizationPct).toBeCloseTo((1095 * 65 * 100) / availableVolume(I), 9);
    expect(a.pallet.volumeUtilizationPct).toBe(a.totals.utilizationPct);
    expect(a.pallet.remainingFootprintArea).toBeCloseTo(2288 - 1095, 9);
    expect(a.pallet.loadLength).toBe(60);
    expect(a.pallet.loadWidth).toBe(43);
    expect(a.summary.cartonsPerLayer).toBe('3');
    expect(a.stability?.turnedLayers).toEqual([]);
    expect(computeAnalytics(L, I).stability?.turnedLayers).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('stays in range when the footprint is crowded with cartons hanging outside', () => {
    // Six cartons round the edge of a 26 x 20 pallet, most of each outside it.
    const small = { ...I, overhang: 0, pallet: { length: 26, width: 20, height: 30 } };
    const cartons = [
      { x: -20, y: -10, rotated: false },
      { x: 5, y: -10, rotated: false },
      { x: 30, y: -10, rotated: false },
      { x: -20, y: 7, rotated: false },
      { x: 5, y: 7, rotated: false },
      { x: 30, y: 7, rotated: false },
    ];
    const { layout } = buildManualLayout(
      manualSpec({ cartons, upperLayers: 'same' }, small),
      small,
    );
    const a = computeAnalytics(layout, small);
    finite(a);
    // Carton volume is far more than the envelope holds: what is used is only the part of it
    // inside, the rest is reported apart, and nothing goes negative.
    const cartonVolume = layout.totalCartons * 25 * 17 * 5;
    expect(cartonVolume).toBeGreaterThan(a.totals.volumeAvailable);
    expect(a.totals.volumeUsed).toBeLessThanOrEqual(a.totals.volumeAvailable);
    reconciles(a, layout);
    expect(a.totals.remainingVolume).toBeGreaterThanOrEqual(0);
    expect(a.pallet.remainingFootprintArea).toBeGreaterThanOrEqual(0);
    expect(a.totals.utilizationPct).toBeLessThanOrEqual(100);
    expect(a.pallet.volumeUtilizationPct).toBeLessThanOrEqual(100);
  });

  it('a layout wholly inside the envelope uses exactly its carton volume, none outside', () => {
    const inside = [
      { x: 0, y: 0, rotated: false },
      { x: 25, y: 0, rotated: false },
      { x: 0, y: 17, rotated: true },
    ];
    for (const upperLayers of ['same', 'alternate'] as const) {
      const { layout, flags } = buildManualLayout(manualSpec({ cartons: inside, upperLayers }), I);
      expect(flags).toEqual([]);
      const a = computeAnalytics(layout, I);
      expect(a.totals.volumeUsed).toBeCloseTo(layout.totalCartons * 25 * 17 * 5, 6);
      expect(a.totals.volumeOutsideEnvelope).toBe(0);
      reconciles(a, layout);
      expect(a.pallet.remainingHeight).toBe(usableHeight(I) - layout.layers.length * 5);
    }
  });

  it('a carton above the height limit: no remaining height, and its top is outside', () => {
    const low = { ...I, pallet: { ...I.pallet, height: 8 } }; // 3 usable, carton 5 tall
    const inside = [{ x: 0, y: 0, rotated: false }];
    const { layout, flags } = buildManualLayout(manualSpec({ cartons: inside }, low), low);
    expect(flags.map((f) => f.kind)).toEqual(['overHeight']);
    const a = computeAnalytics(layout, low);
    finite(a);
    // Not -2: the clamp.
    expect(a.pallet.remainingHeight).toBe(0);
    expect(a.pallet.totalLoadHeight).toBe(10);
    expect(a.totals.volumeUsed).toBeCloseTo(25 * 17 * 3, 6);
    expect(a.totals.volumeOutsideEnvelope).toBeCloseTo(25 * 17 * 2, 6);
    expect(a.totals.remainingVolume).toBeCloseTo((2288 - 425) * 3, 6);
    reconciles(a, layout);
  });

  it('a calculated layout keeps its figures: carton volume, the subtraction, no outside figure', () => {
    const result = optimize(I);
    expect(result.layouts.length).toBeGreaterThan(0);
    for (const { layout } of result.layouts) {
      const a = computeAnalytics(layout, I);
      const { L: l, W: w, H: h } = layout.carton.outer;
      expect(a.totals.volumeUsed).toBe(layout.totalCartons * l * w * h);
      expect(a.totals.remainingVolume).toBe(a.totals.volumeAvailable - a.totals.volumeUsed);
      expect(a.totals.utilizationPct).toBe((a.totals.volumeUsed / a.totals.volumeAvailable) * 100);
      expect('volumeOutsideEnvelope' in a.totals).toBe(false);
      expect(a.pallet.remainingHeight).toBe(a.pallet.usableHeight - (a.pallet.totalLoadHeight - 5));
    }
  });

  it('copes with a layout of no layers', () => {
    const { layout } = buildManualLayout(manualSpec({ cartons: [] }), I);
    const a = computeAnalytics(layout, I);
    finite(a);
    expect(a.totals.remainingVolume).toBeCloseTo(availableVolume(I), 6);
    finite(unusedSpace(layout, I));
    finite(layoutMetrics(layout, I));
  });
});

describe('signatures, patterns and kinds', () => {
  it('layoutSignature reads a manual layout, and marks its turned layers', () => {
    const sig = layoutSignature(L);
    expect(sig).toContain('H:3:1x1r,1x1u,1x1u');
    expect(sig).toContain(':t');
    expect(layoutSignature(SAME)).not.toContain(':t');
  });

  it('the build sheet patterns give a turned manual layer its own letter', () => {
    const patterns = stackPatterns(L);
    expect(patterns.map((p) => [p.letter, p.kind, p.cartonsPerLayer])).toEqual([
      ['A', 'manual', 3],
      ['B', 'manual', 3],
    ]);
    expect(patterns[0]!.layerNumbers).toEqual([1, 3, 5, 7, 9, 11, 13]);
    expect(stackPatterns(SAME)).toHaveLength(1);
    // A layer and its turned twin read as one run, as for calculated layouts.
    expect(stackRuns(L)).toHaveLength(1);
    expect(turnedLayerNumbers(L)).toEqual([2, 4, 6, 8, 10, 12]);
    expect(layerKind(L.layers[0]!)).toBe('manual');
  });

  it('a manual layout is not a pinwheel layout', () => {
    expect(isPinwheelLayout(L)).toBe(false);
  });

  it('the fixture really overhangs and is not centred', () => {
    const { flags } = buildManualLayout(manualSpec(), I);
    expect(flags).toEqual([{ kind: 'overhang', cartons: 2, by: 5 }]);
    expect(OVERHANGING_CARTONS[0]!.x).toBeLessThan(0);
    expect(TEST_DESIGN.counts.length).toBe(2);
  });
});
