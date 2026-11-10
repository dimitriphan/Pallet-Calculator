import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { HIDE_IN_ORTHO_CAPTURE } from './captureVisibility';
import { dimensionLines } from './sceneGeometry';
import type { SceneBounds } from './transforms';

const INK = '#111827';

/**
 * Length and width of the load (the cartons) and its height from the floor, drawn clear of
 * `clear` (the load with its pallet).
 */
export function Measurements({ bounds, clear }: { bounds: SceneBounds; clear: SceneBounds }) {
  const d = useMemo(() => dimensionLines(bounds, { clearOf: clear }), [bounds, clear]);
  return (
    <group userData={{ [HIDE_IN_ORTHO_CAPTURE]: true }}>
      <Line points={d.segments} segments color={INK} lineWidth={1.5} />
      {d.labels.map((l) => (
        <Html
          key={l.text + l.position.join()}
          position={l.position}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className="whitespace-nowrap rounded bg-gray-900/80 px-1.5 py-0.5 text-xs font-medium text-white">
            {l.text}
          </span>
        </Html>
      ))}
    </group>
  );
}
