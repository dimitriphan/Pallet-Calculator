import type { CSSProperties } from 'react';
import concernedUrl from '../assets/mascot/concerned.png';
import headerUrl from '../assets/mascot/header-mark.png';
import idleUrl from '../assets/mascot/idle.png';
import working1Url from '../assets/mascot/working-1.png';
import working2Url from '../assets/mascot/working-2.png';
import working3Url from '../assets/mascot/working-3.png';

export type MascotPose = 'header' | 'idle' | 'working' | 'concerned';

const STILL = { header: headerUrl, idle: idleUrl, concerned: concernedUrl } as const;
const WORKING = [working1Url, working2Url, working3Url] as const;

/**
 * The header mark is the 32 x 32 art shown at exactly 2x, cropped to the head ring, stem and
 * leaves. These are that drawing's bounding box in the 32 x 32 sprite (x, y, width, height),
 * taken from `POSES.headerMark` in tools/mascot/poses.mjs; Mascot.test.tsx checks they still match.
 */
export const HEADER_MARK_BOX = { x: 10, y: 9, width: 12, height: 13 } as const;
const HEADER_SCALE = 2;
const CELL = 32;

/** Rendered heights of the full-cell poses: whole-number scales (1x to 4x) of the 32 px art. */
export type MascotSize = 32 | 64 | 96 | 128;

type Props = { pose: 'header' } | { pose: Exclude<MascotPose, 'header'>; size: MascotSize };

/**
 * The small, silent pixel-art mascot. Purely decorative: no name, hidden from assistive tech,
 * with fixed dimensions so it never shifts the layout. The sized poses take a height that is a
 * multiple of 32 (whole-number pixel scale). The working pose stacks its three frames and cycles
 * them by CSS (see `.mascot-frame` in index.css); with reduced motion only frame 2 shows.
 */
export function Mascot(props: Props) {
  const { pose } = props;
  if (props.pose !== 'header' && !(props.size > 0 && Number.isInteger(props.size / CELL)))
    throw new Error(`Mascot size must be a positive multiple of ${CELL}, got ${props.size}`);
  const size = props.pose === 'header' ? CELL * HEADER_SCALE : props.size;
  const img = (src: string, className: string, key?: number, style?: CSSProperties) => (
    <img
      key={key}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      data-mascot={pose}
      style={{ imageRendering: 'pixelated', ...style }}
      className={className}
    />
  );

  if (pose === 'header') {
    const { x, y, width, height } = HEADER_MARK_BOX;
    return (
      <span
        aria-hidden="true"
        data-mascot-box="header"
        className="relative inline-block shrink-0 select-none overflow-hidden"
        style={{ width: width * HEADER_SCALE, height: height * HEADER_SCALE }}
      >
        {img(STILL.header, 'absolute max-w-none', undefined, {
          left: -x * HEADER_SCALE,
          top: -y * HEADER_SCALE,
        })}
      </span>
    );
  }

  if (pose !== 'working') return img(STILL[pose], 'shrink-0 select-none');

  return (
    <span
      aria-hidden="true"
      data-mascot-box="working"
      className="relative inline-block shrink-0 select-none"
      style={{ width: size, height: size }}
    >
      {WORKING.map((src, i) =>
        img(src, `mascot-frame mascot-frame-${i + 1} absolute left-0 top-0`, i),
      )}
    </span>
  );
}
