import { PALLET_HEIGHT } from '../domain/constants';
import type { Inputs, Layout } from '../domain/types';
import type { Analytics } from '../engine/analytics/analytics';
import { cartonPlacements, productsInCarton } from '../engine/packing/positions';
import { formatDims, formatNumber } from '../engine/units/units';
import type { Selection } from '../store/sceneStore';
import { DetailRows } from './DetailRows';

const inches = (v: number) => `${formatNumber(v)} in`;
const NOTHING = 'Click an object in the 3D view to see its details.';

interface SelectionTabProps {
  selection: Selection;
  layout: Layout;
  inputs: Inputs;
  analytics: Analytics;
}

/** Details of whatever is selected in the 3D view. */
export function SelectionTab({ selection, layout, inputs, analytics }: SelectionTabProps) {
  if (selection?.kind === 'pallet') {
    const p = analytics.pallet;
    return (
      <DetailRows
        title="Pallet"
        rows={[
          ['Overall utilization', `${formatNumber(analytics.totals.utilizationPct)}%`],
          ['Total cartons', String(analytics.totals.cartons)],
          ['Total products', String(analytics.totals.products)],
          [
            'Load dimensions (L × W × H)',
            `${formatDims({
              length: p.loadLength,
              width: p.loadWidth,
              height: p.totalLoadHeight - PALLET_HEIGHT,
            })} in`,
          ],
          ['Total height with pallet', inches(p.totalLoadHeight)],
        ]}
      />
    );
  }

  if (selection?.kind === 'carton' || selection?.kind === 'product') {
    const carton = cartonPlacements(layout, inputs)[selection.cartonIndex];
    if (carton && selection.kind === 'carton') {
      return (
        <DetailRows
          title={`Carton ${selection.cartonIndex + 1}`}
          rows={[
            [
              'Dimensions as placed (x × y × z)',
              `${formatDims({ length: carton.dx, width: carton.dy, height: carton.dz })} in`,
            ],
            ['Products in carton', String(layout.carton.boxesPerCarton)],
            ['Carton utilization', `${formatNumber(layout.carton.utilization * 100)}%`],
            ['Layer', String(carton.layerIndex + 1)],
          ]}
        />
      );
    }
    if (carton && selection.kind === 'product') {
      const product = productsInCarton(layout, inputs, carton)[selection.productIndex];
      if (product) {
        return (
          <DetailRows
            title={`Product ${selection.productIndex + 1} in carton ${selection.cartonIndex + 1}`}
            rows={[
              ['Dimensions (L × W × H)', `${formatDims(inputs.product)} in`],
              ['X (from load corner)', inches(product.x)],
              ['Y (from load corner)', inches(product.y)],
              ['Z (above pallet top)', inches(product.z)],
            ]}
          />
        );
      }
    }
  }

  return <p className="text-sm text-gray-600">{NOTHING}</p>;
}
