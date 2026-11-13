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
  /**
   * Where each carton of the one layer sits: its minimum corner, in inches. With `frame`
   * 'pallet' the position is measured from the pallet's own minimum corner, so the layout
   * stays where it is on the pallet when the allowed overhang or the pallet size changes.
   */
  cartons: ManualCarton[];
  /**
   * The frame `cartons` are in. Everything the app saves is 'pallet'. Left out only in data
   * stored before positions were kept in the pallet frame: those are in the frame of the usable
   * footprint (see layer.ts) under whatever inputs they are built with, and the store moves
   * them to the pallet frame when it first loads them (`toPalletFrame`).
   */
  frame?: 'pallet';
  upperLayers: UpperLayers;
  madeFor: MadeFor;
}

/**
 * Positions in the pallet frame as positions in the usable footprint's frame under `overhang`
 * (the footprint reaches half the overhang beyond the pallet on every side), which is the
 * frame every layer function works in.
 */
export function palletToUsable(cartons: readonly ManualCarton[], overhang: number): ManualCarton[] {
  const half = overhang / 2;
  return half === 0 ? [...cartons] : cartons.map((c) => ({ ...c, x: c.x + half, y: c.y + half }));
}

/** The reverse of `palletToUsable`. */
export function usableToPallet(cartons: readonly ManualCarton[], overhang: number): ManualCarton[] {
  const half = overhang / 2;
  return half === 0 ? [...cartons] : cartons.map((c) => ({ ...c, x: c.x - half, y: c.y - half }));
}

/**
 * A spec with its positions in the pallet frame. One stored before the pallet frame (no
 * `frame`) holds positions in the usable footprint's frame; `overhang` is the allowed overhang
 * it is taken to have been made with. A spec already in the pallet frame comes back as it is.
 */
export function toPalletFrame(spec: ManualLayoutSpec, overhang: number): ManualLayoutSpec {
  if (spec.frame === 'pallet') return spec;
  return { ...spec, cartons: usableToPallet(spec.cartons, overhang), frame: 'pallet' };
}

