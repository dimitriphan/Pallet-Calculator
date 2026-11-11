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

/** How to build a pinwheel layer, said on the build sheet, whose layer drawings are top views. */
export const PINWHEEL_NOTE =
  'Pinwheel layer: build the four blocks around the centre gap as shown in the top view.';

/** The same on screen, where there is no top view: the 3D view shows the layer from above. */
export const PINWHEEL_SCREEN_NOTE =
  'Pinwheel layer: build the four blocks around the centre gap, as shown from above in the 3D view.';

/** A layer's arrangement; layers stored before pinwheels existed have no kind and are grids. */
export function layerKind(layer: Layer): LayerPatternKind {
  return layer.kind ?? 'grid';
}

/** Whether any layer of the layout is a pinwheel. */
export function hasPinwheelLayer(l: Layout): boolean {
  return l.layers.some((layer) => layerKind(layer) === 'pinwheel');
}

/** Numbers (from 1) of the layers turned half a turn to interlock, bottom first. */
export function turnedLayerNumbers(l: Layout): number[] {
  return l.layers.flatMap((layer, i) => (layer.turned ? [i + 1] : []));
}

/**
 * The instruction on screen, where layers are not drawn one by one: "Turn layers 2, 4, 6 half
 * a turn (180°) so they interlock.", or null when no layer is turned.
 */
export function turnedLayersText(l: Layout): string | null {
  const numbers = turnedLayerNumbers(l);
  if (numbers.length === 0) return null;
  return numbers.length === 1
    ? `Turn layer ${numbers[0]} half a turn (180°) so it interlocks.`
    : `Turn layers ${numbers.join(', ')} half a turn (180°) so they interlock.`;
}

/**
 * The build sheet's wording, where each turned layer is already drawn turned as its own
 * pattern: one sentence per pair of the pattern below and the pattern drawn, e.g. "Layers 3,
 * 5, 7 are pattern B turned half a turn (shown as pattern C)." Null when no layer is turned.
 */
export function turnedPatternsText(l: Layout): string | null {
  const patterns = stackPatterns(l);
  const letterOf = new Map<number, string>(); // by 1-based layer number
  for (const p of patterns) for (const n of p.layerNumbers) letterOf.set(n, p.letter);
  const groups = new Map<string, { below: string | undefined; shown: string; layers: number[] }>();
  for (const n of turnedLayerNumbers(l)) {
    const below = letterOf.get(n - 1);
    const shown = letterOf.get(n) as string;
    const key = `${below ?? ''}|${shown}`;
    const group = groups.get(key);
    if (group) group.layers.push(n);
    else groups.set(key, { below, shown, layers: [n] });
  }
  if (groups.size === 0) return null;
  return [...groups.values()]
    .map(({ below, shown, layers }) => {
      const subject =
        layers.length === 1 ? `Layer ${layers[0]} is` : `Layers ${layers.join(', ')} are`;
      const what = below ? `pattern ${below} turned half a turn` : 'turned half a turn';
      return `${subject} ${what} (shown as pattern ${shown}).`;
    })
    .join(' ');
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

function blocksKey(blocks: Block[]): string {
  return blocks
    .map((b) => `${b.cols}x${b.rows}${b.rotated ? 'r' : 'u'}`)
    .sort()
    .join(',');
}

/**
 * Whether `upper` is `lower` turned half a turn (or the other way): one is turned, the other
 * not, and they hold the same blocks on the same axis. Interlocking turns only identical
 * layers, so such neighbours are the same layer built two ways round.
 */
function turnedPair(lower: Layer, upper: Layer): boolean {
  return (
    !!lower.turned !== !!upper.turned &&
    lower.vertical === upper.vertical &&
    lower.height === upper.height &&
    lower.cartonCount === upper.cartonCount &&
    layerKind(lower) === layerKind(upper) &&
    blocksKey(lower.blocks) === blocksKey(upper.blocks)
  );
}

/**
 * Consecutive layers sharing a pattern, bottom to top; layer numbers start at 1. A layer turned
 * half a turn stays in the run of the layer it is a turn of (turnedLayersText says which).
 */
export function stackRuns(l: Layout): StackRun[] {
  const { indexOf } = classify(l);
  const runs: StackRun[] = [];
  l.layers.forEach((layer, i) => {
    const letter = patternLetter(indexOf[i] ?? 0);
    const last = runs[runs.length - 1];
    const below = l.layers[i - 1];
    if (last && (last.pattern === letter || (below && turnedPair(below, layer)))) {
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
