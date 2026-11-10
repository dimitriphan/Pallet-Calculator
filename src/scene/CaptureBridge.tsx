import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Color, OrthographicCamera, Vector2 } from 'three';
import { useStores } from '../ui/StoreContext';
import { orthoFit } from './cameraFit';
import { applyCaptureColors, withHiddenForOrthoCapture } from './captureVisibility';
import { LIGHT_BACKGROUND } from './sceneTheme';
import type { SceneBounds } from './transforms';

const ASPECT = 3 / 2;
const ORTHO_SIZE = { width: 1800, height: 1200 };

/**
 * Registers `captureViews` on the scene store: PNG data URLs of the user's current view and of
 * orthographic top and side views of the load, rendered at 1800 x 1200 without measurement
 * lines or the selection outline. All three use the light scene colours, whatever the theme.
 */
export function CaptureBridge({ bounds }: { bounds: SceneBounds }) {
  const get = useThree((s) => s.get);
  const scene = useStores().scene;
  const latest = useRef(bounds);
  useEffect(() => {
    latest.current = bounds;
  });

  useEffect(() => {
    const capture = () => {
      const { gl, scene: world, camera, invalidate } = get();
      const read = () => gl.domElement.toDataURL('image/png');

      const size = gl.getSize(new Vector2());
      const pixelRatio = gl.getPixelRatio();
      const ortho = (view: 'top' | 'side') => {
        const fit = orthoFit(latest.current, view, ASPECT);
        const cam = new OrthographicCamera(
          fit.left,
          fit.right,
          fit.top,
          fit.bottom,
          fit.near,
          fit.far,
        );
        cam.position.set(...fit.position);
        cam.up.set(...fit.up);
        cam.lookAt(...fit.target);
        cam.updateProjectionMatrix();
        gl.render(world, cam);
        return read();
      };
      const previousBackground = world.background;
      world.background = new Color(LIGHT_BACKGROUND);
      const restoreColors = applyCaptureColors(world);
      try {
        gl.render(world, camera);
        const current = read();

        gl.setPixelRatio(1);
        gl.setSize(ORTHO_SIZE.width, ORTHO_SIZE.height, false);
        // Measurement lines (labels are DOM overlays, absent here) and the selection outline
        // are left out of the top and side pictures.
        const top = withHiddenForOrthoCapture(world, () => ortho('top'));
        const side = withHiddenForOrthoCapture(world, () => ortho('side'));
        return { current, top, side };
      } finally {
        world.background = previousBackground;
        restoreColors();
        gl.setPixelRatio(pixelRatio);
        gl.setSize(size.x, size.y, false);
        gl.render(world, camera);
        invalidate();
      }
    };
    scene.getState().setCaptureViews(capture);
    return () => scene.getState().setCaptureViews(null);
  }, [get, scene]);

  return null;
}
