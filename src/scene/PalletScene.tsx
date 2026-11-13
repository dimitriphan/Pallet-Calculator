import { Grid } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { PRODUCT_FORCE_LIMIT, PRODUCT_RENDER_THRESHOLD } from '../domain/constants';
import { useUnit } from '../ui/useUnit';
import { useManualEditor, useScene, useStores } from '../ui/StoreContext';
import { useResolvedTheme } from '../ui/useTheme';
import { CameraRig } from './CameraRig';
import { CaptureBridge } from './CaptureBridge';
import { CAPTURE_UNIFORM_COLORS, captureGridColors } from './captureVisibility';
import { Cartons } from './Cartons';
import { EditorScene } from './EditorScene';
import { Envelope } from './Envelope';
import { hiddenSceneProps } from './hiddenScene';
import { Labels } from './Labels';
import { Measurements } from './Measurements';
import { Pallet } from './Pallet';
import { Products } from './Products';
import { SceneErrorBoundary } from './SceneErrorBoundary';
import { SceneToolbar } from './SceneToolbar';
import { selectionBounds, withMeasurements } from './sceneGeometry';
import { sceneTheme } from './sceneTheme';
import { SelectionOutline } from './SelectionOutline';
import { UnusedSpace } from './UnusedSpace';
import { useSceneData } from './useSceneData';
import { WEBGL_UNAVAILABLE } from './webgl';

/** Everything inside the canvas, drawn from the selected layout and the inputs it came from. */
function SceneContents() {
  const { layout, inputs, cartons, bounds, measured } = useSceneData();
  const s = useScene((st) => st);
  const invalidate = useThree((st) => st.invalidate);
  const themeName = useResolvedTheme();
  const theme = sceneTheme(themeName);
  const unit = useUnit();

  const productsShown =
    !!layout &&
    s.showProducts &&
    (layout.totalProducts <= PRODUCT_RENDER_THRESHOLD ||
      (s.forceProducts && layout.totalProducts <= PRODUCT_FORCE_LIMIT));
  // With measurements on, the camera frames the dimension lines too.
  const framed = useMemo(
    () => (s.showMeasurements ? withMeasurements(bounds) : bounds),
    [s.showMeasurements, bounds],
  );
  const selected = useMemo(
    () => selectionBounds(s.selection, layout, inputs, cartons),
    [s.selection, layout, inputs, cartons],
  );

  // The canvas renders on demand: draw a new frame whenever what it shows changes.
  useEffect(() => {
    invalidate();
  }, [invalidate, layout, inputs, s, theme, unit]);

  const select = s.setSelection;
  return (
    <>
      <color attach="background" args={[theme.background]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[80, 160, 120]} intensity={1.6} />
      <directionalLight position={[-120, 90, -80]} intensity={0.5} />
      {s.showGrid && (
        <Grid
          cellSize={12}
          sectionSize={60}
          cellColor={theme.gridCell}
          sectionColor={theme.gridSection}
          cellThickness={0.8}
          sectionThickness={1.2}
          infiniteGrid
          fadeDistance={900}
          fadeStrength={1.5}
          userData={{ [CAPTURE_UNIFORM_COLORS]: captureGridColors }}
        />
      )}
      {inputs && (
        <Pallet
          length={inputs.pallet.length}
          width={inputs.pallet.width}
          onPick={() => select({ kind: 'pallet' })}
        />
      )}
      {inputs && s.showEnvelope && <Envelope inputs={inputs} />}
      {layout && inputs && s.showCartons && (
        <Cartons
          cartons={cartons}
          inputs={inputs}
          productsShown={productsShown}
          wireframe={s.showWireframe}
          onPick={(cartonIndex) => select({ kind: 'carton', cartonIndex })}
        />
      )}
      {layout && inputs && productsShown && (
        <Products
          layout={layout}
          inputs={inputs}
          wireframe={s.showWireframe}
          onPick={(cartonIndex, productIndex) =>
            select({ kind: 'product', cartonIndex, productIndex })
          }
        />
      )}
      {layout && inputs && s.unusedSpace && (
        <UnusedSpace layout={layout} inputs={inputs} colors={theme.fixed} />
      )}
      {layout && inputs && s.showLabels && cartons[0] && (
        <Labels layout={layout} inputs={inputs} first={cartons[0]} theme={theme} unit={unit} />
      )}
      {s.showMeasurements && inputs && (
        <Measurements
          bounds={measured}
          clear={bounds}
          line={theme.measureLine}
          unit={unit}
          chip={
            themeName === 'harbor'
              ? { backgroundColor: theme.chipBg, color: theme.chipText }
              : undefined
          }
        />
      )}
      {selected && <SelectionOutline bounds={selected} />}
      <CameraRig
        load={framed}
        selected={selected}
        inputs={inputs}
        measurements={s.showMeasurements}
      />
      <CaptureBridge bounds={bounds} />
    </>
  );
}

const Unavailable = () => (
  <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-gray-600 dark:text-harbor-mist">
    {WEBGL_UNAVAILABLE}
  </div>
);

/**
 * The interactive 3D workspace: toolbar above a canvas showing the selected layout. While a
 * layout is edited by hand the editor's view covers both and its bar (outside this module)
 * stands in for the toolbar; the view of the selected layout stays mounted underneath,
 * hidden. Nothing is exported while editing (the hidden view is another size then).
 */
export default function PalletScene() {
  const { layout } = useSceneData();
  const sceneStore = useStores().scene;
  const editing = useManualEditor((s) => s.session !== null);
  const hidden = hiddenSceneProps(editing);
  return (
    <div className="relative h-full w-full">
      <div
        // Hidden, not removed: nothing in it can be focused, clicked or read.
        {...hidden}
        className={`flex h-full w-full flex-col ${hidden.className}`}
        data-testid="layout-scene"
      >
        <SceneToolbar totalProducts={layout?.totalProducts ?? 0} />
        <SceneErrorBoundary fallback={<Unavailable />}>
          <div className="relative min-h-0 flex-1">
            <Canvas
              gl={{ preserveDrawingBuffer: true }}
              dpr={[1, 2]}
              frameloop="demand"
              // No tone mapping: the carton, product and pallet colours show as specified.
              flat
              camera={{ fov: 40, near: 0.5, far: 20000, position: [120, 100, 160] }}
              onPointerMissed={() => sceneStore.getState().setSelection(null)}
            >
              <SceneContents />
            </Canvas>
          </div>
        </SceneErrorBoundary>
      </div>
      {editing && (
        <div className="absolute inset-0">
          <SceneErrorBoundary fallback={<Unavailable />}>
            <EditorScene />
          </SceneErrorBoundary>
        </div>
      )}
    </div>
  );
}
