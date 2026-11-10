import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import type { PerspectiveCamera, Vector3 } from 'three';
import type { Inputs } from '../domain/types';
import { useScene } from '../ui/StoreContext';
import { perspectiveFit } from './cameraFit';
import type { SceneBounds } from './transforms';

/** The part of the default OrbitControls the rig drives. */
interface Orbit {
  target: Vector3;
  update(): void;
}

interface Props {
  /** Bounds of the whole load. */
  load: SceneBounds;
  /** Bounds of the selected object, if any. */
  selected: SceneBounds | null;
  /** The camera re-fits the load whenever a new result (new inputs) arrives. */
  inputs: Inputs | null;
  /** Turning measurements on or off re-frames the load so the dimension lines fit. */
  measurements: boolean;
}

/** Orbit controls plus the initial fit, Reset view and Focus selection. */
export function CameraRig({ load, selected, inputs, measurements }: Props) {
  const get = useThree((s) => s.get);
  const controls = useThree((s) => s.controls);
  const invalidate = useThree((s) => s.invalidate);
  const command = useScene((s) => s.cameraCommand);
  const latest = useRef({ load, selected });
  useEffect(() => {
    latest.current = { load, selected };
  });

  const fitTo = useCallback(
    (bounds: SceneBounds) => {
      const { camera, size, controls: c } = get();
      const cam = camera as PerspectiveCamera;
      const fit = perspectiveFit(bounds, cam.fov, size.width / Math.max(size.height, 1));
      cam.position.set(...fit.position);
      cam.lookAt(...fit.target);
      cam.updateProjectionMatrix();
      // Picking before the next frame must already see the new camera.
      cam.updateMatrixWorld();
      const orbit = c as unknown as Orbit | null;
      if (orbit) {
        orbit.target.set(...fit.target);
        orbit.update();
      }
      invalidate();
    },
    [get, invalidate],
  );

  // Initial view, and a fresh view of the load whenever a new result arrives or
  // measurements are switched (so the dimension lines are framed).
  useEffect(() => {
    fitTo(latest.current.load);
  }, [inputs, measurements, controls, fitTo]);

  useEffect(() => {
    if (!command) return;
    const { load: l, selected: s } = latest.current;
    fitTo(command.type === 'focus' ? (s ?? l) : l);
  }, [command, fitTo]);

  return <OrbitControls makeDefault onChange={() => invalidate()} />;
}
