/**
 * What the manual layout editor draws, as plain data: the one carton of the Carton step and
 * the one layer of the Pallet layer step, as ordinary layouts, so the same carton and product
 * drawing code shows them. No React, no three.js.
 */
import { EPS, PALLET_HEIGHT } from '../domain/constants';
import type { CartonCandidate, Inputs, Layout } from '../domain/types';
import { verticalAxis, type CartonDesign } from '../engine/manual/carton';
import {
  cartonBase,
  cartonRect,
  manualPattern,
  type CartonBase,
  type ManualCarton,
  type Point,
} from '../engine/manual/layer';
import { usableFootprint, type Rect } from '../engine/packing/geometry';
import { cartonPlacements, type PlacedBox } from '../engine/packing/positions';
import { palletBounds, toSceneBounds, type SceneBounds, type Vec3 } from './transforms';

/**
 * One designed carton standing as it would on the pallet (the chosen side down), alone, on
 * the floor at the middle of the scene, its longer side across the view.
 */
export function cartonPreviewLayout(
  design: CartonDesign,
  carton: CartonCandidate,
  inputs: Inputs,
): Layout {
  const vertical = verticalAxis(design);
  const { a, b } = cartonBase(carton, vertical);
  const usable = usableFootprint(inputs);
  const rotated = b > a;
  const [dx, dy] = rotated ? [b, a] : [a, b];
  const pattern = manualPattern(
    [{ x: (usable.x - dx) / 2, y: (usable.y - dy) / 2, rotated }],
    carton,
    vertical,
  );
  return {
    id: 'editor:carton',
    carton,
    // Scene height 0 is the floor, which is the pallet's height below the engine's zero.
    layers: [{ ...pattern, z: -PALLET_HEIGHT }],
    totalCartons: 1,
    totalProducts: carton.boxesPerCarton,
  };
}

/** The bottom layer of a built manual layout on its own: what the Pallet layer step shows. */
export function layerPreviewLayout(layout: Layout): Layout {
  const layers = layout.layers.slice(0, 1);
  const cartons = layers[0]?.cartonCount ?? 0;
  return {
    id: 'editor:layer',
    carton: layout.carton,
    layers,
    totalCartons: cartons,
    totalProducts: cartons * layout.carton.boxesPerCarton,
  };
}

/** The scene bounds of every carton of a layout; null when it has none. */
export function cartonsBounds(layout: Layout, inputs: Inputs): SceneBounds | null {
  let bounds: SceneBounds | null = null;
  for (const c of cartonPlacements(layout, inputs)) {
    const b = toSceneBounds(c, inputs);
    if (!bounds) bounds = { min: [...b.min], max: [...b.max] };
    else
      for (let k = 0; k < 3; k++) {
        bounds.min[k] = Math.min(bounds.min[k]!, b.min[k]!);
        bounds.max[k] = Math.max(bounds.max[k]!, b.max[k]!);
      }
  }
  return bounds;
}

/** How far above the pallet top the footprint outline is drawn, so it is not lost in the deck. */
const OUTLINE_LIFT = 0.05;

/**
 * The outline of the usable footprint (pallet plus allowed overhang) on the pallet top, as
 * four line segments (eight points).
 */
export function footprintOutline(inputs: Inputs): Vec3[] {
  const { x, y } = usableFootprint(inputs);
  const h = PALLET_HEIGHT + OUTLINE_LIFT;
  const corners: Vec3[] = [
    [-x / 2, h, -y / 2],
    [x / 2, h, -y / 2],
    [x / 2, h, y / 2],
    [-x / 2, h, y / 2],
  ];
  return corners.flatMap((corner, k) => [corner, corners[(k + 1) % 4] as Vec3]);
}

/** What the Pallet layer step frames: the pallet, the usable footprint and the layer on it. */
export function layerStepBounds(layout: Layout, inputs: Inputs): SceneBounds {
  const { min, max } = palletBounds(inputs);
  const { x, y } = usableFootprint(inputs);
  const grow = (b: SceneBounds) => {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, b.min[k]!);
      max[k] = Math.max(max[k]!, b.max[k]!);
    }
  };
  grow({ min: [-x / 2, 0, -y / 2], max: [x / 2, PALLET_HEIGHT, y / 2] });
  const cartons = cartonsBounds(layout, inputs);
  if (cartons) grow(cartons);
  return { min, max };
}

