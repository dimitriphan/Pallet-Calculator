import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { Inputs } from '../domain/types';
import type { PlacedCarton } from '../engine/packing/positions';
import { InstancedBoxes } from './InstancedBoxes';
import { boxEdgePositions } from './transforms';

const LAYER_SHADES = [new Color('#d9a066'), new Color('#c68642')] as const;
const EDGE_COLOR = '#6b4423';

interface Props {
  cartons: PlacedCarton[];
  inputs: Inputs;
  /** Products are drawn inside: cartons turn see-through and stop taking clicks. */
  productsShown: boolean;
  wireframe: boolean;
  onPick: (cartonIndex: number) => void;
}

/** Every carton as one InstancedMesh, layers in alternating shades, with one edge outline. */
export function Cartons({ cartons, inputs, productsShown, wireframe, onPick }: Props) {
  const colorOf = useMemo(
    () => (k: number) => LAYER_SHADES[(cartons[k]?.layerIndex ?? 0) % 2]!,
    [cartons],
  );
  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(boxEdgePositions(cartons, inputs), 3));
    return g;
  }, [cartons, inputs]);
  useEffect(() => () => edges.dispose(), [edges]);

  return (
    <>
      <InstancedBoxes
        boxes={cartons}
        inputs={inputs}
        colorOf={colorOf}
        opacity={productsShown ? 0.25 : 1}
        wireframe={wireframe}
        onPick={productsShown ? undefined : onPick}
      />
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={EDGE_COLOR}
          transparent={productsShown}
          opacity={productsShown ? 0.5 : 1}
        />
      </lineSegments>
    </>
  );
}
