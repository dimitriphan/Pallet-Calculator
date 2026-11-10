/**
 * True when the canvas aspect ratio (width / height) moved by more than `tolerance`
 * (a fraction of the previous value). False if either aspect is not finite and positive.
 */
export function aspectChanged(previous: number, next: number, tolerance = 0.1): boolean {
  const ok = (n: number) => Number.isFinite(n) && n > 0;
  if (!ok(previous) || !ok(next)) return false;
  return Math.abs(next / previous - 1) > tolerance;
}
