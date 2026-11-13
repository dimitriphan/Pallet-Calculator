import { Line } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, Color, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { verticalAxis } from '../engine/manual/carton';
import type { Point } from '../engine/manual/layer';
import type { EditorSession } from '../store/manualEditorStore';
import type { LayerActions } from '../ui/editor/layerActions';
import { useResolvedTheme } from '../ui/useTheme';
import {
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
import { boundsEdges, boxEdgePositions, toSceneBounds } from './transforms';

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
interface DragView {
  index: number;
  position: Point;
  valid: boolean;
}

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
 * changes the session, so one drag is one step of undo.
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

  const [view, setView] = useState<DragView | null>(null);
  const drag = useRef<Drag | null>(null);
  const raycaster = useMemo(() => new Raycaster(), []);

  // The carton being dragged is drawn where it would land, a little above the others.
  const shown = useMemo(
    () => cartons.map((c, k) => (view && view.index === k ? { ...c, ...view.position } : c)),
    [cartons, view],
  );
  const lifted = view?.index ?? null;
  const boxes = useMemo(
    () => layerBoxes(shown, base, height, lifted),
    [shown, base, height, lifted],
  );
  const outside = useMemo(() => overhanging(shown, base, usable), [shown, base, usable]);
  const invalid = view && !view.valid ? view.index : null;

  const colors = useMemo(() => {
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
      if (k === invalid) return colors.error;
      const turned = shown[k]?.rotated ?? false;
      if (outside[k]) return turned ? colors.turnedOutside : colors.plainOutside;
      return turned ? colors.turned : colors.plain;
    },
    [colors, shown, outside, invalid],
  );

  const edges = useMemo(() => boxEdgePositions(boxes, inputs), [boxes, inputs]);
  const seams = useMemo(
    () => seamPositions(boxes, shown, base, usable),
    [boxes, shown, base, usable],
  );
  const outsideEdges = useMemo(
    () =>
      boxes.flatMap((b, k) =>
        outside[k] || k === invalid ? boundsEdges(toSceneBounds(b, inputs)) : [],
      ),
    [boxes, outside, invalid, inputs],
  );
  const selectedBox = selected === null ? undefined : boxes[selected];
  const selectedBounds = useMemo(
    () => (selectedBox ? toSceneBounds(selectedBox, inputs) : null),
    [selectedBox, inputs],
  );

  useEffect(() => {
    invalidate();
  }, [invalidate, boxes, colorOf]);

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
      if (commit && d.moved) {
        const to = cornerAt(d, commit.x, commit.y);
        if (to) actions.drop(d.index, to);
      }
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_START_PX) return;
        d.moved = true;
        onPointerState('dragging');
      }
      d.pending = { x: ev.clientX, y: ev.clientY };
      // One update a frame, however fast the pointer events come.
      if (d.frame === 0)
        d.frame = requestAnimationFrame(() => {
          d.frame = 0;
          if (drag.current !== d || !d.pending) return;
          const to = cornerAt(d, d.pending.x, d.pending.y);
          d.pending = null;
          const preview = to && previewMove(d.index, to);
          if (preview) setView({ index: d.index, ...preview });
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
        setView(null);
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
        onPress={press}
        onHover={(over) => {
          if (!drag.current?.moved) onPointerState(over ? 'over' : 'idle');
        }}
      />
      <Segments positions={edges} color={EDGE_COLOR} />
      <Segments positions={seams} color={EDGE_COLOR} />
      {outsideEdges.length > 0 && (
        <Line
          points={outsideEdges}
          segments
          color={fixed.cartonError}
          lineWidth={2.5}
          renderOrder={5}
        />
      )}
      {selectedBounds && <SelectionOutline bounds={selectedBounds} />}
    </>
  );
}
