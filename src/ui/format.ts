/**
 * Every number the interface, the 3D view and the exports show goes through here (or through
 * engine/units). Values arrive in inches, pounds, cubic inches; the unit only changes what is
 * shown. Nothing else in src/ui, src/scene or src/export calls toFixed or writes a unit suffix.
 */
import { PALLET_HEIGHT } from '../domain/constants';
import { PALLET_HEIGHT_MSG } from '../domain/schemas';
import type { Dims } from '../domain/types';
import {
  areaLabel,
  formatArea,
  formatDims,
  formatLength,
  formatNumber,
  formatVolume,
  formatWeight,
  fromPounds,
  toPounds,
  volumeLabel,
  weightUnitFor,
  type Unit,
  type WeightUnit,
} from '../engine/units/units';

export {
  areaLabel,
  formatArea,
  formatDims,
  formatLength,
  formatVolume,
  formatWeight,
  fromPounds,
  toPounds,
  volumeLabel,
  weightUnitFor,
};
export type { Unit, WeightUnit };

/** The short label of a length unit, as used after numbers and in column titles. */
export function unitLabel(unit: Unit): Unit {
  return unit;
}

/** The short label of the weight unit that goes with `unit`. */
export function weightLabel(unit: Unit): WeightUnit {
  return weightUnitFor(unit);
}

/** A unit-free decimal (scores, weights of the score), 2 decimals by default. */
export function fmtDecimal(n: number, decimals = 2): string {
  return formatNumber(n, decimals);
}

/** A percentage with its sign: "84.21%". */
export function fmtPct(n: number, decimals = 2): string {
  return `${formatNumber(n, decimals)}%`;
}

/** A whole count: "500". */
export function fmtCount(n: number): string {
  return formatNumber(n, 0);
}

/** "12.00 in", "30.5 cm", "305 mm". */
export function lengthText(inches: number, unit: Unit): string {
  return `${formatLength(inches, unit)} ${unitLabel(unit)}`;
}

/** "12.00 × 8.00 × 4.00 in". */
export function dimsText(d: Dims, unit: Unit): string {
  return `${formatDims(d, unit)} ${unitLabel(unit)}`;
}

/** "50.00 × 42.00 in". */
export function pairText(x: number, y: number, unit: Unit): string {
  return `${formatLength(x, unit)} × ${formatLength(y, unit)} ${unitLabel(unit)}`;
}

/** "1728.00 in³", "28316.8 cm³". */
export function volumeText(cubicInches: number, unit: Unit): string {
  return `${formatVolume(cubicInches, unit)} ${volumeLabel(unit)}`;
}

/** "144.00 in²", "929.0 cm²". */
export function areaText(squareInches: number, unit: Unit): string {
  return `${formatArea(squareInches, unit)} ${areaLabel(unit)}`;
}

/** "10.0 lb", "4.5 kg". */
export function weightText(lb: number, unit: Unit): string {
  return `${formatWeight(lb, unit)} ${weightLabel(unit)}`;
}

/** "Limited by weight: 2 layers removed". */
export function weightTrimText(layersRemoved: number): string {
  return `Limited by weight: ${fmtCount(layersRemoved)} ${layersRemoved === 1 ? 'layer' : 'layers'} removed`;
}

/** "Room for 6 more cartons by weight". */
export function roomText(cartons: number): string {
  return `Room for ${fmtCount(cartons)} more ${cartons === 1 ? 'carton' : 'cartons'} by weight`;
}

/** A column or row title with its unit: "Carton (in)". */
export function withUnit(title: string, label: string): string {
  return `${title} (${label})`;
}

/** The pallet deck in words, as in "A 5-inch pallet" and "reduced by 5 inches". */
function palletDeck(unit: Unit): { adjective: string; amount: string } {
  if (unit === 'in')
    return { adjective: `${PALLET_HEIGHT}-inch`, amount: `${PALLET_HEIGHT} inches` };
  const n = String(Number(formatLength(PALLET_HEIGHT, unit)));
  return { adjective: `${n}-${unit}`, amount: `${n} ${unit}` };
}

/** The notice under the pallet height. */
export function palletNotice(unit: Unit): string {
  const { adjective, amount } = palletDeck(unit);
  return `A ${adjective} pallet is automatically included. Available stacking height has been reduced by ${amount}.`;
}

/** A validation message with any limit in it shown in the display unit. */
export function validationMessage(message: string, unit: Unit): string {
  if (message === PALLET_HEIGHT_MSG && unit !== 'in')
    return `Pallet height must be greater than ${palletDeck(unit).amount}`;
  return message;
}
