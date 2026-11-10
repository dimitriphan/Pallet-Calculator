import { useMemo } from 'react';
import type { Inputs, Layout } from '../domain/types';
import { cartonPlacements, type PlacedCarton } from '../engine/packing/positions';
import { selectSelected } from '../store/resultsStore';
import { useResults } from '../ui/StoreContext';
import { loadBounds, type SceneBounds } from './transforms';

export interface SceneData {
  layout: Layout | null;
  /** The inputs the shown result was computed from, never the live draft. */
  inputs: Inputs | null;
  cartons: PlacedCarton[];
  bounds: SceneBounds;
}

/** The selected layout and the inputs it was computed from, with derived placements. */
export function useSceneData(): SceneData {
  const ranked = useResults(selectSelected);
  const inputs = useResults((s) => s.inputs);
  const layout = inputs ? (ranked?.layout ?? null) : null;
  const cartons = useMemo(
    () => (layout && inputs ? cartonPlacements(layout, inputs) : []),
    [layout, inputs],
  );
  const bounds = useMemo(() => loadBounds(layout, inputs), [layout, inputs]);
  return { layout, inputs, cartons, bounds };
}
