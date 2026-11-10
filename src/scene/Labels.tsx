import { Html } from '@react-three/drei';
import type { Inputs, Layout } from '../domain/types';
import { cartonDisplayDims } from '../engine/analytics/analytics';
import type { PlacedCarton } from '../engine/packing/positions';
import { formatDims } from '../engine/units/units';
import type { SceneTheme } from './sceneTheme';
import { toSceneBounds } from './transforms';

const CHIP = 'whitespace-nowrap px-1.5 py-0.5 text-xs';

interface Props {
  layout: Layout;
  inputs: Inputs;
  first: PlacedCarton;
  theme: SceneTheme;
}

/** Carton and product sizes, shown above the first carton. */
export function Labels({ layout, inputs, first, theme }: Props) {
  const { min, max } = toSceneBounds(first, inputs);
  const chip = { backgroundColor: theme.chipBg, color: theme.chipText };
  const position: [number, number, number] = [(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2];
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex -translate-y-4 gap-1">
        <span className={CHIP} style={chip}>
          Carton {formatDims(cartonDisplayDims(layout, 'outer'))} in
        </span>
        <span className={CHIP} style={chip}>
          Product {formatDims(inputs.product)} in
        </span>
      </div>
    </Html>
  );
}
