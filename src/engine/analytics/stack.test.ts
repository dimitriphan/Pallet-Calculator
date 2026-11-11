import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../domain/constants';
import type { Layer, Layout } from '../../domain/types';
import { optimize } from '../optimize';
import { PINWHEEL_INPUTS } from '../packing/testSupport';
import {
  describeLayerList,
  describeRun,
  hasPinwheelLayer,
  layerKind,
  stackPatterns,
  stackRuns,
  turnedLayerNumbers,
  turnedLayersText,
  type StackRun,
} from './stack';

const layerAt = (l: Layout, i: number): Layer => l.layers[i] as Layer;
const winner = (): Layout => optimize(DEFAULT_INPUTS).layouts[0]!.layout;

/** Re-stack the given layers (by index into the winner's layers), recomputing z. */
function restack(base: Layout, order: number[]): Layout {
  let z = 0;
  const layers = order.map((idx) => {
    const layer = { ...layerAt(base, idx), z };
    z += layer.height;
    return layer;
  });
  return { ...base, layers, totalCartons: layers.reduce((s, l) => s + l.cartonCount, 0) };
}

describe('stackRuns', () => {
  it('describes the default winner as two runs', () => {
    expect(stackRuns(winner()).map(describeRun)).toEqual([
      'Layer 1: 10 cartons, product length side up',
      'Layers 2–7: 7 cartons each, product width side up',
    ]);
  });

  it('gives one run for a single-pattern layout', () => {
    const base = winner();
    const l = restack(base, [1, 1, 1]);
    const runs = stackRuns(l);
    expect(runs).toHaveLength(1);
    expect(describeRun(runs[0] as StackRun)).toBe(
      'Layers 1–3: 7 cartons each, product width side up',
    );
  });

  it('gives three runs for an A, B, A stack', () => {
    const l = restack(winner(), [0, 1, 0]);
    const runs = stackRuns(l);
    expect(runs.map((r) => [r.from, r.to, r.pattern])).toEqual([
      [1, 1, 'A'],
      [2, 2, 'B'],
      [3, 3, 'A'],
    ]);
  });

  it('describes a single carton in singular', () => {
    expect(
      describeRun({ from: 1, to: 1, cartonsPerLayer: 1, vertical: 'H', height: 4, pattern: 'A' }),
    ).toBe('Layer 1: 1 carton, product height side up');
  });
});

describe('stackPatterns', () => {
  it('gives letters A, B and C for the default winner, whose layers 3, 5 and 7 are turned', () => {
    // Before interlocking (Round 4, Task 5) layers 2-7 were all pattern B. Turned half a turn,
    // layers 3, 5 and 7 put their cartons elsewhere, so they are drawn as their own pattern.
    const p = stackPatterns(winner());
    expect(p.map((x) => x.letter)).toEqual(['A', 'B', 'C']);
    expect(p[0]?.layerNumbers).toEqual([1]);
    expect(p[1]?.layerNumbers).toEqual([2, 4, 6]);
    expect(p[2]?.layerNumbers).toEqual([3, 5, 7]);
    expect(p.map((x) => x.layerIndex)).toEqual([0, 1, 2]);
    expect(p[0]).toMatchObject({ cartonsPerLayer: 10, vertical: 'L' });
    expect(p[1]).toMatchObject({ cartonsPerLayer: 7, vertical: 'W' });
    expect(p[2]).toMatchObject({ cartonsPerLayer: 7, vertical: 'W' });
  });

  it('gives letters A and B for the default winner unturned', () => {
    const base = winner();
    const p = stackPatterns(restack(base, [0, 1, 1, 1, 1, 1, 1]));
    expect(p.map((x) => x.letter)).toEqual(['A', 'B']);
    expect(p[1]?.layerNumbers).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('reuses a pattern letter in A, B, A', () => {
    const p = stackPatterns(restack(winner(), [0, 1, 0]));
    expect(p).toHaveLength(2);
    expect(p[0]?.layerNumbers).toEqual([1, 3]);
    expect(p[1]?.layerNumbers).toEqual([2]);
    expect(p[1]?.layerIndex).toBe(1);
  });

  it('treats same vertical with different blocks as different patterns', () => {
    const base = winner();
    const a = layerAt(base, 1);
    const b = {
      ...a,
      blocks: a.blocks.map((blk, i) => (i === 0 ? { ...blk, rotated: !blk.rotated } : blk)),
    };
    const l: Layout = { ...base, layers: [a, { ...b, z: a.z + a.height }] };
    expect(stackPatterns(l).map((x) => x.letter)).toEqual(['A', 'B']);
  });

  it('continues letters after Z', () => {
    const base = winner();
    const src = layerAt(base, 1);
    const layers = Array.from({ length: 28 }, (_, i) => ({
      ...src,
      z: i * src.height,
      blocks: [{ x: i, y: 0, cols: 1, rows: 1, rotated: false }],
    }));
    const letters = stackPatterns({ ...base, layers }).map((p) => p.letter);
    expect(letters[0]).toBe('A');
    expect(letters[25]).toBe('Z');
    expect(letters[26]).toBe('AA');
    expect(letters[27]).toBe('AB');
  });
});

describe('turned layers', () => {
  it('names the turned layers of the default winner', () => {
    expect(turnedLayerNumbers(winner())).toEqual([3, 5, 7]);
    expect(turnedLayersText(winner())).toBe('Turn these layers half a turn (180°): 3, 5, 7');
  });

  it('says nothing when no layer is turned', () => {
    const plain = restack(winner(), [0, 1, 1, 1]);
    expect(turnedLayerNumbers(plain)).toEqual([]);
    expect(turnedLayersText(plain)).toBeNull();
  });

  it('keeps a turned layer in the run of the layer it is a turn of', () => {
    expect(stackRuns(winner()).map((r) => [r.from, r.to])).toEqual([
      [1, 1],
      [2, 7],
    ]);
  });

  it('does not join a turned layer to a different layer', () => {
    const base = winner();
    // Layer 1 (10 cartons) under a turned layer of 7: two runs.
    expect(stackRuns(restack(base, [0, 2])).map((r) => [r.from, r.to])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('describeLayerList', () => {
  it.each([
    [[1], 'layer 1'],
    [[2, 3, 4, 5, 6, 7], 'layers 2–7'],
    [[1, 3, 4], 'layers 1, 3–4'],
    [[1, 3], 'layers 1, 3'],
    [[3, 4], 'layers 3–4'],
  ])('%j -> %s', (nums, text) => {
    expect(describeLayerList(nums)).toBe(text);
  });
});

describe('pinwheel layers', () => {
  const pinwheel = (): Layout => optimize(PINWHEEL_INPUTS).layouts[0]!.layout;

  it('says whether a layout has a pinwheel layer', () => {
    expect(hasPinwheelLayer(pinwheel())).toBe(true);
    expect(hasPinwheelLayer(winner())).toBe(false);
  });

  it('treats a layer stored without a kind as a grid', () => {
    const layer = layerAt(winner(), 0);
    expect('kind' in layer).toBe(false);
    expect(layerKind(layer)).toBe('grid');
    expect(layerKind({ ...layer, kind: 'pinwheel' })).toBe('pinwheel');
  });

  it('gives each stack pattern its kind', () => {
    expect(stackPatterns(pinwheel()).map((p) => [p.letter, p.kind, p.layerNumbers])).toEqual([
      ['A', 'pinwheel', [1, 2, 3]],
    ]);
    expect(stackPatterns(winner()).map((p) => p.kind)).toEqual(['grid', 'grid', 'grid']);
  });
});
