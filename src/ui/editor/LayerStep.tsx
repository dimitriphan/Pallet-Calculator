import type { ReactNode } from 'react';
import { describeWarning } from '../../engine/analytics/stability';
import { layoutWeight } from '../../engine/analytics/weight';
import type { EditorSession } from '../../store/manualEditorStore';
import { DetailRows } from '../DetailRows';
import { fmtCount, weightText } from '../format';
import { flagLines } from '../manualFlags';
import { StabilityBadge } from '../StabilityBadge';
import { useUnit } from '../useUnit';
import { CartonList } from './CartonList';
import { FlagList } from './FlagList';
import { SelectedCarton } from './SelectedCarton';
import { MixedNote } from './MixedNote';
import { HINT } from './styles';

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
      <MixedNote session={session} />
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
