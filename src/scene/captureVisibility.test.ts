import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { HIDE_IN_ORTHO_CAPTURE, withHiddenForOrthoCapture } from './captureVisibility';

describe('withHiddenForOrthoCapture', () => {
  it('hides flagged objects while the callback runs and restores them afterwards', () => {
    const root = new Group();
    const measurement = new Group();
    measurement.userData[HIDE_IN_ORTHO_CAPTURE] = true;
    const alreadyHidden = new Group();
    alreadyHidden.userData[HIDE_IN_ORTHO_CAPTURE] = true;
    alreadyHidden.visible = false;
    const carton = new Object3D();
    root.add(measurement, alreadyHidden, carton);

    const seen = withHiddenForOrthoCapture(root, () => [
      measurement.visible,
      alreadyHidden.visible,
      carton.visible,
    ]);
    expect(seen).toEqual([false, false, true]);
    expect([measurement.visible, alreadyHidden.visible, carton.visible]).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('restores visibility when the callback throws', () => {
    const root = new Group();
    const outline = new Group();
    outline.userData[HIDE_IN_ORTHO_CAPTURE] = true;
    root.add(outline);
    expect(() =>
      withHiddenForOrthoCapture(root, () => {
        throw new Error('lost context');
      }),
    ).toThrow('lost context');
    expect(outline.visible).toBe(true);
  });
});
