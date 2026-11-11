import type { Dims } from '../../domain/types';

/**
 * Display units. The engine, stores and saved data are always inches and pounds; these
 * functions convert and format only at the display edge.
 */
export type Unit = 'in' | 'cm' | 'mm';
export type WeightUnit = 'lb' | 'kg';

const INCHES_PER: Record<Unit, number> = { in: 1, cm: 2.54, mm: 25.4 };
const POUNDS_PER_KG = 2.2046226218;

/** Decimals shown for a length in each unit. */
export const LENGTH_DECIMALS: Record<Unit, number> = { in: 2, cm: 1, mm: 0 };
/** Decimals shown for a weight, in pounds or kilograms. */
export const WEIGHT_DECIMALS = 1;
/** Areas and volumes use in² / in³ with inches and cm² / cm³ otherwise (mm³ numbers are unreadable). */
const AREA_VOLUME_DECIMALS: Record<Unit, number> = { in: 2, cm: 1, mm: 1 };
const CM_PER_INCH = 2.54;

export function toInches(value: number, unit: Unit): number {
  return value / INCHES_PER[unit];
}

export function fromInches(inches: number, unit: Unit): number {
  return inches * INCHES_PER[unit];
}

/** Pounds with inches, kilograms with centimetres or millimetres. */
export function weightUnitFor(unit: Unit): WeightUnit {
  return unit === 'in' ? 'lb' : 'kg';
}

export function toPounds(value: number, wu: WeightUnit): number {
  return wu === 'lb' ? value : value * POUNDS_PER_KG;
}

export function fromPounds(lb: number, wu: WeightUnit): number {
  return wu === 'lb' ? lb : lb / POUNDS_PER_KG;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/** A length given in inches, as a number in `unit` at that unit's precision. */
export function formatLength(inches: number, unit: Unit = 'in'): string {
  return formatNumber(fromInches(inches, unit), LENGTH_DECIMALS[unit]);
}

export function formatDims(d: Dims, unit: Unit = 'in'): string {
  return `${formatLength(d.length, unit)} × ${formatLength(d.width, unit)} × ${formatLength(d.height, unit)}`;
}

/** A weight given in pounds, as a number in the weight unit that goes with `unit`. */
export function formatWeight(lb: number, unit: Unit): string {
  return formatNumber(fromPounds(lb, weightUnitFor(unit)), WEIGHT_DECIMALS);
}

/** A volume given in cubic inches, as a number in the unit of volumeLabel(unit). */
export function formatVolume(cubicInches: number, unit: Unit): string {
  const factor = unit === 'in' ? 1 : CM_PER_INCH ** 3;
  return formatNumber(cubicInches * factor, AREA_VOLUME_DECIMALS[unit]);
}

export function volumeLabel(unit: Unit): 'in³' | 'cm³' {
  return unit === 'in' ? 'in³' : 'cm³';
}

/** An area given in square inches, as a number in the unit of areaLabel(unit). */
export function formatArea(squareInches: number, unit: Unit): string {
  const factor = unit === 'in' ? 1 : CM_PER_INCH ** 2;
  return formatNumber(squareInches * factor, AREA_VOLUME_DECIMALS[unit]);
}

export function areaLabel(unit: Unit): 'in²' | 'cm²' {
  return unit === 'in' ? 'in²' : 'cm²';
}
