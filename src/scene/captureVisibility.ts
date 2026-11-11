import {
  Color,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import { sceneTheme } from './sceneTheme';

/**
 * userData key for objects left out of the orthographic top and side PNG captures: the
 * measurement lines (their labels are DOM overlays, so the lines would appear without numbers)
 * and the selection outline.
 */
export const HIDE_IN_ORTHO_CAPTURE = 'hideInOrthoCapture';

/**
 * userData key for objects left out of the build sheet's pictures, which are for the people
 * building the pallet: the unused-space overlay.
 */
export const HIDE_IN_BUILD_SHEET = 'hideInBuildSheet';

/**
 * Runs `render` with every object under `root` flagged with userData `key` hidden, then
 * restores their visibility.
 */
export function withHidden<T>(root: Object3D, key: string, render: () => T): T {
  const hidden: Object3D[] = [];
  root.traverse((o) => {
    if (o.userData[key] === true && o.visible) hidden.push(o);
  });
  for (const o of hidden) o.visible = false;
  try {
    return render();
  } finally {
    for (const o of hidden) o.visible = true;
  }
}

/** Runs `render` with the objects left out of the top and side captures hidden. */
export function withHiddenForOrthoCapture<T>(root: Object3D, render: () => T): T {
  return withHidden(root, HIDE_IN_ORTHO_CAPTURE, render);
}

/**
 * userData key holding the colour an object's material is drawn in for PNG captures, which
 * are always light, e.g. the measurement lines, whose on-screen colour follows the theme.
 */
export const CAPTURE_COLOR = 'captureColor';

/**
 * userData key holding, for a shader material such as the floor grid's, the colour each
 * named colour uniform is drawn in for PNG captures: { uniformName: colour }.
 */
export const CAPTURE_UNIFORM_COLORS = 'captureUniformColors';

/** The floor grid's capture colours: the light theme's, so dark-theme exports match. */
export const captureGridColors = {
  cellColor: sceneTheme('light').gridCell,
  sectionColor: sceneTheme('light').gridSection,
};

/**
 * Sets every flagged material (and every flagged colour uniform) under `root` to its capture
 * colour and returns a function that puts the previous colours back.
 */
export function applyCaptureColors(root: Object3D): () => void {
  const changed: { color: Color; previous: Color }[] = [];
  const change = (color: unknown, target: unknown) => {
    if (!(color instanceof Color) || typeof target !== 'string') return;
    changed.push({ color, previous: color.clone() });
    color.set(target);
  };
  root.traverse((o) => {
    const material = (o as Partial<Mesh>).material;
    if (!material || Array.isArray(material)) return;
    change((material as Partial<MeshBasicMaterial>).color, o.userData[CAPTURE_COLOR]);
    const targets: unknown = o.userData[CAPTURE_UNIFORM_COLORS];
    const uniforms = (material as Partial<ShaderMaterial>).uniforms;
    if (!targets || typeof targets !== 'object' || !uniforms) return;
    for (const [name, target] of Object.entries(targets as Record<string, unknown>))
      change(uniforms[name]?.value, target);
  });
  return () => {
    for (const { color, previous } of changed) color.copy(previous);
  };
}
