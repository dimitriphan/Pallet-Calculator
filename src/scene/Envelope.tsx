import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Inputs } from '../domain/types';
import { usableFootprint, usableHeight } from '../engine/packing/geometry';
import { boxEdgePositions, toScenePosition, toSceneScale } from './transforms';

const BLUE = '#3b82f6';

/** The usable footprint x usable height on the pallet top: where cartons may go. Not clickable. */
export function Envelope({ inputs }: { inputs: Inputs }) {
  const box = useMemo(() => {
    const f = usableFootprint(inputs);
    return { x: 0, y: 0, z: 0, dx: f.x, dy: f.y, dz: usableHeight(inputs) };
  }, [inputs]);
  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(boxEdgePositions([box], inputs), 3));
    return g;
  }, [box, inputs]);
  useEffect(() => () => edges.dispose(), [edges]);

  return (
    <>
      <mesh position={toScenePosition(box, inputs)}>
        <boxGeometry args={toSceneScale(box)} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={BLUE} />
      </lineSegments>
    </>
  );
}
