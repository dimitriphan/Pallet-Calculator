import { useMemo } from 'react';
import { selectSelected } from '../store/resultsStore';
import {
  manualSelection,
  selectedManualEntry,
  selectExportSource,
  type ExportSource,
  type SelectedLayout,
} from '../store/selection';
import { useManualLayouts, useResults, useStores } from './StoreContext';

/**
 * The selected layout, calculated or manual, with the inputs to draw and measure it with; null
 * when there is nothing to show. The one way screens read the selection (see selection.ts).
 * The object is kept from render to render while nothing about the selection changed.
 */
export function useSelectedLayout(): SelectedLayout | null {
  const manualId = useResults((s) => s.selectedManualId);
  const entry = useManualLayouts((m) => selectedManualEntry({ selectedManualId: manualId }, m));
  const manualStale = useManualLayouts((m) => m.stale);
  const ranked = useResults(selectSelected);
  const inputs = useResults((s) => s.inputs);
  const stale = useResults((s) => s.stale);
  return useMemo(() => {
    if (entry) return manualSelection(entry, manualStale);
    return ranked && inputs ? { ranked, inputs, stale } : null;
  }, [entry, manualStale, ranked, inputs, stale]);
}

/** Reads the selected layout as the exports take it, at the moment of an export. */
export function useExportSource(): () => ExportSource | null {
  const { results, manualLayouts } = useStores();
  return () => selectExportSource(results.getState(), manualLayouts.getState());
}
