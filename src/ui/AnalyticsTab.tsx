import type { ReactNode } from 'react';
import {
  describeBoxCounts,
  describeLayerOrientations,
  type Analytics,
  type LayerOrientation,
} from '../engine/analytics/analytics';
import { describeWarning } from '../engine/analytics/stability';
import { DetailRows } from './DetailRows';
import { StabilityBadge } from './StabilityBadge';
import {
  areaText,
  dimsText,
  fmtCount,
  fmtPct,
  lengthText,
  pairText,
  ratioText,
  shareText,
  volumeText,
  weightText,
  type Unit,
} from './format';
import { useUnit } from './useUnit';

const TARGET_LABEL = {
  met: 'Target met',
  exceeded: 'Target exceeded',
  notAchievable: 'Target not achievable',
} as const;

/** One layer type per line; the text still reads "Length up: 1 layer; Width up: 6 layers". */
function OrientationLines({ list }: { list: LayerOrientation[] }) {
  return list.map((o, k) => (
    <span key={`${o.vertical}-${o.cartonsPerLayer}`} className="block whitespace-nowrap">
      {describeLayerOrientations([o])}
      {k < list.length - 1 ? '; ' : ''}
    </span>
  ));
}

/** Consecutive layers of the same weight, bottom first, one per line. */
function LayerWeightLines({ perLayer, unit }: { perLayer: number[]; unit: Unit }) {
  const runs: { from: number; to: number; weight: number }[] = [];
  perLayer.forEach((weight, k) => {
    const last = runs.at(-1);
    if (last && last.weight === weight) last.to = k + 1;
    else runs.push({ from: k + 1, to: k + 1, weight });
  });
  return runs.map((r) => (
    <span key={r.from} className="block whitespace-nowrap">
      {r.from === r.to
        ? `Layer ${r.from}: ${weightText(r.weight, unit)}`
        : `Layers ${r.from}–${r.to}: ${weightText(r.weight, unit)} each`}
    </span>
  ));
}

/** Every analytics figure of the selected layout. */
export function AnalyticsTab({ analytics: a }: { analytics: Analytics }) {
  const unit = useUnit();
  const length = (v: number) => lengthText(v, unit);
  const dims = (d: Parameters<typeof dimsText>[0]) => dimsText(d, unit);
  const area = (v: number) => areaText(v, unit);
  const volume = (v: number) => volumeText(v, unit);
  const pct = (v: number) => fmtPct(v);
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
      <div className="root-divider" aria-hidden="true" />
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
      <div className="root-divider" aria-hidden="true" />
      <DetailRows
        title="Pallet"
        rows={[
          ['Pallet limitation', dims(p.dims)],
          ['Usable stacking height', length(p.usableHeight)],
          ['Usable footprint', pairText(p.usableFootprint.x, p.usableFootprint.y, unit)],
          ['Layers', String(p.layers)],
          [
            'Cartons per layer',
            p.cartonsPerLayerMin === p.cartonsPerLayerMax
              ? String(p.cartonsPerLayerMin)
              : `${p.cartonsPerLayerMin}–${p.cartonsPerLayerMax}`,
          ],
          ['Load length', length(p.loadLength)],
          ['Load width', length(p.loadWidth)],
          ['Total load height (with pallet)', length(p.totalLoadHeight)],
          ['Volume utilization', pct(p.volumeUtilizationPct)],
          ['Remaining height', length(p.remainingHeight)],
          ['Remaining footprint (fullest layer)', area(p.remainingFootprintArea)],
        ]}
      />
      <div className="root-divider" aria-hidden="true" />
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
      {a.weight && (
        <>
          <div className="root-divider" aria-hidden="true" />
          <DetailRows
            title="Weight"
            rows={[
              ['Total weight', weightText(a.weight.total, unit)],
              ...(a.weight.max !== null
                ? ([
                    ['Maximum pallet weight', weightText(a.weight.max, unit)],
                    ['Layers removed for weight', fmtCount(a.weight.layersRemoved)],
                    ['Room for more cartons by weight', fmtCount(a.weight.roomForCartons)],
                  ] as [string, string][])
                : []),
              ['Weight per carton', weightText(a.weight.perCarton, unit)],
              ['Weight per layer', <LayerWeightLines perLayer={a.weight.perLayer} unit={unit} />],
              ['Centre of mass height above floor', length(a.weight.centreOfMassHeight)],
            ]}
          />
        </>
      )}
      {a.stability && <StabilityRows stability={a.stability} />}
    </div>
  );
}

/** The rating, its warnings in words, then what each check measured. */
function StabilityRows({ stability: s }: { stability: NonNullable<Analytics['stability']> }) {
  const m = s.measures;
  const turned = s.turnedLayers;
  return (
    <>
      <div className="root-divider" aria-hidden="true" />
      <DetailRows
        title="Stability"
        rows={[
          ['Rating', <StabilityBadge stability={s} />],
          ...(s.warnings.length > 0
            ? ([
                [
                  'Warnings',
                  s.warnings.map((w) => (
                    <span key={w.check} className="block text-left">
                      {describeWarning(w)}
                    </span>
                  )),
                ],
              ] as [string, ReactNode][])
            : []),
          ['Stack height ÷ shorter side of base', ratioText(m.stackHeightRatio)],
          [
            'Carton height ÷ shorter base side, worst layer',
            m.cartonHeight ? (
              <span className="whitespace-nowrap">{`${ratioText(m.cartonHeight.ratio)} (layer ${fmtCount(m.cartonHeight.layer)})`}</span>
            ) : (
              '—'
            ),
          ],
          [
            'Least support from the layer below',
            m.support ? (
              <span className="whitespace-nowrap">{`${shareText(m.support.share)} (layer ${fmtCount(m.support.layer)})`}</span>
            ) : (
              '—'
            ),
          ],
          [
            'Most identical layers in straight columns',
            <span className="whitespace-nowrap">
              {m.columns && m.columns.layers > 1
                ? `${fmtCount(m.columns.layers)} (from layer ${fmtCount(m.columns.from)})`
                : fmtCount(m.columns?.layers ?? 0)}
            </span>,
          ],
          [
            'Layers turned half a turn (180°)',
            turned.length > 0 ? turned.map(fmtCount).join(', ') : 'None',
          ],
        ]}
      />
    </>
  );
}
