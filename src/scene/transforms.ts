import { PALLET_HEIGHT } from '../domain/constants';
import type { Inputs, Layout } from '../domain/types';
import { usableFootprint } from '../engine/packing/geometry';
import { cartonPlacements, type PlacedBox } from '../engine/packing/positions';

/**
 * The only place that converts the engine frame to the three.js scene frame.
 * Engine: x along pallet length, y along width, z up, origin at the usable footprint's
 * minimum corner, z = 0 on the pallet top. Scene: 1 unit = 1 inch, Y up, the usable
 * footprint centred on the origin, Y = 0 on the floor (pallet underside).
 */

export type Vec3 = [number, number, number];
export interface SceneBounds {
  min: Vec3;
  max: Vec3;
}

/** Footprint used when there are no inputs yet: 48 x 40 pallet, 5 tall. */
const PLACEHOLDER = { length: 48, width: 40 };

/** Scene position of an engine-frame point. */
function toScenePoint(x: number, y: number, z: number, i: Inputs): Vec3 {
  const usable = usableFootprint(i);
  return [x - usable.x / 2, z + PALLET_HEIGHT, y - usable.y / 2];
}

/** Centre of the box in the scene frame. */
export function toScenePosition(b: PlacedBox, i: Inputs): Vec3 {
  return toScenePoint(b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz / 2, i);
}

/** Size of the box along scene X, Y, Z: engine dx, dz, dy. */
export function toSceneScale(b: PlacedBox): Vec3 {
  return [b.dx, b.dz, b.dy];
}

/** Scene-frame min and max corners of the box. */
export function toSceneBounds(b: PlacedBox, i: Inputs): SceneBounds {
  const min = toScenePoint(b.x, b.y, b.z, i);
  const max = toScenePoint(b.x + b.dx, b.y + b.dy, b.z + b.dz, i);
  return { min, max };
}

/**
 * Column-major 4x4 matrices (three.js order), 16 numbers per box, scaling a unit cube to the
 * box less `shrink` inches on every axis and moving it to the box centre.
 */
export function instanceMatrices(boxes: PlacedBox[], i: Inputs, shrink = 0): Float32Array {
  const out = new Float32Array(boxes.length * 16);
  boxes.forEach((b, k) => {
    const [px, py, pz] = toScenePosition(b, i);
    const [sx, sy, sz] = toSceneScale(b);
    const o = k * 16;
    out[o] = sx - shrink;
    out[o + 5] = sy - shrink;
    out[o + 10] = sz - shrink;
    out[o + 12] = px;
    out[o + 13] = py;
    out[o + 14] = pz;
    out[o + 15] = 1;
  });
  return out;
}

/** The pallet's own bounds: its real footprint centred on the origin, 5 tall. */
export function palletBounds(i: Inputs | null): SceneBounds {
  const { length, width } = i ? i.pallet : PLACEHOLDER;
  return { min: [-length / 2, 0, -width / 2], max: [length / 2, PALLET_HEIGHT, width / 2] };
}

/** Bounds of the whole load: the pallet plus every carton of the layout. */
export function loadBounds(l: Layout | null, i: Inputs | null): SceneBounds {
  const { min, max } = palletBounds(i);
  if (l && i) {
    for (const c of cartonPlacements(l, i)) {
      const b = toSceneBounds(c, i);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, b.min[k]!);
        max[k] = Math.max(max[k]!, b.max[k]!);
      }
    }
  }
  return { min, max };
}

/** The 12 corner pairs of a box, as indices into its 8 corners (bit 0: x, bit 1: y, bit 2: z). */
// prettier-ignore
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], // along x
  [0, 2], [1, 3], [4, 6], [5, 7], // along y
  [0, 4], [1, 5], [2, 6], [3, 7], // along z
];

/** The 12 edges of a scene box as 24 points, each consecutive pair one line segment. */
export function boundsEdges({ min, max }: SceneBounds): Vec3[] {
  return EDGES.flatMap((pair) =>
    pair.map((c): Vec3 => [
      c & 1 ? max[0] : min[0],
      c & 2 ? max[1] : min[1],
      c & 4 ? max[2] : min[2],
    ]),
  );
}

/** Line-segment vertices (x, y, z triples) for the 12 edges of every box, in the scene frame. */
export function boxEdgePositions(boxes: PlacedBox[], i: Inputs): Float32Array {
  const out = new Float32Array(boxes.length * EDGES.length * 2 * 3);
  let o = 0;
  for (const b of boxes) {
    for (const p of boundsEdges(toSceneBounds(b, i))) {
      out.set(p, o);
      o += 3;
    }
  }
  return out;
}
