import {
  describeBoxCounts,
  describeLayerOrientations,
  type Analytics,
  type LayerOrientation,
} from '../engine/analytics/analytics';
import { formatDims, formatNumber } from '../engine/units/units';
import { DetailRows } from './DetailRows';

const TARGET_LABEL = {
  met: 'Target met',
  exceeded: 'Target exceeded',
  notAchievable: 'Target not achievable',
} as const;

const inches = (v: number) => `${formatNumber(v)} in`;
const dims = (d: Parameters<typeof formatDims>[0]) => `${formatDims(d)} in`;
const area = (v: number) => `${formatNumber(v)} in²`;
const volume = (v: number) => `${formatNumber(v)} in³`;
const pct = (v: number) => `${formatNumber(v)}%`;

/** One layer type per line; the text still reads "Length up: 1 layer; Width up: 6 layers". */
function OrientationLines({ list }: { list: LayerOrientation[] }) {
  return list.map((o, k) => (
    <span key={`${o.vertical}-${o.cartonsPerLayer}`} className="block whitespace-nowrap">
      {describeLayerOrientations([o])}
      {k < list.length - 1 ? '; ' : ''}
    </span>
  ));
}

/** Every analytics figure of the selected layout. */
export function AnalyticsTab({ analytics: a }: { analytics: Analytics }) {
  const p = a.pallet;
  const t = a.target;
  const target: [string, string][] =
    t.status === 'none'
      ? []
      : [
          ['Target status', TARGET_LABEL[t.status]],
          ['Desired quantity', String(t.requested)],
          ['Maximum quantity possible', String(t.maxPossible)],
          ...(t.cartonsNeeded !== null && t.layersNeeded !== null
            ? ([
                ['Cartons needed for target', String(t.cartonsNeeded)],
                ['Layers needed for target', String(t.layersNeeded)],
              ] as [string, string][])
            : []),
        ];
  return (
    <div className="space-y-4">
      <DetailRows
        title="Product"
        rows={[
          ['Dimensions', dims(a.product.dims)],
          ['Volume', volume(a.product.volume)],
          ['Quantity per carton', String(a.product.perCarton)],
        ]}
      />
      <DetailRows
        title="Carton"
        rows={[
          ['Inner dimensions', dims(a.carton.inner)],
          ['Outer dimensions', dims(a.carton.outer)],
          ['Carton utilization', pct(a.carton.utilizationPct)],
          ['Empty volume', volume(a.carton.emptyVolume)],
          ['Cartons per pallet', String(a.carton.perPallet)],
          [
            'Boxes along product length × width × height',
            <span className="whitespace-nowrap">{describeBoxCounts(a.carton.counts)}</span>,
          ],
          ['Product side facing up', <OrientationLines list={a.carton.layerOrientations} />],
        ]}
      />
      <DetailRows
        title="Pallet"
        rows={[
          ['Pallet limitation', dims(p.dims)],
          ['Usable stacking height', inches(p.usableHeight)],
          [
            'Usable footprint',
            `${formatNumber(p.usableFootprint.x)} × ${formatNumber(p.usableFootprint.y)} in`,
          ],
          ['Layers', String(p.layers)],
          [
            'Cartons per layer',
            p.cartonsPerLayerMin === p.cartonsPerLayerMax
              ? String(p.cartonsPerLayerMin)
              : `${p.cartonsPerLayerMin}–${p.cartonsPerLayerMax}`,
          ],
          ['Load length', inches(p.loadLength)],
          ['Load width', inches(p.loadWidth)],
          ['Total load height (with pallet)', inches(p.totalLoadHeight)],
          ['Volume utilization', pct(p.volumeUtilizationPct)],
          ['Remaining height', inches(p.remainingHeight)],
          ['Remaining footprint (fullest layer)', area(p.remainingFootprintArea)],
        ]}
      />
      <DetailRows
        title="Final results"
        rows={[
          ['Total products', String(a.totals.products)],
          ['Total cartons', String(a.totals.cartons)],
          ['Volume used', volume(a.totals.volumeUsed)],
          ['Volume available', volume(a.totals.volumeAvailable)],
          ['Utilization', pct(a.totals.utilizationPct)],
          ['Remaining volume', volume(a.totals.remainingVolume)],
          ...target,
        ]}
      />
    </div>
  );
}
