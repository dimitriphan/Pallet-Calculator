import type { SceneBounds, Vec3 } from './transforms';

export type Bounds = SceneBounds;

export interface PerspectiveFit {
  position: Vec3;
  target: Vec3;
}

export interface OrthoFit {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/** Viewing direction for the default perspective: from the front-right, above the load. */
const VIEW_DIR: Vec3 = [0.9, 0.75, 1.3];
const MARGIN = 1.1;

function centre(b: Bounds): Vec3 {
  return [0, 1, 2].map((k) => (b.min[k]! + b.max[k]!) / 2) as Vec3;
}

function size(b: Bounds): Vec3 {
  return [0, 1, 2].map((k) => b.max[k]! - b.min[k]!) as Vec3;
}

/**
 * A camera position that keeps the bounds' bounding sphere inside the narrower of the vertical
 * and horizontal fields of view, looking at the bounds centre.
 */
export function perspectiveFit(bounds: Bounds, fovDeg: number, aspect: number): PerspectiveFit {
  const target = centre(bounds);
  const radius = Math.max(Math.hypot(...size(bounds)) / 2, 1);
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const distance = (radius / Math.sin(Math.min(vHalf, hHalf))) * MARGIN;
  const len = Math.hypot(...VIEW_DIR);
  const position = target.map((t, k) => t + (VIEW_DIR[k]! / len) * distance) as Vec3;
  return { position, target };
}

/**
 * An orthographic camera that frames the bounds at `aspect` (width / height) with `margin`:
 * 'top' looks straight down with the length across and the far side at the top;
 * 'side' looks along +Z at the length x height face with height vertical.
 */
export function orthoFit(
  bounds: Bounds,
  view: 'top' | 'side',
  aspect: number,
  margin = MARGIN,
): OrthoFit {
  const c = centre(bounds);
  const [sx, sy, sz] = size(bounds);
  const across = sx;
  const vertical = view === 'top' ? sz : sy;
  const depth = view === 'top' ? sy : sz;

  let halfW = (across * margin) / 2;
  let halfH = (vertical * margin) / 2;
  if (halfW / halfH > aspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;

  const standoff = depth / 2 + 10;
  const position: Vec3 =
    view === 'top' ? [c[0], c[1] + standoff, c[2]] : [c[0], c[1], c[2] - standoff];
  return {
    position,
    target: c,
    up: view === 'top' ? [0, 0, -1] : [0, 1, 0],
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
    near: 1,
    far: standoff + depth / 2 + 10,
  };
}
