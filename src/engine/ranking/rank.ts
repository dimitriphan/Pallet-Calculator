import type { Inputs, Layout, RankedLayout, ScoreBreakdown } from '../../domain/types';
import { footprintAxes } from '../packing/stacking';
import { explainRanking } from './explain';
import { compareRanked, scoreLayout } from './score';

/** Layouts kept per physical carton before the overflow is used. */
const PER_CARTON = 2;

function size6(v: number): string {
  return v.toFixed(6);
}

/** The carton as seen from outside: outer sizes, largest first, and boxes per carton. */
function outsideCartonKey(l: Layout): string {
  const { L, W, H } = l.carton.outer;
  const sorted = [L, W, H].sort((p, q) => q - p).map(size6);
  return `${sorted.join('x')}/${l.carton.boxesPerCarton}`;
}

/**
 * How the layout looks from outside, ignoring how products sit inside the cartons and
 * where blocks sit within a layer. Each block is the physical rectangle it covers
 * (width along x, depth along y) with its columns and rows, so a square footprint gives
 * the same block whether or not it is flagged as rotated.
 */
export function externalSignature(l: Layout): string {
  const layers = l.layers.map((layer) => {
    const [fa, fb] = footprintAxes(layer.vertical);
    const a = l.carton.outer[fa];
    const b = l.carton.outer[fb];
    const blocks = layer.blocks
      .map((blk) => {
        const dx = blk.rotated ? b : a;
        const dy = blk.rotated ? a : b;
        return `${size6(blk.cols * dx)}x${size6(blk.rows * dy)}:${blk.cols}x${blk.rows}`;
      })
      .sort()
      .join(',');
    return `${size6(layer.height)}:${layer.cartonCount}:${blocks}`;
  });
  return `${outsideCartonKey(l)}|${layers.join('/')}`;
}

interface Scored {
  layout: Layout;
  score: ScoreBreakdown;
}

/**
 * Spec 6.3: scores and orders the layouts, drops layouts that look the same from outside,
 * keeps at most two per physical carton (topping up from the extras if fewer than `limit`
 * remain), then ranks and explains the selection.
 */
export function rankLayouts(layouts: Layout[], i: Inputs, limit = 5): RankedLayout[] {
  const maxProducts = layouts.reduce((m, l) => Math.max(m, l.totalProducts), 0);
  const ordered: Scored[] = layouts
    .map((layout) => ({ layout, score: scoreLayout(layout, i, maxProducts) }))
    .sort(compareRanked);

  const taken = new Set<string>();
  const perCarton = new Map<string, number>();
  const selected: Scored[] = [];
  const overflow: Scored[] = [];
  for (const s of ordered) {
    if (selected.length >= limit) break;
    const sig = externalSignature(s.layout);
    if (taken.has(sig)) continue;
    const key = outsideCartonKey(s.layout);
    const n = perCarton.get(key) ?? 0;
    if (n >= PER_CARTON) {
      overflow.push(s);
      continue;
    }
    perCarton.set(key, n + 1);
    taken.add(sig);
    selected.push(s);
  }
  for (const s of overflow) {
    if (selected.length >= limit) break;
    const sig = externalSignature(s.layout);
    if (taken.has(sig)) continue;
    taken.add(sig);
    selected.push(s);
  }
  // Overflow entries may outrank later picks; keep the list in ranking order.
  selected.sort(compareRanked);

  const ranked: RankedLayout[] = selected.map((s, k) => ({ ...s, rank: k + 1, explanation: '' }));
  ranked.forEach((r, k) => {
    r.explanation = explainRanking(r, ranked[k + 1] ?? null, ranked.length);
  });
  return ranked;
}
