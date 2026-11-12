import type { Dims, OrientationCode } from '../../domain/types';
import { facedSize, topFace } from './facing';

const W = 60;
const H = 52;
const PAD = 3;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
/** No side is drawn thinner than this share of the longest, so a flat box still reads as one. */
const THINNEST = 0.16;

type P3 = [number, number, number];

/**
 * A small picture of the box as it lies in the carton for a facing: the carton's length runs
 * down to the right, its width down to the left and its height up. The box's own top (the face
 * across its height) is shaded, so which way up it stands is plain. Decorative: the button it
 * sits in carries the name.
 */
export function FacingPicture({ facing, product }: { facing: OrientationCode; product: Dims }) {
  const raw = facedSize(facing, product);
  const longest = Math.max(...raw, 1e-9);
  const [x, y, z] = raw.map((v) => Math.max(v / longest, THINNEST)) as P3;
  const project = ([px, py, pz]: P3): [number, number] => [(px - py) * COS, (px + py) * SIN - pz];
  const faces: Record<'x' | 'y' | 'z', P3[]> = {
    z: [
      [0, 0, z],
      [x, 0, z],
      [x, y, z],
      [0, y, z],
    ],
    x: [
      [x, 0, 0],
      [x, y, 0],
      [x, y, z],
      [x, 0, z],
    ],
    y: [
      [0, y, 0],
      [x, y, 0],
      [x, y, z],
      [0, y, z],
    ],
  };
  const all = Object.values(faces).flat().map(project);
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (H - (maxY - minY) * scale) / 2 - minY * scale;
  const points = (face: P3[]) =>
    face
      .map(project)
      .map(([px, py]) => `${round(px * scale + offX)},${round(py * scale + offY)}`)
      .join(' ');
  const top = topFace(facing);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {(['z', 'x', 'y'] as const).map((face) => (
        <polygon
          key={face}
          data-face={face}
          data-top={face === top ? 'true' : undefined}
          points={points(faces[face])}
          fill="currentColor"
          fillOpacity={face === top ? 0.55 : 0.08}
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** Two decimals are plenty for a picture this small, and keep the markup short. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
