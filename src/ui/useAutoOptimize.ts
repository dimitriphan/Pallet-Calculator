import { useEffect, useRef } from 'react';
import { useInputs, useStores } from './StoreContext';

export const AUTO_OPTIMIZE_DELAY_MS = 300;

/**
 * Recalculates whenever the inputs parse, 300 ms after the last edit (immediately on first
 * load), and marks the shown result stale while they do not. The results store skips a run
 * whose inputs equal the result it already holds.
 */
export function useAutoOptimize(): void {
  const { results } = useStores();
  const parsed = useInputs((s) => s.parsed);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!parsed.ok) {
      results.getState().markStale();
      return;
    }
    const timer = setTimeout(
      () => {
        firstRun.current = false;
        void results.getState().request(parsed.inputs);
      },
      firstRun.current ? 0 : AUTO_OPTIMIZE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [parsed, results]);
}