/** The spec's cartons in the usable footprint's frame under the inputs: what is built. */
export function cartonsInUsableFrame(spec: ManualLayoutSpec, inputs: Inputs): ManualCarton[] {
  return spec.frame === 'pallet' ? palletToUsable(spec.cartons, inputs.overhang) : spec.cartons;
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
  | { kind: 'orientationNotAllowed' }
  /**
   * The spec is not one the editor can make (only possible in data changed by hand): a count
   * that is not a whole number of 1 or more, a position or size that is not a finite number,
   * an unknown facing, side down or upper-layer choice. Nothing is built from it: the layout
   * has no layers. Cannot be saved.
   */
  | { kind: 'invalid' };

/** The flags that stop a layout being saved. */
const BLOCKING: ReadonlySet<ManualFlag['kind']> = new Set([
  'overHeight',
  'cannotFit',
  'empty',
  'overlap',
  'invalid',
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

const FACINGS: readonly string[] = ['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL'];
const SIDES_DOWN: readonly string[] = ['base', 'side', 'end'];
const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 1;
const isSize = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isAmount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Whether a design is one the editor can make: whole counts of 1 or more, a known facing. */
export function isValidDesign(design: CartonDesign): boolean {
  const c = design?.counts;
  return (
    !!c &&
    isCount(c.length) &&
    isCount(c.width) &&
    isCount(c.height) &&
    FACINGS.includes(design.facing) &&
    SIDES_DOWN.includes(design.sideDown)
  );
}

/**
 * Whether a spec is one the editor can make: a valid design, every carton at a finite
 * position, a known upper-layer choice, and finite positive sizes in `madeFor`. The arithmetic
 * below does not survive anything else (NaN and negative totals), so `buildManualLayout`
 * builds nothing from a spec that fails this and flags it 'invalid'.
 */
export function isValidSpec(spec: ManualLayoutSpec): boolean {
  const m = spec.madeFor;
  return (
    isValidDesign(spec.design) &&
    Array.isArray(spec.cartons) &&
    spec.cartons.every(
      (c) => !!c && Number.isFinite(c.x) && Number.isFinite(c.y) && typeof c.rotated === 'boolean',
    ) &&
    (spec.upperLayers === 'same' || spec.upperLayers === 'alternate') &&
    (spec.frame === undefined || spec.frame === 'pallet') &&
    !!m &&
    !!m.product &&
    !!m.outer &&
    [m.product.length, m.product.width, m.product.height, m.outer.L, m.outer.W, m.outer.H].every(
      isSize,
    ) &&
    isAmount(m.wallThickness) &&
    isAmount(m.leeway)
  );
}

/** What is returned for a spec that fails `isValidSpec`: no layers, one blocking flag. */
function invalidBuild(spec: ManualLayoutSpec, inputs: Inputs): ManualBuild {
  const carton = designCarton(
    { counts: { length: 1, width: 1, height: 1 }, facing: 'LWH' },
    inputs,
  );
  return {
    layout: {
      id: MANUAL_ID_PREFIX + spec.id,
      carton,
      layers: [],
      totalCartons: 0,
      totalProducts: 0,
    },
    flags: [{ kind: 'invalid' }],
    status: 'current',
    inputs,
  };
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
): Layer[] {
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
  return layers;
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
  if (!isValidSpec(spec)) return invalidBuild(spec, inputs);
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
  // Stored positions are relative to the pallet; the layer functions work in the footprint.
  const placed = cartonsInUsableFrame(spec, built);
  const pattern = manualPattern(placed, carton, vertical);
  const flags: ManualFlag[] = [];

  const cf = cartonFlags(carton, vertical, built);
  if (pattern.cartonCount === 0) flags.push({ kind: 'empty' });
  if (cf.cannotFitFootprint) flags.push({ kind: 'cannotFit' });
  if (cf.overHeightBy !== null) flags.push({ kind: 'overHeight', by: cf.overHeightBy });
  if (cf.overMaximum.length > 0) flags.push({ kind: 'overMaximum', sides: cf.overMaximum });
  const pairs = overlapCount(placed, base);
  if (pairs > 0) flags.push({ kind: 'overlap', pairs });

  const fit = pattern.cartonCount === 0 ? 0 : fitsCount(usableHeight(built), pattern.height);
  // A carton over the height limit still stands as one layer, flagged, so there is a load to show.
  const count = pattern.cartonCount === 0 ? 0 : Math.max(1, fit);
  const layers = stack(pattern, count, spec.upperLayers, carton, built);
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

  // Counted on the layer as built. A turned layer needs no count of its own: the half turn is
  // about the centre of the usable footprint, which maps the footprint onto itself, so the
  // turned layer has as many cartons outside it, reaching exactly as far.
  const overhang = overhangOf(placed, base, usable);
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

/**
 * `bestLayerFor` as the cartons of a manual layer, in the usable footprint's frame, ready to
 * edit; [] when no carton fits.
 */
export function bestCartonsFor(design: CartonDesign, inputs: Inputs): ManualCarton[] {
  const pattern = bestLayerFor(design, inputs);
  return pattern ? explodePattern(pattern, designCarton(design, inputs), inputs) : [];
}

/**
 * The manual copy of a calculated layout: its carton as a design, its bottom layer exploded
 * into single cartons where they stand on the pallet (pallet frame), and 'alternate' when the layout has a turned layer.
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
    cartons: usableToPallet(explodePattern(bottom, layout.carton, inputs), inputs.overhang),
    frame: 'pallet',
    upperLayers: layout.layers.some((layer) => layer.turned) ? 'alternate' : 'same',
    madeFor: madeForOf(design, inputs),
  };
}

/**
 * Whether a calculated layout mixes layer patterns: some layer is not its bottom layer again
 * (as it is, or turned). `specFromLayout` copies such a layout as a stack of its bottom layer
 * only, which can hold a different number of boxes.
 */
export function mixesLayerPatterns(layout: Layout): boolean {
  const bottom = layout.layers[0];
  if (!bottom) return false;
  const blocks = JSON.stringify(bottom.blocks);
  return layout.layers.some(
    (layer) =>
      layer.vertical !== bottom.vertical ||
      layer.cartonCount !== bottom.cartonCount ||
      (!layer.turned && JSON.stringify(layer.blocks) !== blocks),
  );
}
