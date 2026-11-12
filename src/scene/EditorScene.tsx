import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, type PerspectiveCamera, type Vector3 } from 'three';
import { PRODUCT_RENDER_THRESHOLD } from '../domain/constants';
import { cartonPlacements } from '../engine/packing/positions';
import type { EditorSession } from '../store/manualEditorStore';
import { fmtCount } from '../ui/format';
import { useManualEditor } from '../ui/StoreContext';
import { useResolvedTheme } from '../ui/useTheme';
import { aspectChanged } from './aspect';
import { perspectiveFit, VIEW_DIR } from './cameraFit';
import { Cartons } from './Cartons';
import {
  cartonPreviewLayout,
  cartonsBounds,
  footprintOutline,
  layerPreviewLayout,
  layerStepBounds,
} from './editorGeometry';
import { Pallet } from './Pallet';
import { Products } from './Products';
import { sceneTheme } from './sceneTheme';
import type { SceneBounds, Vec3 } from './transforms';

/** The Pallet layer step looks down on the layer at an angle, from the front. */
const LAYER_VIEW_DIR: Vec3 = [0.35, 1.25, 1];
/** The usable footprint's outline: the envelope's blue, as in the normal view. */
const FOOTPRINT_COLOR = '#3b82f6';
const NOTHING = () => {};

interface Orbit {
  target: Vector3;
  update(): void;
}

interface CameraProps {
  bounds: SceneBounds;
  /** The view the camera starts from; changing it (a new step) starts a fresh view. */
  direction: Vec3;
  /** Bumped by "Reset view". */
  reset: number;
}

/**
 * Orbit controls for the editor. A new step or "Reset view" looks from the step's own
 * direction; when what is shown changes size (a count is raised) the camera only moves in or
 * out to keep it framed, so the user's own view of it is kept.
 */
function EditorCamera({ bounds, direction, reset }: CameraProps) {
  const get = useThree((s) => s.get);
  const controls = useThree((s) => s.controls);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const latest = useRef({ bounds, direction });
  useEffect(() => {
    latest.current = { bounds, direction };
  });
  const lastAspect = useRef(0);

  const fit = useCallback(
    (from: Vec3 | null) => {
      const { camera, size: s, controls: c } = get();
      const cam = camera as PerspectiveCamera;
      const orbit = c as unknown as Orbit | null;
      const aspect = s.width / Math.max(s.height, 1);
      lastAspect.current = aspect;
      const kept: Vec3 = orbit
        ? [
            cam.position.x - orbit.target.x,
            cam.position.y - orbit.target.y,
            cam.position.z - orbit.target.z,
          ]
        : latest.current.direction;
      const view = perspectiveFit(latest.current.bounds, cam.fov, aspect, from ?? kept);
      cam.position.set(...view.position);
      cam.lookAt(...view.target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      if (orbit) {
        orbit.target.set(...view.target);
        orbit.update();
      }
      invalidate();
    },
    [get, invalidate],
  );

  useEffect(() => {
    fit(latest.current.direction);
  }, [direction, reset, controls, fit]);

  useEffect(() => {
    fit(null);
  }, [bounds, fit]);

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    if (aspectChanged(lastAspect.current, aspect)) fit(null);
  }, [size, fit]);

  return <OrbitControls makeDefault onChange={() => invalidate()} />;
}

/** The Carton step: one carton, see-through, with its boxes inside. */
function CartonStepScene({ session }: { session: EditorSession }) {
  const { design, carton, inputs } = session;
  const layout = useMemo(
    () => cartonPreviewLayout(design, carton, inputs),
    [design, carton, inputs],
  );
  const cartons = useMemo(() => cartonPlacements(layout, inputs), [layout, inputs]);
  const drawBoxes = carton.boxesPerCarton <= PRODUCT_RENDER_THRESHOLD;
  return (
    <>
      <Cartons
        cartons={cartons}
        inputs={inputs}
        productsShown={drawBoxes}
        wireframe={false}
        onPick={NOTHING}
        shellOpacity={0.4}
      />
      {drawBoxes && <Products layout={layout} inputs={inputs} wireframe={false} onPick={NOTHING} />}
    </>
  );
}

