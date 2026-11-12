/**
 * Building and checking a manual layout (spec 6.1, 6.3, 6.6): the user's one layer is stacked
 * to the height limit, trimmed to the maximum weight, its alternate layers turned when asked
 * and the result rated, all by the functions calculated layouts use. Limits other than overlap
 * may be broken; each break comes back as a flag with the numbers needed to print it.
 * Pure: inches and pounds, no React.
 */
import { EPS } from '../../domain/constants';
import type {
  CartonCandidate,
  Dims,
  Inputs,
  Layer,
  LayerPattern,
  Layout,
  ProductAxis,
} from '../../domain/types';
import { assessStability, sameCartonRects } from '../analytics/stability';
import { layoutWeight, trimToWeight } from '../analytics/weight';
import { usableFootprint, usableHeight } from '../packing/geometry';
import { turnBlocks } from '../packing/interlock';
import { bestLayer, preferredPinwheel, type LayerCache } from '../packing/stacking';
import { fitsCount } from '../packing/tolerance';
import {
  cartonFlags,
  designCarton,
  designOf,
  verticalAxis,
  type CartonDesign,
  type OverMaximumSide,
} from './carton';
import {
  cartonBase,
  cartonsOf,
  explodePattern,
  manualPattern,
  overhangOf,
  overlapCount,
  type ManualCarton,
} from './layer';

/** Every manual layout's id starts with this, so it can never be a calculated layout's id. */
export const MANUAL_ID_PREFIX = 'manual:';

/** Upper layers: all like the first, or every second one turned half a turn. */
export type UpperLayers = 'same' | 'alternate';

/** The inputs that fix a carton's size, and the outer size they gave when the layout was made. */
export interface MadeFor {
  product: Dims;
  wallThickness: number;
  leeway: number;
  /** The carton's outer size along each box dimension, in inches. */
  outer: Record<ProductAxis, number>;
}

/** A manual layout as it is stored: what the user chose, nothing that is worked out. */
export interface ManualLayoutSpec {
  id: string;
  name: string;
  design: CartonDesign;
  /** Where each carton of the one layer sits (see layer.ts for the frame). */
  cartons: ManualCarton[];
  upperLayers: UpperLayers;
  madeFor: MadeFor;
}

/** One broken limit of a manual layout (spec 6.3), with the numbers to print it. */
export type ManualFlag =
  /**
   * Cartons lie outside the usable footprint: how many in the layer with the most of them
   * (the layer as built, or its turned twin) and the furthest any reaches outside, in inches.
   */
  | { kind: 'overhang'; cartons: number; by: number }
  /** The carton is over the maximum carton size on these sides (longest first). */
  | { kind: 'overMaximum'; sides: OverMaximumSide[] }
  /** One layer on the pallet is already over the maximum pallet weight, by `by` pounds. */
  | { kind: 'overWeight'; by: number }
  /** The standing carton is taller than the usable height, by `by` inches. Cannot be saved. */
  | { kind: 'overHeight'; by: number }
  /** The carton's base fits the usable footprint neither way round. Cannot be saved. */
  | { kind: 'cannotFit' }
  /** The layer holds no carton. Cannot be saved. */
  | { kind: 'empty' }
  /** Cartons overlap (only possible in stored data changed by hand): `pairs` of them. */
  | { kind: 'overlap'; pairs: number }
  /** The boxes stand a way up the rotation inputs would not let the search use. A note. */
  | { kind: 'orientationNotAllowed' };

/** The flags that stop a layout being saved. */
const BLOCKING: ReadonlySet<ManualFlag['kind']> = new Set([
  'overHeight',
  'cannotFit',
  'empty',
  'overlap',
]);

/** Whether a build may be saved: no flag that the spec says cannot be saved. */
export function canSave(flags: readonly ManualFlag[]): boolean {
  return flags.every((f) => !BLOCKING.has(f.kind));
}

export interface ManualBuild {
  /** The layout, measured like any other. Its id is `manual:` + the spec's id. */
  layout: Layout;
  flags: ManualFlag[];
  /** 'outOfDate' when the carton rebuilt from the current inputs is no longer the stored size. */
  status: 'current' | 'outOfDate';
  /**
   * The inputs the layout was built and checked with. The inputs given, except for an
   * out-of-date layout: that is shown as it was made, so its product, wall thickness and
   * leeway are the stored ones (the pallet, limits and weights are still the current ones).
   */
  inputs: Inputs;
}

