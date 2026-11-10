import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrthographicCamera, Vector2 } from 'three';
import { useStores } from '../ui/StoreContext';
import { orthoFit } from './cameraFit';
import type { SceneBounds } from './transforms';

const ASPECT = 3 / 2;
const ORTHO_SIZE = { width: 1800, height: 1200 };

/**
 * Registers `captureViews` on the scene store: PNG data URLs of the user's current view and of
 * orthographic top and side views of the load, rendered at 1800 x 1200.
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

      gl.render(world, camera);
      const current = read();

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
      try {
        gl.setPixelRatio(1);
        gl.setSize(ORTHO_SIZE.width, ORTHO_SIZE.height, false);
        const top = ortho('top');
        const side = ortho('side');
        return { current, top, side };
      } finally {
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
