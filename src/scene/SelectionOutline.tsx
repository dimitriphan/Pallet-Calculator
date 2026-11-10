import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { HIDE_IN_ORTHO_CAPTURE } from './captureVisibility';
import { boundsEdges, type SceneBounds } from './transforms';

const AMBER = '#f59e0b';
/** Inches the outline stands off the selected object so it is not hidden by its faces. */
const PAD = 0.15;

/** A thick amber box around the selected object. */
export function SelectionOutline({ bounds }: { bounds: SceneBounds }) {
  const points = useMemo(
    () =>
      boundsEdges({
        min: bounds.min.map((v) => v - PAD) as SceneBounds['min'],
        max: bounds.max.map((v) => v + PAD) as SceneBounds['max'],
      }),
    [bounds],
  );
  // Drawn over everything so the selection stays visible behind other cartons.
  return (
    <group userData={{ [HIDE_IN_ORTHO_CAPTURE]: true }}>
      <Line
        points={points}
        segments
        color={AMBER}
        lineWidth={3}
        depthTest={false}
        renderOrder={10}
      />
    </group>
  );
}
