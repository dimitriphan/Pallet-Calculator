import { PALLET_HEIGHT } from '../domain/constants';
import type { Inputs, Layout } from '../domain/types';
import type { Analytics } from '../engine/analytics/analytics';
import { cartonPlacements, productsInCarton } from '../engine/packing/positions';
import type { Selection } from '../store/sceneStore';
import { DetailRows } from './DetailRows';
import { dimsText, fmtPct, lengthText } from './format';
import { useUnit } from './useUnit';

const NOTHING = 'Click an object in the 3D view to see its details.';

interface SelectionTabProps {
  selection: Selection;
  layout: Layout;
  inputs: Inputs;
  analytics: Analytics;
}

/** Details of whatever is selected in the 3D view. */
export function SelectionTab({ selection, layout, inputs, analytics }: SelectionTabProps) {
  const unit = useUnit();
  const length = (v: number) => lengthText(v, unit);
  if (selection?.kind === 'pallet') {
    const p = analytics.pallet;
    return (
      <DetailRows
        title="Pallet"
        rows={[
          ['Overall utilization', fmtPct(analytics.totals.utilizationPct)],
          ['Total cartons', String(analytics.totals.cartons)],
          ['Total products', String(analytics.totals.products)],
          [
            'Load dimensions (L × W × H)',
            dimsText(
              {
                length: p.loadLength,
                width: p.loadWidth,
                height: p.totalLoadHeight - PALLET_HEIGHT,
              },
              unit,
            ),
          ],
          ['Total height with pallet', length(p.totalLoadHeight)],
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
              dimsText({ length: carton.dx, width: carton.dy, height: carton.dz }, unit),
            ],
            ['Products in carton', String(layout.carton.boxesPerCarton)],
            ['Carton utilization', fmtPct(layout.carton.utilization * 100)],
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
              ['Dimensions (L × W × H)', dimsText(inputs.product, unit)],
              ['X (from load corner)', length(product.x)],
              ['Y (from load corner)', length(product.y)],
              ['Z (above pallet top)', length(product.z)],
            ]}
          />
        );
      }
    }
  }

  return <p className="text-sm text-gray-600 dark:text-harbor-mist">{NOTHING}</p>;
}
