import { Html, Line } from '@react-three/drei';
import { useMemo, type CSSProperties } from 'react';
import { CAPTURE_COLOR, HIDE_IN_ORTHO_CAPTURE } from './captureVisibility';
import { dimensionLines } from './sceneGeometry';
import { LIGHT_MEASURE_LINE } from './sceneTheme';
import type { SceneBounds } from './transforms';

interface Props {
  bounds: SceneBounds;
  clear: SceneBounds;
  /** Colour of the dimension lines; PNG captures always draw them in the light colour. */
  line: string;
  /** Colours of the number chips; omitted, they keep the dark chip of the light theme. */
  chip?: CSSProperties;
}

/**
 * Length and width of the load (the cartons) and its height from the floor, drawn clear of
 * `clear` (the load with its pallet).
 */
export function Measurements({ bounds, clear, line, chip }: Props) {
  const d = useMemo(() => dimensionLines(bounds, { clearOf: clear }), [bounds, clear]);
  return (
    <group userData={{ [HIDE_IN_ORTHO_CAPTURE]: true }}>
      <Line
        points={d.segments}
        segments
        color={line}
        lineWidth={1.5}
        userData={{ [CAPTURE_COLOR]: LIGHT_MEASURE_LINE }}
      />
      {d.labels.map((l) => (
        <Html
          key={l.text + l.position.join()}
          position={l.position}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span
            className="whitespace-nowrap rounded bg-gray-900/80 px-1.5 py-0.5 text-xs font-medium text-white"
            style={chip}
          >
            {l.text}
          </span>
        </Html>
      ))}
    </group>
  );
}
