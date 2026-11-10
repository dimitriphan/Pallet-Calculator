import { Color, type Mesh, type MeshBasicMaterial, type Object3D } from 'three';

/**
 * userData key for objects left out of the orthographic top and side PNG captures: the
 * measurement lines (their labels are DOM overlays, so the lines would appear without numbers)
 * and the selection outline.
 */
export const HIDE_IN_ORTHO_CAPTURE = 'hideInOrthoCapture';

/** Runs `render` with every flagged object under `root` hidden, then restores their visibility. */
export function withHiddenForOrthoCapture<T>(root: Object3D, render: () => T): T {
  const hidden: Object3D[] = [];
  root.traverse((o) => {
    if (o.userData[HIDE_IN_ORTHO_CAPTURE] === true && o.visible) hidden.push(o);
  });
  for (const o of hidden) o.visible = false;
  try {
    return render();
  } finally {
    for (const o of hidden) o.visible = true;
  }
}

/**
 * userData key holding the colour an object's material is drawn in for PNG captures, which
 * are always light, e.g. the measurement lines, whose on-screen colour follows the theme.
 */
export const CAPTURE_COLOR = 'captureColor';

/**
 * Sets every flagged material under `root` to its capture colour and returns a function that
 * puts the previous colours back.
 */
export function applyCaptureColors(root: Object3D): () => void {
  const changed: { color: Color; previous: Color }[] = [];
  root.traverse((o) => {
    const target: unknown = o.userData[CAPTURE_COLOR];
    const material = (o as Partial<Mesh>).material;
    if (typeof target !== 'string' || !material || Array.isArray(material)) return;
    const color = (material as Partial<MeshBasicMaterial>).color;
    if (!(color instanceof Color)) return;
    changed.push({ color, previous: color.clone() });
    color.set(target);
  });
  return () => {
    for (const { color, previous } of changed) color.copy(previous);
  };
}
