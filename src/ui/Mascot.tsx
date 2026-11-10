import concernedUrl from '../assets/mascot/concerned.png';
import headerUrl from '../assets/mascot/header-mark.png';
import idleUrl from '../assets/mascot/idle.png';
import working1Url from '../assets/mascot/working-1.png';
import working2Url from '../assets/mascot/working-2.png';
import working3Url from '../assets/mascot/working-3.png';

export type MascotPose = 'header' | 'idle' | 'working' | 'concerned';

const STILL = { header: headerUrl, idle: idleUrl, concerned: concernedUrl } as const;
const WORKING = [working1Url, working2Url, working3Url] as const;

interface Props {
  pose: MascotPose;
  /** Rendered height in px: a multiple of 32, except 'header' which is 24 or 32. */
  size: number;
}

/**
 * The small, silent pixel-art mascot. Purely decorative: no name, hidden from assistive tech,
 * with fixed dimensions so it never shifts the layout. The working pose stacks its three frames
 * and cycles them by CSS (see `.mascot-frame` in index.css); with reduced motion only frame 2 shows.
 */
export function Mascot({ pose, size }: Props) {
  const img = (src: string, className: string, key?: number) => (
    <img
      key={key}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      data-mascot={pose}
      style={{ imageRendering: 'pixelated' }}
      className={className}
    />
  );

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
