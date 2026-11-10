import { Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyCaptureColors,
  CAPTURE_COLOR,
  HIDE_IN_ORTHO_CAPTURE,
  withHiddenForOrthoCapture,
} from './captureVisibility';

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

describe('applyCaptureColors', () => {
  it('sets flagged materials to their capture colour until restored', () => {
    const root = new Group();
    const line = new Mesh(undefined, new MeshBasicMaterial({ color: '#d1d5db' }));
    line.userData[CAPTURE_COLOR] = '#111827';
    const carton = new Mesh(undefined, new MeshBasicMaterial({ color: '#c8a26b' }));
    root.add(line, carton);

    const restore = applyCaptureColors(root);
    expect(line.material.color.getHexString()).toBe('111827');
    expect(carton.material.color.getHexString()).toBe('c8a26b');

    restore();
    expect(line.material.color.getHexString()).toBe('d1d5db');
    expect(carton.material.color.getHexString()).toBe('c8a26b');
  });
});