/** How far a carton being dragged is lifted, so it is drawn over a carton it overlaps. */
export const DRAG_LIFT = 0.3;

/** The cartons of the working layer as boxes standing on the pallet top, in the order given. */
export function layerBoxes(
  cartons: readonly ManualCarton[],
  base: CartonBase,
  height: number,
): PlacedBox[] {
  return cartons.map((c) => {
    const r = cartonRect(c, base);
    return { x: r.x, y: r.y, z: 0, dx: r.w, dy: r.h, dz: height };
  });
}

/** For each carton, whether it lies outside the usable footprint (as the overhang flag counts). */
export function overhanging(
  cartons: readonly ManualCarton[],
  base: CartonBase,
  usable: Point,
): boolean[] {
  return cartons.map((c) => {
    const r = cartonRect(c, base);
    return Math.max(-r.x, -r.y, r.x + r.w - usable.x, r.y + r.h - usable.y) > EPS;
  });
}

/** How far a carton's seam line stops short of its ends, as a share of its length. */
const SEAM_INSET = 0.12;
/** How far above the carton top the seam is drawn. */
const SEAM_LIFT = 0.03;

/**
 * One line on top of every carton, along the longer side of its base, like the taped seam of
 * a real carton: it shows at a glance which way each carton lies, so a turned one stands out.
 * Line-segment vertices (x, y, z triples) in the scene frame.
 */
export function seamPositions(
  boxes: readonly PlacedBox[],
  cartons: readonly ManualCarton[],
  base: CartonBase,
  usable: Point,
): Float32Array {
  const out = new Float32Array(boxes.length * 6);
  const longAlongA = base.a >= base.b;
  boxes.forEach((b, k) => {
    const alongX = longAlongA !== (cartons[k]?.rotated ?? false);
    const top = b.z + b.dz + PALLET_HEIGHT + SEAM_LIFT;
    const x0 = b.x - usable.x / 2;
    const z0 = b.y - usable.y / 2;
    const from: Vec3 = alongX
      ? [x0 + b.dx * SEAM_INSET, top, z0 + b.dy / 2]
      : [x0 + b.dx / 2, top, z0 + b.dy * SEAM_INSET];
    const to: Vec3 = alongX
      ? [x0 + b.dx * (1 - SEAM_INSET), top, z0 + b.dy / 2]
      : [x0 + b.dx / 2, top, z0 + b.dy * (1 - SEAM_INSET)];
    out.set([...from, ...to], k * 6);
  });
  return out;
}

/** The point of the usable footprint's frame under a point of the scene. */
export function sceneToFootprint(sceneX: number, sceneZ: number, usable: Point): Point {
  return { x: sceneX + usable.x / 2, y: sceneZ + usable.y / 2 };
}

/**
 * A carton's distances from the left and front edges of the pallet itself (not of the usable
 * footprint): the pallet is what can be measured from on the floor, and it is the frame the
 * positions are stored in. `c` and `pallet` are in the usable footprint's frame (see
 * `palletRect`). A negative distance: the carton hangs over that edge by so much.
 */
export function fromLeftFront(
  c: ManualCarton,
  base: CartonBase,
  pallet: Rect,
): { left: number; front: number } {
  const r = cartonRect(c, base);
  // The front is the edge at the greatest y (see layer.ts).
  return { left: r.x - pallet.x, front: pallet.y + pallet.h - (r.y + r.h) };
}

/** The minimum corner of a carton that stands `left` and `front` from those edges. */
export function atLeftFront(
  c: ManualCarton,
  base: CartonBase,
  pallet: Rect,
  at: { left: number; front: number },
): Point {
  const r = cartonRect(c, base);
  return { x: pallet.x + at.left, y: pallet.y + pallet.h - r.h - at.front };
}
