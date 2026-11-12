import { useMemo } from 'react';
import type { Inputs, Layout } from '../domain/types';
import { cartonPlacements, type PlacedCarton } from '../engine/packing/positions';
import { useSelectedLayout } from '../ui/useSelectedLayout';
import { loadBounds, measuredBounds, type SceneBounds } from './transforms';

export interface SceneData {
  layout: Layout | null;
  /**
   * The inputs the shown layout was built from, never the live draft: a calculated layout's
   * calculation, or the inputs a manual layout was last checked with.
   */
  inputs: Inputs | null;
  cartons: PlacedCarton[];
  /** The load with its pallet: camera framing and captures. */
  bounds: SceneBounds;
  /** What the measurement lines measure: the cartons, from the floor up. */
  measured: SceneBounds;
}

/**
 * The selected layout, calculated or manual, and the inputs it was built from, with derived
 * placements.
 */
export function useSceneData(): SceneData {
  const selected = useSelectedLayout();
  const layout = selected?.ranked.layout ?? null;
  const inputs = selected?.inputs ?? null;
  const cartons = useMemo(
    () => (layout && inputs ? cartonPlacements(layout, inputs) : []),
    [layout, inputs],
  );
  const bounds = useMemo(() => loadBounds(layout, inputs), [layout, inputs]);
  const measured = useMemo(() => measuredBounds(layout, inputs), [layout, inputs]);
  return { layout, inputs, cartons, bounds, measured };
}
