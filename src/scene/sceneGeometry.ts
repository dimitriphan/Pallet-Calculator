import { PALLET_HEIGHT } from '../domain/constants';
import type { Inputs, Layout } from '../domain/types';
import { productsInCarton, type PlacedCarton } from '../engine/packing/positions';
import { formatNumber } from '../engine/units/units';
import type { Selection } from '../store/sceneStore';
import { palletBounds, toSceneBounds, type SceneBounds, type Vec3 } from './transforms';

/** One solid part of the pallet in the scene frame. */
export interface PalletPart {
  position: Vec3; // centre
  size: Vec3;
}

const STRINGER = 3.5; // width and height
const DECK = PALLET_HEIGHT - STRINGER; // 1.5
const DECK_BOARDS = 7;
const DECK_BOARD_WIDTH = 5.5;

/**
 * A stringer pallet of exactly length x width x 5: three stringers along the length under
 * seven deck boards across the width, the outer boards flush with the ends.
 */
export function palletParts(length: number, width: number): PalletPart[] {
  const parts: PalletPart[] = [];
  const zs = [-width / 2 + STRINGER / 2, 0, width / 2 - STRINGER / 2];
  for (const z of zs) {
    parts.push({ position: [0, STRINGER / 2, z], size: [length, STRINGER, STRINGER] });
  }
  const board = Math.min(DECK_BOARD_WIDTH, length / DECK_BOARDS);
  const step = (length - board) / (DECK_BOARDS - 1);
  for (let k = 0; k < DECK_BOARDS; k++) {
    const x = -length / 2 + board / 2 + k * step;
    parts.push({ position: [x, STRINGER + DECK / 2, 0], size: [board, DECK, width] });
  }
  return parts;
}

/** How far the dimension lines stand off the load, and their tick half-length (inches). */
const DIM_OFFSET = 6;
const DIM_TICK = 2;

export interface DimensionLineOptions {
  offset?: number;
  tick?: number;
  clearOf?: SceneBounds;
}

export interface DimensionLines {
  /** Pairs of points, each pair one line segment. */
  segments: Vec3[];
  labels: { text: string; position: Vec3 }[];
}

/**
 * Dimension lines with end ticks for the overall length (along X, in front), width (along Z,
 * at the right) and height (up the front-right corner) of the bounds. With `clearOf` (bounds
 * that contain `b`, such as the load with its pallet) the lines stand off those bounds instead,
 * so they never run through the pallet, while still measuring `b`.
 */
export function dimensionLines(
  b: SceneBounds,
  { offset = DIM_OFFSET, tick = DIM_TICK, clearOf = b }: DimensionLineOptions = {},
): DimensionLines {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const front = Math.max(z1, clearOf.max[2]) + offset;
  const right = Math.max(x1, clearOf.max[0]) + offset;
  // prettier-ignore
  const segments: Vec3[] = [
    // Length along X, ticks along Z.
    [x0, y0, front], [x1, y0, front],
    [x0, y0, front - tick], [x0, y0, front + tick],
    [x1, y0, front - tick], [x1, y0, front + tick],
    // Width along Z, ticks along X.
    [right, y0, z0], [right, y0, z1],
    [right - tick, y0, z0], [right + tick, y0, z0],
    [right - tick, y0, z1], [right + tick, y0, z1],
    // Height along Y at the front-right corner, ticks along X.
    [right, y0, front], [right, y1, front],
    [right - tick, y0, front], [right + tick, y0, front],
    [right - tick, y1, front], [right + tick, y1, front],
  ];
  const label = (v: number) => `${formatNumber(v)} in`;
  return {
    segments,
    labels: [
      { text: label(x1 - x0), position: [(x0 + x1) / 2, y0, front + tick * 2] },
      { text: label(z1 - z0), position: [right + tick * 2, y0, (z0 + z1) / 2] },
      { text: label(y1 - y0), position: [right + tick * 2, (y0 + y1) / 2, front] },
    ],
  };
}

/**
 * The bounds grown to hold the dimension lines, ticks and label anchors drawn for them
 * (or for any bounds inside them drawn with `clearOf` set to them).
 */
export function withMeasurements(b: SceneBounds): SceneBounds {
  const reach = DIM_OFFSET + DIM_TICK * 2;
  return { min: [...b.min], max: [b.max[0] + reach, b.max[1], b.max[2] + reach] };
}

/** Scene bounds of the selected object, or null when nothing (or nothing that exists) is selected. */
export function selectionBounds(
  s: Selection,
  layout: Layout | null,
  inputs: Inputs | null,
  cartons: PlacedCarton[],
): SceneBounds | null {
  if (!s || !inputs) return null;
  if (s.kind === 'pallet') return palletBounds(inputs);
  const carton = cartons[s.cartonIndex];
  if (!carton || !layout) return null;
  if (s.kind === 'carton') return toSceneBounds(carton, inputs);
  const product = productsInCarton(layout, inputs, carton)[s.productIndex];
  return product ? toSceneBounds(product, inputs) : null;
}
