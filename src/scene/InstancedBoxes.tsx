import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type { Color, InstancedMesh } from 'three';
import type { Inputs } from '../domain/types';
import type { PlacedBox } from '../engine/packing/positions';
import { claimClick } from './pointer';
import { instanceMatrices } from './transforms';

/** Inches taken off every instance so touching faces do not z-fight. */
const SHRINK = 0.02;

interface Props {
  boxes: PlacedBox[];
  inputs: Inputs;
  /** Colour of instance k. */
  colorOf: (k: number) => Color;
  opacity: number;
  wireframe: boolean;
  /** Called with the clicked instance; omit to make the boxes ignore the pointer. */
  onPick?: (instanceId: number) => void;
  /** Called when a pointer goes down on an instance (the start of a drag in the editor). */
  onPress?: (instanceId: number, e: ThreeEvent<PointerEvent>) => void;
  /** Called as the pointer comes over the boxes and leaves them. */
  onHover?: (over: boolean) => void;
  /** An instance not to draw (it is drawn elsewhere, e.g. while it is dragged). */
  hidden?: number | null;
}

function Boxes({
  boxes,
  inputs,
  colorOf,
  opacity,
  wireframe,
  onPick,
  onPress,
  onHover,
  hidden = null,
}: Props) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrices = instanceMatrices(boxes, inputs, SHRINK);
    // Shrunk to nothing where it stands (not a zero matrix, which cannot be inverted).
    if (hidden !== null && hidden >= 0 && hidden < boxes.length)
      for (const k of [0, 5, 10]) matrices[hidden * 16 + k] = 1e-6;
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < boxes.length; k++) mesh.setColorAt(k, colorOf(k));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, inputs, colorOf, hidden, invalidate]);

  const onClick = onPick
    ? (e: ThreeEvent<MouseEvent>) => {
        if (claimClick(e) && e.instanceId !== undefined) onPick(e.instanceId);
      }
    : undefined;

  const translucent = opacity < 1;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      onClick={onClick}
      onPointerDown={
        onPress
          ? (e) => {
              if (e.instanceId !== undefined) onPress(e.instanceId, e);
            }
          : undefined
      }
      onPointerOver={onHover ? () => onHover(true) : undefined}
      onPointerOut={onHover ? () => onHover(false) : undefined}
    >
      <boxGeometry />
      <meshStandardMaterial
        // Recreated when switching translucency so three compiles the right program.
        key={translucent ? 'translucent' : 'opaque'}
        color="#ffffff"
        roughness={0.85}
        transparent={translucent}
        opacity={opacity}
        depthWrite={!translucent}
        wireframe={wireframe}
      />
    </instancedMesh>
  );
}

/** One InstancedMesh of boxes, reallocated whenever the number of boxes changes. */
export function InstancedBoxes(props: Props) {
  if (props.boxes.length === 0) return null;
  return <Boxes key={props.boxes.length} {...props} />;
}
