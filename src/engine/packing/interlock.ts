/**
 * Interlocking at no cost (spec 7.2): in each run of identical consecutive layers, every
 * second layer is turned half a turn (180°) about the centre of the usable footprint, so the
 * seams of one layer do not line up with those of the next. A run is turned only when turning
 * really moves cartons (the layer is not symmetric under the turn) and every support share it
 * affects stays at or above the caution threshold. The box count never changes.
 *
 * Turned layers keep their blocks already turned, so placements, the 3D view, the pictures and
 * the build sheet need nothing else; the layer carries `turned: true` and the id changes.
 */
import { STABILITY } from '../../domain/stabilityThresholds';
import type { Block, Inputs, Layer, LayerPatternKind, Layout } from '../../domain/types';
import { sameCartonRects, supportShare } from '../analytics/stability';
import { usableFootprint } from './geometry';
import { footprintAxes, layoutSignature } from './stacking';

/** Shares this close below the threshold still count as at it. */
const TOLERANCE = 1e-9;

/**
 * The blocks turned half a turn about the centre of the x by y rectangle: each block's corner
 * moves to (x − bx − width, y − by − depth). A turn reverses the order of the blocks; a pinwheel
 * keeps its order bottom-left, bottom-right, top-right, top-left (each block lands in the
 * opposite corner).
 */
export function turnBlocks(
  blocks: readonly Block[],
  a: number,
  b: number,
  x: number,
  y: number,
  kind: LayerPatternKind,
): Block[] {
  const turned = blocks.map((blk) => {
    const w = blk.cols * (blk.rotated ? b : a);
    const h = blk.rows * (blk.rotated ? a : b);
    return { ...blk, x: x - blk.x - w, y: y - blk.y - h };
  });
  if (kind === 'pinwheel' && turned.length === 4) {
    const [bl, br, tr, tl] = turned as [Block, Block, Block, Block];
    return [tr, tl, bl, br];
  }
  return turned.reverse();
}

function sameBlocks(p: readonly Block[], q: readonly Block[]): boolean {
  return (
    p === q ||
    (p.length === q.length &&
      p.every((blk, k) => {
        const o = q[k] as Block;
        return (
          blk.x === o.x &&
          blk.y === o.y &&
          blk.cols === o.cols &&
          blk.rows === o.rows &&
          blk.rotated === o.rotated
        );
      }))
  );
}

/** Whether two layers are the same unturned layer: same axis, height, kind and blocks. */
function identical(p: Layer, q: Layer): boolean {
  return (
    !p.turned &&
    !q.turned &&
    p.vertical === q.vertical &&
    p.height === q.height &&
    (p.kind ?? 'grid') === (q.kind ?? 'grid') &&
    sameBlocks(p.blocks, q.blocks)
  );
}

/**
 * The turned blocks of a layer, or null when the turn leaves every carton where it was.
 * Cached per block list: the layers of one pattern share one block list.
 */
interface Turn {
  a: number;
  b: number;
  x: number;
  y: number;
  blocks: Block[] | null;
}
const turnCache = new WeakMap<readonly Block[], Turn>();
function turnedBlocks(layer: Layer, l: Layout, x: number, y: number): Block[] | null {
  const [fa, fb] = footprintAxes(layer.vertical);
  const a = l.carton.outer[fa];
  const b = l.carton.outer[fb];
  const hit = turnCache.get(layer.blocks);
  if (hit && hit.a === a && hit.b === b && hit.x === x && hit.y === y) return hit.blocks;
  const blocks = turnBlocks(layer.blocks, a, b, x, y, layer.kind ?? 'grid');
  const moved = sameCartonRects(layer, { ...layer, blocks }, l.carton) ? null : blocks;
  turnCache.set(layer.blocks, { a, b, x, y, blocks: moved });
  return moved;
}

const supported = (upper: Layer, lower: Layer, l: Layout) =>
  supportShare(upper, lower, l) >= STABILITY.supportShare.caution - TOLERANCE;

/** The layout with alternate identical layers turned where that is free; else `l` itself. */
export function interlockLayers(l: Layout, i: Inputs): Layout {
  const { x, y } = usableFootprint(i);
  const layers = l.layers;
  let next: Layer[] | null = null;
  let start = 0;
  while (start < layers.length) {
    let end = start + 1;
    while (end < layers.length && identical(layers[start] as Layer, layers[end] as Layer)) end++;
    // Layers start .. end-1 are one run; turn start+1, start+3, … when it pays and is safe.
    if (end - start >= 2) {
      const first = layers[start] as Layer;
      const blocks = turnedBlocks(first, l, x, y);
      if (blocks) {
        const candidate: Layer[] = [...(next ?? layers)];
        for (let k = start + 1; k < end; k += 2) {
          candidate[k] = { ...(layers[k] as Layer), blocks, turned: true };
        }
        const safe = candidate.every((layer, k) => {
          const below = candidate[k - 1];
          if (k < start + 1 || k > end || !below) return true;
          return (!layer.turned && !below.turned) || supported(layer, below, l);
        });
        if (safe) next = candidate;
      }
    }
    start = end;
  }
  if (next === null) return l;
  const out: Layout = { ...l, layers: next };
  out.id = layoutSignature(out);
  return out;
}
