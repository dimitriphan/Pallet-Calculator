import type { RankedLayout, StabilityRating } from '../../domain/types';
import { ratingOrder } from './score';

const RATING_WORD: Record<StabilityRating, string> = { good: 'Good', fair: 'Fair', poor: 'Poor' };

/** Score differences at or below this count as the same score (matches compareRanked). */
const SCORE_TIE = 1e-9;

/** One sentence saying why `current` ranks above `next` (null when it is the last shown). */
export function explainRanking(
  current: RankedLayout,
  next: RankedLayout | null,
  total: number,
): string {
  const a = `Layout #${current.rank}`;
  if (next === null) {
    return total === 1
      ? `${a} is the only distinct layout found.`
      : `${a} is the lowest-ranked of the ${total} layouts shown.`;
  }
  const head = `${a} ranked above Layout #${next.rank} because it`;
  const extra = current.layout.totalProducts - next.layout.totalProducts;
  if (extra > 0) {
    const u = current.score.utilization - next.score.utilization;
    const tail =
      u >= 1
        ? 'with higher utilization.'
        : u <= -1
          ? 'despite lower utilization.'
          : 'while maintaining similar utilization.';
    return `${head} fits ${extra} additional ${extra === 1 ? 'unit' : 'units'} ${tail}`;
  }
  const mine = current.layout.stability;
  const theirs = next.layout.stability;
  if (mine && theirs && ratingOrder(current.layout) < ratingOrder(next.layout)) {
    return `${head} has a better stability rating (${RATING_WORD[mine.rating]} vs ${RATING_WORD[theirs.rating]}) at the same quantity.`;
  }
  if (current.score.total - next.score.total > SCORE_TIE) {
    // Two decimals unless they would print the same number for both.
    const digits = current.score.total.toFixed(2) === next.score.total.toFixed(2) ? 4 : 2;
    const x = current.score.total.toFixed(digits);
    const y = next.score.total.toFixed(digits);
    return `${head} has a higher overall score (${x} vs ${y}) at the same quantity.`;
  }
  if (current.layout.totalCartons < next.layout.totalCartons) {
    return `${head} uses fewer cartons for the same result.`;
  }
  return `${a} and Layout #${next.rank} are equivalent in quantity, score, and carton count; they differ only in carton size or arrangement.`;
}
