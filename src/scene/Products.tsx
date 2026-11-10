import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { Inputs, Layout } from '../domain/types';
import { allProductPlacements } from '../engine/packing/positions';
import { InstancedBoxes } from './InstancedBoxes';
import { boxEdgePositions } from './transforms';

const PRODUCT_COLOR = new Color('#2f6f8f');
const EDGE_COLOR = '#173d50';
const colorOf = () => PRODUCT_COLOR;

interface Props {
  layout: Layout;
  inputs: Inputs;
  wireframe: boolean;
  onPick: (cartonIndex: number, productIndex: number) => void;
}

/**
 * Every product box as one InstancedMesh, carton by carton in carton index order, with one
 * edge outline so neighbouring products read as separate boxes.
 */
export function Products({ layout, inputs, wireframe, onPick }: Props) {
  const products = useMemo(() => allProductPlacements(layout, inputs), [layout, inputs]);
  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(boxEdgePositions(products, inputs), 3));
    return g;
  }, [products, inputs]);
  useEffect(() => () => edges.dispose(), [edges]);

  const perCarton = layout.carton.boxesPerCarton;
  return (
    <>
      <InstancedBoxes
        boxes={products}
        inputs={inputs}
        colorOf={colorOf}
        opacity={1}
        wireframe={wireframe}
        onPick={(id) => onPick(Math.floor(id / perCarton), id % perCarton)}
      />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={EDGE_COLOR} />
      </lineSegments>
    </>
  );
}
