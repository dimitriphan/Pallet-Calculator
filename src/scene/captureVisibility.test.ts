import { Color, Group, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { sceneTheme } from './sceneTheme';
import {
  applyCaptureColors,
  CAPTURE_COLOR,
  CAPTURE_UNIFORM_COLORS,
  captureGridColors,
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

describe('capture grid colours', () => {
  it('sets colour uniforms of flagged shader materials until restored', () => {
    const root = new Group();
    const material = new ShaderMaterial({
      uniforms: {
        cellColor: { value: new Color('#4b5563') },
        sectionColor: { value: new Color('#9ca3af') },
      },
    });
    const grid = new Mesh(undefined, material);
    grid.userData[CAPTURE_UNIFORM_COLORS] = { cellColor: '#d1d5db', sectionColor: '#9ca3af' };
    root.add(grid);
    const cell = material.uniforms.cellColor!.value as Color;

    const restore = applyCaptureColors(root);
    expect(cell.getHexString()).toBe('d1d5db');
    restore();
    expect(cell.getHexString()).toBe('4b5563');
    // The same Color object: the material keeps the uniform it was given.
    expect(material.uniforms.cellColor!.value).toBe(cell);
  });

  it('captures the grid in the light theme colours', () => {
    const light = sceneTheme('light');
    expect(captureGridColors).toEqual({
      cellColor: light.gridCell,
      sectionColor: light.gridSection,
    });
    expect(sceneTheme('harbor').gridCell).not.toBe(light.gridCell);
  });

  /** A grid whose uniforms start in the Harbor colours and are flagged with the capture ones. */
  function harborGrid() {
    const harbor = sceneTheme('harbor');
    const material = new ShaderMaterial({
      uniforms: {
        cellColor: { value: new Color(harbor.gridCell) },
        sectionColor: { value: new Color(harbor.gridSection) },
      },
    });
    const grid = new Mesh(undefined, material);
    grid.userData[CAPTURE_UNIFORM_COLORS] = captureGridColors;
    const root = new Group();
    root.add(grid);
    const hex = (name: string) => (material.uniforms[name]!.value as Color).getHexString();
    return { root, hex };
  }

  it('swaps the harbor grid to the light colours during a capture and back after', () => {
    const { root, hex } = harborGrid();
    expect([hex('cellColor'), hex('sectionColor')]).toEqual(['395265', '526a7a']);
    const restore = applyCaptureColors(root);
    expect([hex('cellColor'), hex('sectionColor')]).toEqual(['d1d5db', '9ca3af']);
    restore();
    expect([hex('cellColor'), hex('sectionColor')]).toEqual(['395265', '526a7a']);
  });

  it('puts the harbor grid back when the render throws', () => {
    const { root, hex } = harborGrid();
    const render = () => {
      const restore = applyCaptureColors(root);
      try {
        expect(hex('cellColor')).toBe('d1d5db');
        throw new Error('lost context');
      } finally {
        restore();
      }
    };
    expect(render).toThrow('lost context');
    expect([hex('cellColor'), hex('sectionColor')]).toEqual(['395265', '526a7a']);
  });
});
