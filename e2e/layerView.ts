/**
 * Where the cartons of the editor's Pallet layer step are on the screen, worked out from the
 * accessible carton list's data attributes and the camera rule the editor itself uses
 * (src/scene/cameraFit.ts), so a test can press on a carton and drag it. Nothing in the app is
 * there only for this. It holds while the camera is where "Top view" or "Reset view" put it.
 */
import type { Locator, Page } from '@playwright/test';
import { EDITOR_FOV, LAYER_VIEW_DIR, perspectiveFit, TOP_VIEW_DIR } from '../src/scene/cameraFit';

const PALLET_HEIGHT = 5;
type Vec3 = [number, number, number];

export interface ListedCarton {
  /** Its index in the layer; "Carton k + 1" in the list. */
  k: number;
  /** The minimum corner and size, in inches, in the usable footprint's frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  turned: boolean;
  outside: boolean;
  selected: boolean;
  label: string;
}

export interface ListedLayer {
  usable: { x: number; y: number };
  cartonHeight: number;
  cartons: ListedCarton[];
}

export const cartonList = (page: Page): Locator => page.getByTestId('carton-list');

/** The layer as the accessible list has it. */
export async function readLayer(page: Page): Promise<ListedLayer> {
  return cartonList(page).evaluate((ul) => {
    const list = ul as HTMLElement;
    const num = (v: string | undefined) => Number(v);
    return {
      usable: { x: num(list.dataset.footprintLength), y: num(list.dataset.footprintWidth) },
      cartonHeight: num(list.dataset.cartonHeight),
      cartons: [...list.querySelectorAll<HTMLElement>('[data-carton]')].map((b) => ({
        k: num(b.dataset.carton),
        x: num(b.dataset.x),
        y: num(b.dataset.y),
        w: num(b.dataset.w),
        h: num(b.dataset.h),
        turned: b.dataset.turned === 'true',
        outside: b.dataset.outside === 'true',
        selected: b.getAttribute('aria-pressed') === 'true',
        label: b.getAttribute('aria-label') ?? '',
      })),
    };
  });
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a);
  return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * The screen position of a point of the layer: (x, y) in inches in the usable footprint's
 * frame, on top of the cartons. `view` is the view the editor is in.
 */
export async function screenPoint(
  page: Page,
  layer: ListedLayer,
  view: 'top' | 'angle',
  at: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('editor-scene').locator('canvas').boundingBox();
  if (!box) throw new Error('The editor has no canvas');
  const { usable, cartonHeight, cartons } = layer;
  // What the editor frames: the footprint (the pallet is inside it) and every carton.
  const min: Vec3 = [-usable.x / 2, 0, -usable.y / 2];
  const max: Vec3 = [usable.x / 2, PALLET_HEIGHT, usable.y / 2];
  for (const c of cartons) {
    min[0] = Math.min(min[0], c.x - usable.x / 2);
    min[2] = Math.min(min[2], c.y - usable.y / 2);
    max[0] = Math.max(max[0], c.x + c.w - usable.x / 2);
    max[2] = Math.max(max[2], c.y + c.h - usable.y / 2);
    max[1] = PALLET_HEIGHT + cartonHeight;
  }
  const aspect = box.width / box.height;
  const fit = perspectiveFit(
    { min, max },
    EDITOR_FOV,
    aspect,
    view === 'top' ? TOP_VIEW_DIR : LAYER_VIEW_DIR,
  );
  const forward = unit(sub(fit.target, fit.position));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const point: Vec3 = [at.x - usable.x / 2, PALLET_HEIGHT + cartonHeight, at.y - usable.y / 2];
  const v = sub(point, fit.position);
  const depth = dot(v, forward);
  const half = Math.tan((EDITOR_FOV * Math.PI) / 360);
  const ndcX = dot(v, right) / (depth * half * aspect);
  const ndcY = dot(v, up) / (depth * half);
  return {
    x: box.x + ((ndcX + 1) / 2) * box.width,
    y: box.y + ((1 - ndcY) / 2) * box.height,
  };
}

/** The screen position of the middle of a carton's top. */
export function cartonCentre(page: Page, layer: ListedLayer, view: 'top' | 'angle', k: number) {
  const c = layer.cartons[k];
  if (!c) throw new Error(`No carton ${k}`);
  return screenPoint(page, layer, view, { x: c.x + c.w / 2, y: c.y + c.h / 2 });
}
