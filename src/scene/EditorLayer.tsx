import { Line } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Group,
  type MeshStandardMaterial,
} from 'three';
import type { Inputs } from '../domain/types';
import { verticalAxis } from '../engine/manual/carton';
import type { CartonBase, ManualCarton, Point } from '../engine/manual/layer';
import type { PlacedBox } from '../engine/packing/positions';
import type { EditorSession } from '../store/manualEditorStore';
import type { LayerActions } from '../ui/editor/layerActions';
import { useResolvedTheme } from '../ui/useTheme';
import {
  DRAG_LIFT,
  footprintOutline,
  layerBoxes,
  overhanging,
  sceneToFootprint,
  seamPositions,
} from './editorGeometry';
import { InstancedBoxes } from './InstancedBoxes';
import { Pallet } from './Pallet';
import { sceneTheme } from './sceneTheme';
import { SelectionOutline } from './SelectionOutline';
import {
  boundsEdges,
  boxEdgePositions,
  toSceneBounds,
  toScenePosition,
  toSceneScale,
} from './transforms';

const EDGE_COLOR = '#6b4423';
/** Pointer travel (px) before a press on a carton becomes a drag; less is a click or a tap. */
const DRAG_START_PX = 4;
const NOTHING = () => {};

function FootprintOutline({ session, color }: { session: EditorSession; color: string }) {
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
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

/** Line segments from a flat list of x, y, z triples, replaced whenever the list is. */
function Segments({ positions, color }: { positions: Float32Array; color: string }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

/** A carton as it is being dragged: where it would land, and whether it may be dropped there. */
interface DragShown {
  position: Point;
  valid: boolean;
}

/** The colours a carton of the layer can take. */
interface CartonColors {
  plain: Color;
  turned: Color;
  error: Color;
  plainOutside: Color;
  turnedOutside: Color;
}

interface DraggedHandle {
  /** Draws the carton at `shown.position`; called once a frame, outside React. */
  show(shown: DragShown): void;
}

interface DraggedProps {
  /** The carton as it stood when the drag began, and its box there. */
  carton: ManualCarton;
  box: PlacedBox;
  base: CartonBase;
  usable: Point;
  inputs: Inputs;
  colors: CartonColors;
  errorColor: string;
  selected: boolean;
  /** What to show as soon as this is drawn: the drag may be a frame ahead of React. */
  first(): DragShown | null;
}

/** Inches taken off the dragged carton's faces, as `InstancedBoxes` does for the others. */
const SHRINK = 0.02;

/**
 * The one carton being dragged, drawn on its own: its box, edges, seam and outlines are built
 * once, where the carton stood, and a drag then only moves the group that holds them and sets
 * the box's colour (`show`). Nothing of the rest of the layer is touched while the pointer
 * moves, and no geometry is made per frame.
 */
const DraggedCarton = forwardRef<DraggedHandle, DraggedProps>(function DraggedCarton(
  { carton, box, base, usable, inputs, colors, errorColor, selected, first },
  ref,
) {
  const group = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const flagged = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const bounds = useMemo(() => toSceneBounds(box, inputs), [box, inputs]);
  const edges = useMemo(() => boxEdgePositions([box], inputs), [box, inputs]);
  const seam = useMemo(
    () => seamPositions([box], [carton], base, usable),
    [box, carton, base, usable],
  );
  const outline = useMemo(() => boundsEdges(bounds), [bounds]);
  const position = useMemo(() => toScenePosition(box, inputs), [box, inputs]);
  const scale = useMemo(
    () => toSceneScale(box).map((v) => v - SHRINK) as [number, number, number],
    [box],
  );

  const show = useCallback(
    (shown: DragShown) => {
      const at = { ...carton, ...shown.position };
      const outside = overhanging([at], base, usable)[0] ?? false;
      // Lifted a little, so it is drawn over a carton it overlaps.
      group.current?.position.set(at.x - carton.x, DRAG_LIFT, at.y - carton.y);
      material.current?.color.copy(
        !shown.valid
          ? colors.error
          : outside
            ? carton.rotated
              ? colors.turnedOutside
              : colors.plainOutside
            : carton.rotated
              ? colors.turned
              : colors.plain,
      );
      if (flagged.current) flagged.current.visible = outside || !shown.valid;
      invalidate();
    },
    [carton, base, usable, colors, invalidate],
  );
  useImperativeHandle(ref, () => ({ show }), [show]);
  useLayoutEffect(() => {
    show(first() ?? { position: carton, valid: true });
  }, [show, first, carton]);

  return (
    <group ref={group}>
      <mesh position={position} scale={scale}>
        <boxGeometry />
        <meshStandardMaterial ref={material} roughness={0.85} />
      </mesh>
      <Segments positions={edges} color={EDGE_COLOR} />
      <Segments positions={seam} color={EDGE_COLOR} />
      <group ref={flagged} visible={false}>
        <Line points={outline} segments color={errorColor} lineWidth={2.5} renderOrder={5} />
      </group>
      {selected && <SelectionOutline bounds={bounds} />}
    </group>
  );
});

/** A drag in progress. Kept outside React state: pointer events read and change it directly. */
interface Drag {
  index: number;
  pointerId: number;
  element: HTMLElement;
  startX: number;
  startY: number;
  /** The drag plane: horizontal, at the height the carton was grabbed. */
  plane: Plane;
  /** From the carton's minimum corner to the grabbed point, in the footprint's frame. */
  grab: Point;
  moved: boolean;
  /** The last pointer position not yet shown. */
  pending: { x: number; y: number } | null;
  /** What was last shown, for the dragged carton's first drawing. */
  shown: DragShown | null;
  frame: number;
  end(): void;
}

export interface LayerStepSceneProps {
  session: EditorSession;
  /**
   * The layer's actions and the session's preview of a move. Passed in: the canvas is its own
   * React tree, which the stores' context does not reach.
   */
  actions: LayerActions;
  previewMove(index: number, to: Point): { position: Point; valid: boolean } | null;
  /** Told when the pointer is over a carton and when one is being dragged: for the cursor. */
  onPointerState(state: 'idle' | 'over' | 'dragging'): void;
}

/**
 * The Pallet layer step (spec 6.2b): the pallet, the outline of the usable footprint and the
 * one layer, whose cartons are selected with a click or tap and moved by dragging. A drag runs
 * on a horizontal plane at the height the carton was grabbed, keeps the grab offset, and shows
 * the carton where the session says it would land (snapped when snapping is on); only the drop
 * changes the session, so one drag is one step of undo. While the pointer moves only the
 * dragged carton is redrawn (`DraggedCarton`): the rest of the layer, and the session's layout
 * and rating, are worked out again when the carton is dropped. A drag let go outside the view
 * is given up.
 */
export function LayerStepScene({
  session,
  actions,
  previewMove,
  onPointerState,
}: LayerStepSceneProps) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const fixed = sceneTheme(useResolvedTheme()).fixed;
  const { cartons, base, usable, inputs, selected } = session;
  const height = session.carton.outer[verticalAxis(session.design)];

  // The index of the carton being dragged. It changes when a drag starts and when it ends,
  // never while the pointer moves: a frame of a drag redraws one carton, outside React.
  const [dragging, setDragging] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef<DraggedHandle>(null);
  const lastShown = useCallback(() => drag.current?.shown ?? null, []);
  const raycaster = useMemo(() => new Raycaster(), []);

  const boxes = useMemo(() => layerBoxes(cartons, base, height), [cartons, base, height]);
  const outside = useMemo(() => overhanging(cartons, base, usable), [cartons, base, usable]);

  const colors = useMemo((): CartonColors => {
    const plain = new Color(fixed.carton);
    const turned = new Color(fixed.cartonTurned);
    const error = new Color(fixed.cartonError);
    return {
      plain,
      turned,
      error,
      // Outside the footprint: the carton's own colour, reddened, so a turned one still shows.
      plainOutside: plain.clone().lerp(error, 0.6),
      turnedOutside: turned.clone().lerp(error, 0.6),
    };
  }, [fixed]);
  const colorOf = useCallback(
    (k: number) => {
      const turned = cartons[k]?.rotated ?? false;
      if (outside[k]) return turned ? colors.turnedOutside : colors.plainOutside;
      return turned ? colors.turned : colors.plain;
    },
    [colors, cartons, outside],
  );

  // The lines of every carton but the one being dragged, which draws its own.
  const still = useMemo(() => {
    const keep = (_: unknown, k: number) => k !== dragging;
    const b = dragging === null ? boxes : boxes.filter(keep);
    const c = dragging === null ? cartons : cartons.filter(keep);
    return {
      edges: boxEdgePositions(b, inputs),
      seams: seamPositions(b, c, base, usable),
      outsideEdges: boxes.flatMap((box, k) =>
        outside[k] && k !== dragging ? boundsEdges(toSceneBounds(box, inputs)) : [],
      ),
    };
  }, [boxes, cartons, dragging, outside, inputs, base, usable]);
  const selectedBox = selected === null || selected === dragging ? undefined : boxes[selected];
  const selectedBounds = useMemo(
    () => (selectedBox ? toSceneBounds(selectedBox, inputs) : null),
    [selectedBox, inputs],
  );
  const draggedCarton = dragging === null ? undefined : cartons[dragging];
  const draggedBox = dragging === null ? undefined : boxes[dragging];

  useEffect(() => {
    invalidate();
  }, [invalidate, boxes, colorOf, dragging]);

  /** Whether a point of the screen is inside the 3D view. */
  const inView = useCallback(
    (clientX: number, clientY: number) => {
      const rect = get().gl.domElement.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    [get],
  );

  /** Where the carton's minimum corner is for a pointer at (clientX, clientY), or null. */
  const cornerAt = useCallback(
    (d: Drag, clientX: number, clientY: number): Point | null => {
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const ndc = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(d.plane, new Vector3());
      // Above the horizon the pointer is over no point of the plane: the carton stays put.
      if (!hit) return null;
      const at = sceneToFootprint(hit.x, hit.z, usable);
      return { x: at.x - d.grab.x, y: at.y - d.grab.y };
    },
    [get, raycaster, usable],
  );

  const press = (index: number, e: ThreeEvent<PointerEvent>) => {
    const native = e.nativeEvent;
    // Only the main mouse button drags; a second finger while dragging is ignored.
    if (native.pointerType === 'mouse' && native.button !== 0) return;
    e.stopPropagation();
    if (drag.current) return;
    const carton = cartons[index];
    if (!carton) return;
    actions.select(index);

    const state = get();
    const element = (state.events.connected ?? state.gl.domElement) as HTMLElement;
    const controls = state.controls as unknown as { enabled: boolean } | null;
    // Before the orbit controls see this press (their listener was added after the scene's):
    // dragging a carton never orbits the camera.
    if (controls) controls.enabled = false;
    try {
      element.setPointerCapture(native.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; the drag then ends with it.
    }
    const at = sceneToFootprint(e.point.x, e.point.z, usable);

    const finish = (commit: { x: number; y: number } | null) => {
      const d = drag.current;
      if (!d) return;
      d.end();
      if (!commit || !d.moved) return;
      // Let go outside the view: the drag is given up. (The point under a pointer out there
      // can be far off the pallet, or nowhere.)
      if (!inView(commit.x, commit.y)) {
        actions.dropOutside();
        return;
      }
      const to = cornerAt(d, commit.x, commit.y);
      if (to) actions.drop(d.index, to);
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_START_PX) return;
        d.moved = true;
        setDragging(d.index);
        onPointerState('dragging');
      }
      d.pending = { x: ev.clientX, y: ev.clientY };
      // One update a frame, however fast the pointer events come.
      if (d.frame === 0)
        d.frame = requestAnimationFrame(() => {
          d.frame = 0;
          if (drag.current !== d || !d.pending) return;
          const { x, y } = d.pending;
          const to = cornerAt(d, x, y);
          d.pending = null;
          const preview = to && previewMove(d.index, to);
          if (!preview) return;
          // Outside the view it could not be dropped: shown as a place it may not go.
          d.shown = { position: preview.position, valid: preview.valid && inView(x, y) };
          // Only the dragged carton is redrawn: no React render, no new geometry.
          dragged.current?.show(d.shown);
        });
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === drag.current?.pointerId) finish({ x: ev.clientX, y: ev.clientY });
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === drag.current?.pointerId) finish(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      // Escape gives the drag up; nothing else should also act on it.
      ev.preventDefault();
      ev.stopPropagation();
      finish(null);
    };

    drag.current = {
      index,
      pointerId: native.pointerId,
      element,
      startX: native.clientX,
      startY: native.clientY,
      plane: new Plane(new Vector3(0, 1, 0), -e.point.y),
      grab: { x: at.x - carton.x, y: at.y - carton.y },
      moved: false,
      pending: null,
      shown: null,
      frame: 0,
      end() {
        drag.current = null;
        if (this.frame !== 0) cancelAnimationFrame(this.frame);
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerup', onUp);
        element.removeEventListener('pointercancel', onCancel);
        element.removeEventListener('lostpointercapture', onCancel);
        window.removeEventListener('keydown', onKey, true);
        try {
          element.releasePointerCapture(this.pointerId);
        } catch {
          // Already released.
        }
        if (controls) controls.enabled = true;
        setDragging(null);
        onPointerState('idle');
      },
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onCancel);
    element.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('keydown', onKey, true);
  };

  // A layer changed from elsewhere (undo by key, a new carton) ends a drag of the old layer;
  // so does leaving the step.
  useEffect(() => () => drag.current?.end(), [cartons]);

  return (
    <>
      <Pallet
        length={inputs.pallet.length}
        width={inputs.pallet.width}
        onPick={() => actions.select(null)}
      />
      <FootprintOutline session={session} color={fixed.footprintOutline} />
      <InstancedBoxes
        boxes={boxes}
        inputs={inputs}
        colorOf={colorOf}
        opacity={1}
        wireframe={false}
        // A click on a carton is its own: it must not reach the pallet under it.
        onPick={NOTHING}
        hidden={dragging}
        onPress={press}
        onHover={(over) => {
          if (!drag.current?.moved) onPointerState(over ? 'over' : 'idle');
        }}
      />
      <Segments positions={still.edges} color={EDGE_COLOR} />
      <Segments positions={still.seams} color={EDGE_COLOR} />
      {still.outsideEdges.length > 0 && (
        <Line
          points={still.outsideEdges}
          segments
          color={fixed.cartonError}
          lineWidth={2.5}
          renderOrder={5}
        />
      )}
      {dragging !== null && draggedCarton && draggedBox && (
        <DraggedCarton
          ref={dragged}
          key={dragging}
          carton={draggedCarton}
          box={draggedBox}
          base={base}
          usable={usable}
          inputs={inputs}
          colors={colors}
          errorColor={fixed.cartonError}
          selected={selected === dragging}
          first={lastShown}
        />
      )}
      {selectedBounds && <SelectionOutline bounds={selectedBounds} />}
    </>
  );
}
