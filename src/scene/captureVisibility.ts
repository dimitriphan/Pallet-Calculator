import type { Object3D } from 'three';

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
