import { Html } from '@react-three/drei';
import type { Inputs, Layout } from '../domain/types';
import { cartonDisplayDims } from '../engine/analytics/analytics';
import type { PlacedCarton } from '../engine/packing/positions';
import { formatDims } from '../engine/units/units';
import { toSceneBounds } from './transforms';

const CHIP = 'whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-xs text-gray-800 shadow';

interface Props {
  layout: Layout;
  inputs: Inputs;
  first: PlacedCarton;
}

/** Carton and product sizes, shown above the first carton. */
export function Labels({ layout, inputs, first }: Props) {
  const { min, max } = toSceneBounds(first, inputs);
  const position: [number, number, number] = [(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2];
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex -translate-y-4 gap-1">
        <span className={CHIP}>Carton {formatDims(cartonDisplayDims(layout, 'outer'))} in</span>
        <span className={CHIP}>Product {formatDims(inputs.product)} in</span>
      </div>
    </Html>
  );
}
