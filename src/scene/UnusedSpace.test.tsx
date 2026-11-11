import { _roots, act, createRoot, extend, type ReconcilerRoot } from '@react-three/fiber';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { optimize } from '../engine/optimize';
import { StoreProvider } from '../ui/StoreContext';
import { makeStores } from '../ui/testUtils';
import { CaptureBridge } from './CaptureBridge';
import { HIDE_IN_BUILD_SHEET } from './captureVisibility';
import { sceneTheme } from './sceneTheme';
import { loadBounds } from './transforms';
import { UnusedSpace } from './UnusedSpace';

extend(THREE);

/** A stand-in for the WebGL renderer: records, at every render, whether the overlay shows. */
function fakeRenderer(canvas: HTMLCanvasElement, seen: boolean[], isShown: () => boolean) {
  return {
    domElement: canvas,
    render: () => seen.push(isShown()),
    getSize: (v: THREE.Vector2) => v.set(300, 200),
    setSize: () => undefined,
    getPixelRatio: () => 1,
    setPixelRatio: () => undefined,
    setAnimationLoop: () => undefined,
    dispose: () => undefined,
    forceContextLoss: () => undefined,
    xr: { enabled: false, addEventListener: () => undefined, removeEventListener: () => undefined },
    shadowMap: {},
  };
}

let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
});

describe('the unused-space overlay in captures', () => {
  it('is flagged and left out of the build sheet pictures, but kept in the PNG', async () => {
    const layout = optimize(DEFAULT_INPUTS).layouts[0]!.layout;
    const stores = makeStores();
    const canvas = document.createElement('canvas');
    canvas.toDataURL = () => 'data:image/png;base64,';
    const seen: boolean[] = [];
    const found: { overlay?: THREE.Object3D } = {};
    const isShown = () => {
      let o: THREE.Object3D | null | undefined = found.overlay;
      while (o) {
        if (!o.visible) return false;
        o = o.parent;
      }
      return true;
    };
    root = createRoot(canvas);
    root.configure({
      gl: fakeRenderer(canvas, seen, isShown) as never,
      frameloop: 'never',
      size: { width: 300, height: 200, top: 0, left: 0 },
    });
    await act(async () =>
      root!.render(
        <StoreProvider stores={stores}>
          <UnusedSpace layout={layout} inputs={DEFAULT_INPUTS} colors={sceneTheme('light').fixed} />
          <CaptureBridge bounds={loadBounds(layout, DEFAULT_INPUTS)} />
        </StoreProvider>,
      ),
    );
    const scene = _roots.get(canvas)!.store.getState().scene;
    const flagged: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData[HIDE_IN_BUILD_SHEET] === true) flagged.push(o);
    });
    // The overlay's group carries the flag, and it holds the red blocks and their edges.
    expect(flagged).toHaveLength(1);
    found.overlay = flagged[0];
    const overlay = found.overlay!;
    const kinds: string[] = [];
    overlay.traverse((o) => kinds.push(o.type));
    expect(kinds).toEqual(expect.arrayContaining(['Mesh', 'LineSegments']));

    const capture = stores.scene.getState().captureViews!;
    // Build sheet: hidden in the 3D view and the top and side views, then shown again.
    seen.length = 0;
    capture({ leaveOutUnusedSpace: true });
    expect(seen.slice(0, 3)).toEqual([false, false, false]);
    expect(seen.at(-1)).toBe(true);
    expect(overlay.visible).toBe(true);
    // PNG export: kept in every picture.
    seen.length = 0;
    capture();
    expect(seen.slice(0, 3)).toEqual([true, true, true]);
  });
});
