import type { Block, Layer, LayerPatternKind, Layout, ProductAxis } from '../../domain/types';

export interface StackRun {
  from: number;
  to: number;
  cartonsPerLayer: number;
  vertical: ProductAxis;
  height: number;
  pattern: string;
}

export interface StackPattern {
  letter: string;
  layerNumbers: number[];
  layerIndex: number;
  cartonsPerLayer: number;
  vertical: ProductAxis;
  height: number;
  kind: LayerPatternKind;
}

/** How to build a pinwheel layer, said on the card and the build sheet. */
export const PINWHEEL_NOTE =
  'Pinwheel layer: build the four blocks around the centre gap as shown in the top view.';

/** A layer's arrangement; layers stored before pinwheels existed have no kind and are grids. */
export function layerKind(layer: Layer): LayerPatternKind {
  return layer.kind ?? 'grid';
}

/** Whether any layer of the layout is a pinwheel. */
export function hasPinwheelLayer(l: Layout): boolean {
  return l.layers.some((layer) => layerKind(layer) === 'pinwheel');
}

const AXIS_WORD: Record<ProductAxis, string> = { L: 'length', W: 'width', H: 'height' };

/** 'A'..'Z', then 'AA', 'AB', … */
function patternLetter(n: number): string {
  let s = '';
  let k = n;
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}

function sameBlock(a: Block, b: Block): boolean {
  return (
    a.x === b.x && a.y === b.y && a.cols === b.cols && a.rows === b.rows && a.rotated === b.rotated
  );
}

function sameBlocks(a: Block[], b: Block[]): boolean {
  return a.length === b.length && a.every((x, i) => sameBlock(x, b[i] as Block));
}

function samePattern(a: Layer, b: Layer): boolean {
  return (
    a.vertical === b.vertical && layerKind(a) === layerKind(b) && sameBlocks(a.blocks, b.blocks)
  );
}

/** Pattern index (in order of first use) for every layer, bottom to top. */
function classify(l: Layout): { firsts: number[]; indexOf: number[] } {
  const firsts: number[] = []; // layer index of each pattern's first layer
  const indexOf = l.layers.map((layer, i) => {
    const found = firsts.findIndex((f) => samePattern(l.layers[f] as Layer, layer));
    if (found >= 0) return found;
    firsts.push(i);
    return firsts.length - 1;
  });
  return { firsts, indexOf };
}

/** Distinct layer patterns in order of first use. */
export function stackPatterns(l: Layout): StackPattern[] {
  const { firsts, indexOf } = classify(l);
  return firsts.map((layerIndex, p) => {
    const layer = l.layers[layerIndex] as Layer;
    return {
      letter: patternLetter(p),
      layerNumbers: indexOf.flatMap((pi, i) => (pi === p ? [i + 1] : [])),
      layerIndex,
      cartonsPerLayer: layer.cartonCount,
      vertical: layer.vertical,
      height: layer.height,
      kind: layerKind(layer),
    };
  });
}

/** Consecutive layers sharing a pattern, bottom to top; layer numbers start at 1. */
export function stackRuns(l: Layout): StackRun[] {
  const { indexOf } = classify(l);
  const runs: StackRun[] = [];
  l.layers.forEach((layer, i) => {
    const letter = patternLetter(indexOf[i] ?? 0);
    const last = runs[runs.length - 1];
    if (last && last.pattern === letter) {
      last.to = i + 1;
      return;
    }
    runs.push({
      from: i + 1,
      to: i + 1,
      cartonsPerLayer: layer.cartonCount,
      vertical: layer.vertical,
      height: layer.height,
      pattern: letter,
    });
  });
  return runs;
}

/** "Layer 1: 10 cartons, product length side up" / "Layers 2–7: 7 cartons each, product width side up". */
export function describeRun(r: StackRun): string {
  const cartons = `${r.cartonsPerLayer} ${r.cartonsPerLayer === 1 ? 'carton' : 'cartons'}`;
  const up = `product ${AXIS_WORD[r.vertical]} side up`;
  if (r.from === r.to) return `Layer ${r.from}: ${cartons}, ${up}`;
  return `Layers ${r.from}–${r.to}: ${cartons} each, ${up}`;
}

/** [1] -> "layer 1"; [1, 3, 4] -> "layers 1, 3–4". */
export function describeLayerList(layerNumbers: number[]): string {
  const sorted = [...layerNumbers].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] as number) === (sorted[j] as number) + 1) j += 1;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return `${sorted.length === 1 ? 'layer' : 'layers'} ${parts.join(', ')}`;
}
