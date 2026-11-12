/**
 * The one selected layout, calculated or manual (spec 6.4). The 3D view, the Analytics tab, the
 * unused-space overlay and every export read the selection through here, so a manual layout
 * reaches them exactly as a calculated one does.
 */
import type { Inputs, OptimizeResult, RankedLayout } from '../domain/types';
import type { ManualEntry, ManualLayoutsState, ManualMarker } from './manualLayoutsStore';
import { selectSelected, type ResultsState } from './resultsStore';

/**
 * A selected layout: a calculated one as ranked, or a manual one, which carries `manual`.
 * For a manual layout `rank`, `score` and `explanation` are placeholders (0, zeros, empty) and
 * must not be shown: test `ranked.manual` (or `isManualRanked`) first.
 */
export type SelectedRanked = RankedLayout & { manual?: ManualMarker };

export function isManualRanked(r: SelectedRanked): r is RankedLayout & { manual: ManualMarker } {
  return r.manual !== undefined;
}

export interface SelectedLayout {
  ranked: SelectedRanked;
  /**
   * The inputs the layout was built from and must be drawn and measured with. For a calculated
   * layout, those of its calculation (not the current draft). For a manual layout, the last
   * valid inputs; when it is out of date, with the product, wall thickness and leeway it was
   * made for (it is shown as it was made).
   */
  inputs: Inputs;
  /**
   * True when what is shown is older than the inputs on screen: a calculated result awaiting
   * recalculation, a manual layout while the inputs are invalid, or one that is out of date.
   */
  stale: boolean;
}

/** The manual layout that is selected, or null when a calculated one is (or nothing). */
export function selectedManualEntry(
  results: Pick<ResultsState, 'selectedManualId'>,
  manual: Pick<ManualLayoutsState, 'entries'>,
): ManualEntry | null {
  const id = results.selectedManualId;
  return id === null ? null : (manual.entries.find((e) => e.spec.id === id) ?? null);
}

/** `SelectedLayout` of a manual entry. */
export function manualSelection(entry: ManualEntry, stale: boolean): SelectedLayout {
  return {
    ranked: entry.ranked,
    inputs: entry.build.inputs,
    stale: stale || entry.build.status === 'outOfDate',
  };
}

/**
 * The selected layout: the selected manual layout when there is one, else the selected
 * calculated layout, else null. Returns a new object on every call; in a component use the
 * `useSelectedLayout` hook, which keeps it while nothing changed.
 */
export function selectSelectedLayout(
  results: ResultsState,
  manual: Pick<ManualLayoutsState, 'entries' | 'stale'>,
): SelectedLayout | null {
  const entry = selectedManualEntry(results, manual);
  if (entry) return manualSelection(entry, manual.stale);
  const ranked = selectSelected(results);
  return ranked && results.inputs ? { ranked, inputs: results.inputs, stale: results.stale } : null;
}

/** What `buildExportPayload` and `buildSheetContent` take for the selected layout. */
export interface ExportSource {
  inputs: Inputs;
  result: OptimizeResult;
  selectedIndex: number;
  stale: boolean;
  /** Present when the selected layout is a manual one. */
  manual?: ManualMarker;
}

/**
 * The selected layout as the exports take it. A calculated layout goes with its whole result.
 * A manual layout goes as a result of that one layout (index 0) with its own inputs: it is not
 * ranked against the calculated layouts, and those were measured with other inputs when it is
 * out of date. Null when there is nothing to export.
 */
export function selectExportSource(
  results: ResultsState,
  manual: Pick<ManualLayoutsState, 'entries' | 'stale'>,
): ExportSource | null {
  const entry = selectedManualEntry(results, manual);
  if (entry) {
    const { inputs, stale } = manualSelection(entry, manual.stale);
    return {
      inputs,
      result: {
        layouts: [entry.ranked],
        candidatesEvaluated: 0,
        emptyReason: null,
        truncated: false,
      },
      selectedIndex: 0,
      stale,
      manual: entry.ranked.manual,
    };
  }
  const { inputs, result, selectedIndex, stale } = results;
  if (!inputs || !result?.layouts[selectedIndex]) return null;
  return { inputs, result, selectedIndex, stale };
}
