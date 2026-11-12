import { useMemo } from 'react';
import { computeAnalytics, type Analytics } from '../engine/analytics/analytics';
import type { SelectedLayout as Selected } from '../store/selection';
import { useSelectedLayout } from './useSelectedLayout';

/**
 * The selected layout (calculated or manual; `ranked.manual` marks a manual one, whose rank
 * and score are not to be shown), the inputs it was built from (not the current draft) and its
 * analytics.
 */
export interface SelectedLayout extends Selected {
  analytics: Analytics;
}

/** The selected layout with its analytics, or null when there is no result to show. */
export function useSelectedAnalytics(): SelectedLayout | null {
  const selected = useSelectedLayout();
  return useMemo(
    () =>
      selected
        ? { ...selected, analytics: computeAnalytics(selected.ranked.layout, selected.inputs) }
        : null,
    [selected],
  );
}