/** What `madeFor` holds for a design under the inputs: record it when a layout is saved. */
export function madeForOf(design: CartonDesign, inputs: Inputs): MadeFor {
  return {
    product: { ...inputs.product },
    wallThickness: inputs.wallThickness,
    leeway: inputs.leeway,
    outer: { ...designCarton(design, inputs).outer },
  };
}

/**
 * Whether a stored layout's carton still applies: rebuilt from the current product, wall
 * thickness and leeway it has the stored outer size. Nothing else can put a layout out of date.
 */
export function isOutOfDate(spec: ManualLayoutSpec, inputs: Inputs): boolean {
  const outer = designCarton(spec.design, inputs).outer;
  return (['L', 'W', 'H'] as const).some(
    (axis) => Math.abs(outer[axis] - spec.madeFor.outer[axis]) > EPS,
  );
}

/**
 * The layers of one manual pattern stacked `count` high. With 'alternate', every second layer
 * is the pattern turned half a turn about the centre of the usable footprint (by the turn the
 * automatic interlock uses) and marked `turned`, unless the turn leaves every carton where it
 * was. Layers of one pattern share one block list.
 */
function stack(
  pattern: LayerPattern,
  count: number,
  upperLayers: UpperLayers,
  carton: CartonCandidate,
  inputs: Inputs,
): { layers: Layer[]; turned: LayerPattern | null } {
  let turned: LayerPattern | null = null;
  if (upperLayers === 'alternate' && pattern.blocks.length > 0) {
    const { a, b } = cartonBase(carton, pattern.vertical);
    const { x, y } = usableFootprint(inputs);
    const candidate = { ...pattern, blocks: turnBlocks(pattern.blocks, a, b, x, y, 'manual') };
    const moves = !sameCartonRects({ ...pattern, z: 0 }, { ...candidate, z: 0 }, carton);
    if (moves) turned = candidate;
  }
  const layers: Layer[] = [];
  for (let k = 0; k < count; k++) {
    const z = k * pattern.height;
    layers.push(k % 2 === 1 && turned ? { ...turned, z, turned: true } : { ...pattern, z });
  }
  return { layers, turned };
}

/**
 * The manual layout of a stored spec under the current inputs, with its flags and whether it
 * is out of date. The layer is stacked to the height limit; whole layers are removed from the
 * top for the maximum weight by the trim calculated layouts use, and when even one layer is
 * over, one is kept and the excess flagged; alternate layers are turned when the spec asks;
 * stability is rated by the existing checks. A carton taller than the height limit is kept as
 * one layer and flagged; an empty layer gives a layout with no layers.
 *
 * Cheap enough to call on every change in the editor (pass the working layer in a spec).
 */
