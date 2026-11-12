import type { Analytics } from '../engine/analytics/analytics';
import type { Unit } from '../engine/units/units';

export interface Dims {
  length: number;
  width: number;
  height: number;
}
export type ProductAxis = 'L' | 'W' | 'H';
export type OrientationCode = 'LWH' | 'LHW' | 'WLH' | 'WHL' | 'HLW' | 'HWL';
export type RotationMode = 'full' | 'upright' | 'noSide' | 'custom';
/**
 * The lowest stability rating a layout may have to be offered: any ('auto'), Fair or better,
 * or Good only.
 */
export type MinStability = 'auto' | 'fair' | 'good';
/**
 * Which layer patterns are wanted: 'auto' uses a pinwheel only where it holds more cartons
 * than straight cuts; 'preferPinwheel' also ranks pinwheel layouts first among equal box
 * counts; 'pinwheelOnly' leaves straight-cut layouts out.
 */
export type LayerPatternPref = 'auto' | 'preferPinwheel' | 'pinwheelOnly';

/** Weights in pounds. Blank box weight means weight is ignored everywhere. */
export interface WeightInputs {
  productBox: number | null; // lb; null = weight ignored
  maxPallet: number | null; // lb, whole load including pallet
  emptyCarton: number; // lb, default 0
  pallet: number; // lb, default 40
}

export interface Inputs {
  pallet: Dims;
  product: Dims;
  maxCarton: Dims;
  targetQuantity: number | null;
  boxesPerCarton: number | null; // null = the optimizer chooses
  leeway: number;
  wallThickness: number;
  overhang: number;
  rotationMode: RotationMode;
  customOrientations: OrientationCode[]; // used only when rotationMode === 'custom'
  keepCartonsUpright: boolean;
  weights: WeightInputs;
  minStability: MinStability;
  layerPattern: LayerPatternPref;
}

/** Same shape as Inputs but every numeric field is the raw text the user typed. */
export interface InputsDraft {
  pallet: Record<keyof Dims, string>;
  product: Record<keyof Dims, string>;
  maxCarton: Record<keyof Dims, string>;
  targetQuantity: string;
  boxesPerCarton: string; // '' = blank
  leeway: string;
  wallThickness: string;
  overhang: string;
  rotationMode: RotationMode;
  customOrientations: OrientationCode[];
  keepCartonsUpright: boolean;
  weights: Record<keyof WeightInputs, string>; // '' = blank
  minStability: MinStability;
  layerPattern: LayerPatternPref;
}

/**
 * Where a length or weight field's text came from: the text, the unit it was in, and its
 * exact value in inches or pounds (null when the text is not a number).
 */
export interface FieldOrigin {
  text: string;
  unit: Unit;
  canonical: number | null;
}

export interface CartonCandidate {
  counts: Record<ProductAxis, number>; // boxes along each product dimension
  inner: Record<ProductAxis, number>; // inches, along each product dimension
  outer: Record<ProductAxis, number>;
  boxesPerCarton: number;
  utilization: number; // product volume / outer volume, 0..1
  emptyVolume: number; // outer volume - product volume
}

export interface Block {
  x: number;
  y: number;
  cols: number;
  rows: number;
  rotated: boolean;
}

/**
 * How a layer's blocks are arranged: straight cuts, four blocks turning round a centre gap, or
 * placed by hand ('manual': one block of one carton, `cols: 1, rows: 1`, per carton).
 *
 * The blocks of a grid or pinwheel layer are in the layer's own frame and the layer is centred
 * in the usable footprint when placed. The blocks of a manual layer are where the user put
 * them: in the frame of the usable footprint (origin at its minimum corner), never re-centred,
 * and they may lie outside it (negative, or beyond its size) where cartons overhang.
 */
export type LayerPatternKind = 'grid' | 'pinwheel' | 'manual';

export interface LayerPattern {
  vertical: ProductAxis;
  height: number;
  cartonCount: number;
  blocks: Block[];
  extent: { x: number; y: number };
  /** Absent means 'grid' (straight-cut layers, and every layer stored before Round 4). */
  kind?: LayerPatternKind;
}

