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
}

function Boxes({ boxes, inputs, colorOf, opacity, wireframe, onPick }: Props) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(instanceMatrices(boxes, inputs, SHRINK));
    mesh.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < boxes.length; k++) mesh.setColorAt(k, colorOf(k));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, inputs, colorOf, invalidate]);

  const onClick = onPick
    ? (e: ThreeEvent<MouseEvent>) => {
        if (claimClick(e) && e.instanceId !== undefined) onPick(e.instanceId);
      }
    : undefined;

  const translucent = opacity < 1;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} onClick={onClick}>
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
