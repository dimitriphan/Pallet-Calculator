import { useMemo } from 'react';
import type { Inputs, Layout } from '../domain/types';
import { cartonPlacements, type PlacedCarton } from '../engine/packing/positions';
import { selectSelected } from '../store/resultsStore';
import { useResults } from '../ui/StoreContext';
import { loadBounds, measuredBounds, type SceneBounds } from './transforms';

export interface SceneData {
  layout: Layout | null;
  /** The inputs the shown result was computed from, never the live draft. */
  inputs: Inputs | null;
  cartons: PlacedCarton[];
  /** The load with its pallet: camera framing and captures. */
  bounds: SceneBounds;
  /** What the measurement lines measure: the cartons, from the floor up. */
  measured: SceneBounds;
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
  const measured = useMemo(() => measuredBounds(layout, inputs), [layout, inputs]);
  return { layout, inputs, cartons, bounds, measured };
}