export function buildManualLayout(spec: ManualLayoutSpec, inputs: Inputs): ManualBuild {
  const status = isOutOfDate(spec, inputs) ? 'outOfDate' : 'current';
  // An out-of-date layout is shown as it was made: with the carton it was made for.
  const built: Inputs =
    status === 'current'
      ? inputs
      : {
          ...inputs,
          product: { ...spec.madeFor.product },
          wallThickness: spec.madeFor.wallThickness,
          leeway: spec.madeFor.leeway,
        };
  const carton = designCarton(spec.design, built);
  const vertical = verticalAxis(spec.design);
  const base = cartonBase(carton, vertical);
  const usable = usableFootprint(built);
  const pattern = manualPattern(spec.cartons, carton, vertical);
  const flags: ManualFlag[] = [];

  const cf = cartonFlags(carton, vertical, built);
  if (pattern.cartonCount === 0) flags.push({ kind: 'empty' });
  if (cf.cannotFitFootprint) flags.push({ kind: 'cannotFit' });
  if (cf.overHeightBy !== null) flags.push({ kind: 'overHeight', by: cf.overHeightBy });
  if (cf.overMaximum.length > 0) flags.push({ kind: 'overMaximum', sides: cf.overMaximum });
  const pairs = overlapCount(spec.cartons, base);
  if (pairs > 0) flags.push({ kind: 'overlap', pairs });

  const fit = pattern.cartonCount === 0 ? 0 : fitsCount(usableHeight(built), pattern.height);
  // A carton over the height limit still stands as one layer, flagged, so there is a load to show.
  const count = pattern.cartonCount === 0 ? 0 : Math.max(1, fit);
  const { layers, turned } = stack(pattern, count, spec.upperLayers, carton, built);
  const id = MANUAL_ID_PREFIX + spec.id;
  const totalCartons = count * pattern.cartonCount;
  let layout: Layout = {
    id,
    carton,
    layers,
    totalCartons,
    totalProducts: totalCartons * carton.boxesPerCarton,
  };

  const trimmed = trimToWeight(layout, built);
  if (trimmed === null) {
    // Even one layer on the pallet is over: one is kept, and the excess is said.
    const first = layers.slice(0, 1);
    layout = {
      ...layout,
      layers: first,
      totalCartons: pattern.cartonCount,
      totalProducts: pattern.cartonCount * carton.boxesPerCarton,
      ...(count > 1 ? { weightTrim: { layersRemoved: count - 1 } } : {}),
    };
    const total = layoutWeight(layout, built)?.total ?? 0;
    flags.push({ kind: 'overWeight', by: total - (built.weights.maxPallet ?? total) });
  } else {
    // The trim names a layout by its layers; a manual layout keeps its own id.
    layout = { ...trimmed, id };
  }

  // Overhang is counted on the layers really stacked: the layer as built, and its turned twin.
  let overhang = overhangOf(spec.cartons, base, usable);
  if (turned && layout.layers.some((layer) => layer.turned)) {
    const twin = overhangOf(cartonsOf(turned), base, usable);
    overhang = {
      cartons: Math.max(overhang.cartons, twin.cartons),
      by: Math.max(overhang.by, twin.by),
    };
  }
  if (overhang.cartons > 0) flags.push({ kind: 'overhang', ...overhang });
  if (cf.orientationNotAllowed) flags.push({ kind: 'orientationNotAllowed' });

  layout.stability = assessStability(layout, built);
  return { layout, flags, status, inputs: built };
}

/**
 * The tool's best layer for a designed carton, or null when not one carton fits the usable
 * footprint. The layer pattern setting is applied as the search applies it: Auto takes a
 * pinwheel only when it holds more cartons than straight cuts; Prefer pinwheel also takes one
 * that ties; Pinwheel only takes the pinwheel of the most cartons, and the best straight-cut
 * layer when there is no pinwheel at all (as the search falls back). Explode it with
 * `explodePattern` (or use `bestCartonsFor`) to edit it.
 */
export function bestLayerFor(design: CartonDesign, inputs: Inputs): LayerPattern | null {
  const carton = designCarton(design, inputs);
  const vertical = verticalAxis(design);
  const cache: LayerCache = new Map();
  const best = bestLayer(carton, vertical, inputs, cache);
  if (best === null) return null;
  const pref = (inputs as Partial<Inputs>).layerPattern ?? 'auto';
  if (pref === 'auto') return best;
  return preferredPinwheel(carton, vertical, inputs, cache, { pref }) ?? best;
}

/** `bestLayerFor` as the cartons of a manual layer, ready to edit; [] when no carton fits. */
export function bestCartonsFor(design: CartonDesign, inputs: Inputs): ManualCarton[] {
  const pattern = bestLayerFor(design, inputs);
  return pattern ? explodePattern(pattern, designCarton(design, inputs), inputs) : [];
}

/**
 * The manual copy of a calculated layout: its carton as a design, its bottom layer exploded
 * into single cartons where they stand, and 'alternate' when the layout has a turned layer.
 * A layout whose layers all repeat its bottom layer is copied exactly (same boxes, weight and
 * rating); one that mixes layer patterns becomes a stack of its bottom layer only, since a
 * manual layout has one pattern.
 */
export function specFromLayout(
  layout: Layout,
  inputs: Inputs,
  id: string,
  name: string,
): ManualLayoutSpec | null {
  const bottom = layout.layers[0];
  if (!bottom) return null;
  const design = designOf(layout.carton, bottom.vertical);
  return {
    id,
    name,
    design,
    cartons: explodePattern(bottom, layout.carton, inputs),
    upperLayers: layout.layers.some((layer) => layer.turned) ? 'alternate' : 'same',
    madeFor: madeForOf(design, inputs),
  };
}
