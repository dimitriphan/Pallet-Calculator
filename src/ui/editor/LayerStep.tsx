import type { ReactNode } from 'react';
import { layoutWeight } from '../../engine/analytics/weight';
import type { EditorSession } from '../../store/manualEditorStore';
import { DetailRows } from '../DetailRows';
import { fmtCount, weightText } from '../format';
import { flagLines } from '../manualFlags';
import { StabilityBadge } from '../StabilityBadge';
import { useUnit } from '../useUnit';
import { FlagList } from './FlagList';
import { HINT } from './styles';

/**
 * The Pallet layer step's figures (spec 6.2b): what the one layer comes to once the tool has
 * stacked it, and every flag. The layer's tools are added to `LayerTools`.
 */
export function LayerStep({ session }: { session: EditorSession }) {
  const unit = useUnit();
  const { layout, flags, inputs } = session.build;
  const weight = layoutWeight(layout, inputs);
  const lines = flagLines(flags, unit);
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
      <DetailRows title="This layout" rows={rows} />
      <FlagList lines={lines} label="Layout flags" />
      <p className={HINT}>
        The view shows one layer and the outline of the allowed footprint. The tool stacks the layer
        as high as the height and weight limits allow.
      </p>
      <p role="status" className="sr-only">
        {spoken}
      </p>
    </div>
  );
}
