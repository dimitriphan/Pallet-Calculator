import { useMemo } from 'react';
import type { Inputs, RankedLayout } from '../domain/types';
import { computeAnalytics, type Analytics } from '../engine/analytics/analytics';
import { selectSelected } from '../store/resultsStore';
import { useResults } from './StoreContext';

export interface SelectedLayout {
  ranked: RankedLayout;
  /** The inputs the result was computed from (not the current draft). */
  inputs: Inputs;
  analytics: Analytics;
}

/** The selected layout with its analytics, or null when there is no result to show. */
export function useSelectedAnalytics(): SelectedLayout | null {
  const ranked = useResults(selectSelected);
  const inputs = useResults((s) => s.inputs);
  return useMemo(
    () =>
      ranked && inputs
        ? { ranked, inputs, analytics: computeAnalytics(ranked.layout, inputs) }
        : null,
    [ranked, inputs],
  );
}
