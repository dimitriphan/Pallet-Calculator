import { useMemo, type ReactNode } from 'react';
import { describeWarning } from '../../engine/analytics/stability';
import { layoutWeight } from '../../engine/analytics/weight';
import { buildManualLayout, mixesLayerPatterns, specFromLayout } from '../../engine/manual/build';
import type { EditorSession } from '../../store/manualEditorStore';
import { DetailRows } from '../DetailRows';
import { fmtCount, weightText } from '../format';
import { flagLines } from '../manualFlags';
import { StabilityBadge } from '../StabilityBadge';
import { useResults } from '../StoreContext';
import { useUnit } from '../useUnit';
import { CartonList } from './CartonList';
import { FlagList } from './FlagList';
import { SelectedCarton } from './SelectedCarton';
import { HINT, NOTE_BOX } from './styles';

/**
 * What a calculated result that mixes layer patterns comes to as a hand-edited copy: the copy
 * stacks the bottom layer only, so it can hold a different number of boxes. Null when the
 * session was not opened from such a result (or its carton is no longer that result's).
 */
function useMixedNote(session: EditorSession): string | null {
  const result = useResults((s) => s.result);
  const made = useResults((s) => s.inputs);
  const { origin, design, inputs } = session;
  return useMemo(() => {
    if (origin.kind === 'saved' || !made) return null;
    const ranked =
      origin.kind === 'calculated'
        ? result?.layouts.find((r) => r.layout.id === origin.layoutId)
        : result?.layouts[0];
    if (!ranked || !mixesLayerPatterns(ranked.layout)) return null;
    const spec = specFromLayout(ranked.layout, made, 'draft', '');
    // A carton designed since is another carton: the note is about the copy as it started.
    if (!spec || JSON.stringify(spec.design) !== JSON.stringify(design)) return null;
    const started = buildManualLayout(spec, inputs).layout.totalProducts;
    const calculated = ranked.layout.totalProducts;
    return started === calculated
      ? 'This result mixes layer patterns. Editing by hand starts from its bottom layer.'
      : `This result mixes layer patterns. Editing by hand starts from its bottom layer: ${fmtCount(started)} boxes instead of ${fmtCount(calculated)}.`;
  }, [origin, design, inputs, result, made]);
}

/**
 * The Pallet layer step's panel (spec 6.2b): what the one layer comes to once the tool has
 * stacked it, its rating and every flag, the selected carton's position, and the cartons as a
 * list. The tools are in the bar above the 3D view (`LayerTools`).
 */
export function LayerStep({ session }: { session: EditorSession }) {
  const unit = useUnit();
  const { layout, flags, inputs } = session.build;
  const weight = layoutWeight(layout, inputs);
  const lines = flagLines(flags, unit);
  const mixed = useMixedNote(session);
  const warnings = layout.stability?.warnings ?? [];
  const rows: [string, ReactNode][] = [
    ['Cartons in the layer', fmtCount(session.layer.length)],
    ['Layers', fmtCount(layout.layers.length)],
    ['Total boxes', fmtCount(layout.totalProducts)],
    ...(weight
      ? ([['Total weight', weightText(weight.total, unit)]] as [string, ReactNode][])
      : []),
    ...(layout.stability
      ? ([['Stability', <StabilityBadge key="s" stability={layout.stability} short />]] as [
          string,
          ReactNode,
        ][])
      : []),
  ];
  const spoken = [
    `Cartons in the layer: ${fmtCount(session.layer.length)}`,
    `Layers: ${fmtCount(layout.layers.length)}`,
    `Total boxes: ${fmtCount(layout.totalProducts)}`,
    ...lines.map((l) => l.text),
  ].join('. ');
  return (
    <div className="space-y-3">
      {mixed && (
        <p data-testid="mixed-note" className={NOTE_BOX}>
          {mixed}
        </p>
      )}
      <DetailRows title="This layout" rows={rows} />
      {warnings.length > 0 && (
        // role="list" keeps list semantics in Safari, which drops them with list-style none.
        <ul role="list" aria-label="Stability warnings" className="space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning.check}
              className="text-sm tabular-nums text-gray-700 dark:text-harbor-mist"
            >
              {describeWarning(warning)}
            </li>
          ))}
        </ul>
      )}
      <FlagList lines={lines} label="Layout flags" />
      <SelectedCarton session={session} />
      <CartonList session={session} />
      <p className={HINT}>
        Drag a carton in the view to move it; drag empty space to look around. Or select a carton
        and use the arrow keys (hold Shift for bigger steps). R turns it, Delete removes it, and the
        [ and ] keys go to the previous and next carton. The tool stacks the layer as high as the
        height and weight limits allow.
      </p>
      <p role="status" className="sr-only">
        {spoken}
      </p>
    </div>
  );
}
