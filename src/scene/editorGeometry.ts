/**
 * What the manual layout editor draws, as plain data: the one carton of the Carton step and
 * the one layer of the Pallet layer step, as ordinary layouts, so the same carton and product
 * drawing code shows them. No React, no three.js.
 */
import { PALLET_HEIGHT } from '../domain/constants';
import type { CartonCandidate, Inputs, Layout } from '../domain/types';
import { verticalAxis, type CartonDesign } from '../engine/manual/carton';
import { cartonBase, manualPattern } from '../engine/manual/layer';
import { usableFootprint } from '../engine/packing/geometry';
import { cartonPlacements } from '../engine/packing/positions';
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
