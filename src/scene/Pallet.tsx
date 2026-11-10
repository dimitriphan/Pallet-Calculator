import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { claimClick } from './pointer';
import { palletParts } from './sceneGeometry';

const WOOD = '#b08a5a';

interface Props {
  length: number;
  width: number;
  onPick: () => void;
}

/** The 5-inch wooden pallet, centred on the origin with its real (not overhang) footprint. */
export function Pallet({ length, width, onPick }: Props) {
  const parts = useMemo(() => palletParts(length, width), [length, width]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (claimClick(e)) onPick();
  };
  return (
    <group onClick={onClick}>
      {parts.map((p, k) => (
        <mesh key={k} position={p.position}>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