function FootprintOutline({ session }: { session: EditorSession }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(footprintOutline(session.inputs).flat()), 3),
    );
    return g;
  }, [session.inputs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={FOOTPRINT_COLOR} />
    </lineSegments>
  );
}

/**
 * The Pallet layer step: the pallet, the outline of the usable footprint and the one layer.
 * Selecting, dragging and the drag plane belong here.
 */
function LayerStepScene({ session }: { session: EditorSession }) {
  const { inputs } = session.build;
  const layout = useMemo(() => layerPreviewLayout(session.build.layout), [session.build.layout]);
  const cartons = useMemo(() => cartonPlacements(layout, inputs), [layout, inputs]);
  return (
    <>
      <Pallet length={inputs.pallet.length} width={inputs.pallet.width} onPick={NOTHING} />
      <FootprintOutline session={session} />
      <Cartons
        cartons={cartons}
        inputs={inputs}
        productsShown={false}
        wireframe={false}
        onPick={NOTHING}
      />
    </>
  );
}

function EditorContents({ session, reset }: { session: EditorSession; reset: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const theme = sceneTheme(useResolvedTheme());
  const carton = session.step === 'carton';
  const { design, carton: designed, inputs, build } = session;
  const fresh: SceneBounds = carton
    ? (cartonsBounds(cartonPreviewLayout(design, designed, inputs), inputs) ?? {
        min: [-1, 0, -1],
        max: [1, 1, 1],
      })
    : layerStepBounds(layerPreviewLayout(build.layout), build.inputs);
  // The same object while the numbers are the same: typing a name must not move the camera.
  const key = JSON.stringify(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => fresh, [key]);

  // The canvas renders on demand: draw a new frame whenever what it shows changes.
  useEffect(() => {
    invalidate();
  }, [invalidate, session, theme]);

  return (
    <>
      <color attach="background" args={[theme.background]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[80, 160, 120]} intensity={1.6} />
      <directionalLight position={[-120, 90, -80]} intensity={0.5} />
      {carton ? <CartonStepScene session={session} /> : <LayerStepScene session={session} />}
      <EditorCamera bounds={bounds} direction={carton ? VIEW_DIR : LAYER_VIEW_DIR} reset={reset} />
    </>
  );
}

const CHIP =
  'bg-white/90 px-2 py-1 text-xs text-gray-800 dark:bg-harbor-deep dark:text-harbor-foam';

/**
 * The editor's 3D view, over the normal one while a layout is edited by hand. It has its own
 * canvas: the normal view stays as it is underneath, so exports and the build sheet still show
 * the selected layout.
 */
export function EditorScene() {
  const session = useManualEditor((s) => s.session);
  const [reset, setReset] = useState(0);
  if (!session) return null;
  const carton = session.step === 'carton';
  const boxes = session.carton.boxesPerCarton;
  return (
    <div
      role="group"
      aria-label={carton ? '3D view of the carton' : '3D view of the pallet layer'}
      data-testid="editor-scene"
      data-step={session.step}
      className="relative h-full w-full"
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        frameloop="demand"
        flat
        camera={{ fov: 40, near: 0.1, far: 20000, position: [40, 30, 50] }}
      >
        <EditorContents session={session} reset={reset} />
      </Canvas>
      <p className={`pointer-events-none absolute bottom-2 left-2 max-w-[70%] ${CHIP}`}>
        {carton
          ? boxes > PRODUCT_RENDER_THRESHOLD
            ? `One carton. Too many boxes to draw one by one (${fmtCount(boxes)}).`
            : 'One carton, drawn open with its boxes inside. Drag to look around.'
          : 'One layer on the pallet. The blue outline is the allowed footprint.'}
      </p>
      <button
        type="button"
        onClick={() => setReset((n) => n + 1)}
        className="focus-ticks absolute right-2 top-2 inline-flex min-h-[44px] items-center border border-gray-300 bg-white px-2.5 text-sm text-gray-800 hover:bg-gray-50 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:hover:bg-harbor-raised dark:hover:underline"
      >
        Reset view
      </button>
    </div>
  );
}
