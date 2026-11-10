import type { Dims } from '../../domain/types';

export type Unit = 'in' | 'cm' | 'mm';

const INCHES_PER: Record<Unit, number> = { in: 1, cm: 2.54, mm: 25.4 };

export function toInches(value: number, unit: Unit): number {
  return value / INCHES_PER[unit];
}

export function fromInches(inches: number, unit: Unit): number {
  return inches * INCHES_PER[unit];
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function formatLength(inches: number, unit: Unit = 'in'): string {
  return formatNumber(fromInches(inches, unit));
}

export function formatDims(d: Dims): string {
  return `${formatNumber(d.length)} × ${formatNumber(d.width)} × ${formatNumber(d.height)}`;
}
