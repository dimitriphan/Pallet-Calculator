import type { Stability, StabilityRating } from '../domain/types';

/** The rating as a word: "Good", "Fair", "Poor". */
export const RATING_WORD: Record<StabilityRating, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

/**
 * The success, caution and error badge styles. In Harbor a Poor badge is coral text on the
 * panel with a coral edge: coral never fills a badge.
 */
const RATING_STYLE: Record<StabilityRating, string> = {
  good: 'bg-green-100 text-green-800 dark:bg-harbor-green dark:text-harbor-deep',
  fair: 'bg-amber-100 text-amber-900 dark:bg-harbor-sand dark:text-harbor-deep',
  poor: 'bg-red-100 text-red-800 dark:border dark:border-harbor-coral dark:bg-harbor-panel dark:text-harbor-coral-text',
};

/**
 * "Stability: Good / Fair / Poor" for a rated layout; nothing for a layout stored before
 * layouts were rated. `short` drops "Stability: " where a column title already says it.
 * `className` sets the size where it is used.
 */
export function StabilityBadge({
  stability,
  short = false,
  className = 'px-1.5 text-[11px] leading-4',
}: {
  stability: Stability | null | undefined;
  short?: boolean;
  className?: string;
}) {
  if (!stability) return null;
  const word = RATING_WORD[stability.rating];
  return (
    <span className={`whitespace-nowrap ${RATING_STYLE[stability.rating]} ${className}`}>
      {short ? word : `Stability: ${word}`}
    </span>
  );
}
