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

export interface LayerPattern {
  vertical: ProductAxis;
  height: number;
  cartonCount: number;
  blocks: Block[];
  extent: { x: number; y: number };
}

export interface Layer extends LayerPattern {
  z: number;
}

export interface Layout {
  id: string;
  carton: CartonCandidate;
  layers: Layer[];
  totalCartons: number;
  totalProducts: number;
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

export type EmptyReason = 'NO_CARTON_FITS' | 'CARTON_EXCEEDS_PALLET' | 'NO_CARTON_WITH_COUNT';

export interface OptimizeResult {
  layouts: RankedLayout[];
  candidatesEvaluated: number;
  emptyReason: EmptyReason | null;
  truncated: boolean;
  /** Only with NO_CARTON_WITH_COUNT: the nearest achievable boxes per carton on each side. */
  nearestCounts?: { below: number | null; above: number | null };
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
  advanced: Record<string, unknown>; // reserved for the later Advanced Optimization release
}

export interface Scenario {
  id: string;
  name: string;
  savedAt: string; // ISO timestamp
  inputs: Inputs;
  result: OptimizeResult;
  selectedIndex: number;
  analytics: Analytics | null;
}
