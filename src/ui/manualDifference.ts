import { fmtCount } from './format';

/**
 * How a manual layout's boxes compare with the best calculated layout's (spec 6.4): manual
 * layouts are not ranked against calculated ones, but each says this.
 */
export function differenceText(manualProducts: number, bestProducts: number): string {
  const d = manualProducts - bestProducts;
  if (d === 0) return 'Same as the best calculated layout';
  return `${fmtCount(Math.abs(d))} ${d < 0 ? 'fewer' : 'more'} than the best calculated layout`;
}