export interface Layer extends LayerPattern {
  z: number;
  /**
   * Turned half a turn (180°) about the centre of the usable footprint, so it interlocks with
   * the identical layer below. Its blocks are stored already turned. Absent means not turned.
   */
  turned?: boolean;
}

export type StabilityRating = 'good' | 'fair' | 'poor';
export type StabilityCheck = 'stackHeight' | 'cartonHeight' | 'support' | 'columns';

/**
 * One stability check over its caution or serious threshold. `value` is the measured ratio,
 * share (0..1) or number of layers in columns; `layer` (from 1) names the worst layer.
 */
export interface StabilityWarning {
  check: StabilityCheck;
  level: 'caution' | 'serious';
  value: number;
  layer?: number;
}

export interface Stability {
  rating: StabilityRating;
  warnings: StabilityWarning[];
}

export interface Layout {
  id: string;
  carton: CartonCandidate;
  layers: Layer[];
  totalCartons: number;
  totalProducts: number;
  /** Set when whole layers were removed from the top to keep under the maximum pallet weight. */
  weightTrim?: { layersRemoved: number };
  /** Set by the optimizer; absent on layouts stored before Round 4's stability rating. */
  stability?: Stability;
}

export interface ScoreBreakdown {
  quantity: number;
  utilization: number;
  space: number; // each 0..100
  quantityContribution: number;
  utilizationContribution: number;
  spaceContribution: number;
  total: number;
}

export interface RankedLayout {
  rank: number;
  layout: Layout;
  score: ScoreBreakdown;
  explanation: string;
}

export type EmptyReason =
  | 'NO_CARTON_FITS'
  | 'CARTON_EXCEEDS_PALLET'
  | 'NO_CARTON_WITH_COUNT'
  | 'OVER_WEIGHT'
  /** Nothing under the maximum weight was found, but the search was capped or stopped. */
  | 'WEIGHT_SEARCH_LIMITED';

export interface OptimizeResult {
  layouts: RankedLayout[];
  candidatesEvaluated: number;
  emptyReason: EmptyReason | null;
  truncated: boolean;
  /** Only with NO_CARTON_WITH_COUNT: the nearest achievable boxes per carton on each side. */
  nearestCounts?: { below: number | null; above: number | null };
  /**
   * Only with a minimum stability: no layout reached it, and `layouts` are the best-rated
   * ones found instead. Never set to false.
   */
  belowMinimum?: boolean;
  /**
   * Only with a minimum stability or a layer pattern other than Auto: the most products of any
   * layout before the settings were applied (what Auto would put first), when that is more
   * than the first layout here holds.
   */
  autoBestProducts?: number;
  /**
   * Only with layer pattern 'pinwheelOnly': no pinwheel layout was found, and `layouts` are
   * the straight-cut layouts Auto gives instead. Never set to false.
   */
  patternFallback?: boolean;
  /**
   * Only with `patternFallback` and a maximum pallet weight: the weight is why no pinwheel
   * layout is listed (pinwheel layouts were found and every one is over it, or a carton was
   * too heavy to look for one), so "no pinwheel exists" must not be said. Never set to false.
   */
  pinwheelOverWeight?: boolean;
}

export interface Preset {
  id: string;
  name: string;
  pallet: Dims;
  maxCarton: Dims;
  leeway: number;
  wallThickness: number;
  overhang: number;
  targetQuantity: number | null;
  boxesPerCarton: number | null;
  rotationMode: RotationMode;
  customOrientations: OrientationCode[];
  keepCartonsUpright: boolean;
  /** The product box weight stays with the product, so a preset never holds it. */
  weights: Omit<WeightInputs, 'productBox'>;
  minStability: MinStability;
  layerPattern: LayerPatternPref;
  advanced: Record<string, unknown>; // reserved for the later Advanced Optimization release
}

/** What a preset holds and applies: every input but the product and its box weight. */
export type PresetFields = Omit<Preset, 'id' | 'name' | 'advanced'>;

export interface Scenario {
  id: string;
  name: string;
  savedAt: string; // ISO timestamp
  inputs: Inputs;
  result: OptimizeResult;
  selectedIndex: number;
  analytics: Analytics | null;
}
