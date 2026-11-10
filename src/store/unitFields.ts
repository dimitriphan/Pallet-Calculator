/**
 * The field rule behind unit switching. Every numeric draft field is shown in the current
 * unit, while what the optimizer gets is always inches (lengths) or pounds (weights).
 *
 * Beside each length or weight field's text the store keeps an origin: the text it came from,
 * the unit that text was in, and its exact canonical value. A field whose text is still the
 * text the store would write for that origin parses to the canonical value exactly, so a
 * display switch never changes the load; switching back to the origin's unit restores the
 * text as it was typed.
 */
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs, parseDraft, parseNumber, type ParseResult } from '../domain/schemas';
import type { FieldOrigin, Inputs, InputsDraft } from '../domain/types';
import {
  formatNumber,
  fromInches,
  fromPounds,
  LENGTH_DECIMALS,
  toInches,
  toPounds,
  WEIGHT_DECIMALS,
  weightUnitFor,
  type Unit,
} from '../engine/units/units';

export type FieldKind = 'length' | 'weight' | 'count';

/**
 * Every numeric draft field, by path, with what it measures. Lengths are canonical in inches,
 * weights in pounds; counts are never converted. Adding a weight field is one line here.
 */
export const NUMERIC_FIELDS = {
  'pallet.length': 'length',
  'pallet.width': 'length',
  'pallet.height': 'length',
  'product.length': 'length',
  'product.width': 'length',
  'product.height': 'length',
  'maxCarton.length': 'length',
  'maxCarton.width': 'length',
  'maxCarton.height': 'length',
  targetQuantity: 'count',
  boxesPerCarton: 'count',
  leeway: 'length',
  wallThickness: 'length',
  overhang: 'length',
} as const satisfies Record<string, FieldKind>;

export type NumericPath = keyof typeof NUMERIC_FIELDS;
/** Origins of the length and weight fields, by path. */
export type FieldOrigins = Partial<Record<string, FieldOrigin>>;

const CONVERTED_PATHS = (Object.keys(NUMERIC_FIELDS) as NumericPath[]).filter(
  (p) => NUMERIC_FIELDS[p] !== 'count',
);

export function isNumericPath(path: string): path is NumericPath {
  return Object.prototype.hasOwnProperty.call(NUMERIC_FIELDS, path);
}

function toCanonical(kind: FieldKind, value: number, unit: Unit): number {
  if (kind === 'length') return toInches(value, unit);
  if (kind === 'weight') return toPounds(value, weightUnitFor(unit));
  return value;
}

function fromCanonical(kind: FieldKind, value: number, unit: Unit): number {
  if (kind === 'length') return fromInches(value, unit);
  if (kind === 'weight') return fromPounds(value, weightUnitFor(unit));
  return value;
}

/**
 * The text the store writes for a canonical value: the display precision of the unit, without
 * trailing zeros (so the defaults read "50" and "0.5" in inches, as they always have).
 */
export function fieldText(kind: FieldKind, canonical: number, unit: Unit): string {
  const decimals =
    kind === 'length' ? LENGTH_DECIMALS[unit] : kind === 'weight' ? WEIGHT_DECIMALS : 0;
  const shown = fromCanonical(kind, canonical, unit);
  return kind === 'count' ? String(shown) : String(Number(formatNumber(shown, decimals)));
}

/** Origin of text the user typed in `unit`. */
export function typedOrigin(kind: FieldKind, text: string, unit: Unit): FieldOrigin {
  const n = parseNumber(text);
  return { text, unit, canonical: typeof n === 'number' ? toCanonical(kind, n, unit) : null };
}

/** Origin of a stored canonical value the store writes in `unit`. */
export function writtenOrigin(kind: FieldKind, canonical: number, unit: Unit): FieldOrigin {
  return { text: fieldText(kind, canonical, unit), unit, canonical };
}

/** The text the store would show for an origin in `unit`. */
export function originText(kind: FieldKind, origin: FieldOrigin, unit: Unit): string {
  if (origin.unit === unit || origin.canonical === null) return origin.text;
  return fieldText(kind, origin.canonical, unit);
}

function readPath(root: unknown, path: string): unknown {
  let at: unknown = root;
  for (const key of path.split('.')) {
    if (typeof at !== 'object' || at === null) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/** The draft text of a numeric field. */
export function draftText(draft: InputsDraft, path: NumericPath): string {
  const v = readPath(draft, path);
  return typeof v === 'string' ? v : '';
}

/** A copy of the draft with one numeric field's text replaced. */
export function withDraftText(draft: InputsDraft, path: NumericPath, text: string): InputsDraft {
  const [head, key] = path.split('.') as [string, string | undefined];
  const root = draft as unknown as Record<string, unknown>;
  if (key === undefined) return { ...root, [head]: text } as unknown as InputsDraft;
  const group = root[head] as Record<string, unknown>;
  return { ...root, [head]: { ...group, [key]: text } } as unknown as InputsDraft;
}

/** An origin that matches the field's current text, re-deriving it from the text if needed. */
function currentOrigin(
  draft: InputsDraft,
  origins: FieldOrigins,
  path: NumericPath,
  unit: Unit,
): FieldOrigin {
  const kind = NUMERIC_FIELDS[path];
  const text = draftText(draft, path);
  const o = origins[path];
  return o && originText(kind, o, unit) === text ? o : typedOrigin(kind, text, unit);
}

/** Origins for every length and weight field, consistent with the draft's text in `unit`. */
export function originsFor(draft: InputsDraft, origins: FieldOrigins, unit: Unit): FieldOrigins {
  const out: FieldOrigins = {};
  for (const path of CONVERTED_PATHS) out[path] = currentOrigin(draft, origins, path, unit);
  return out;
}

/** Canonical (inch or pound) values of every length and weight field that parses. */
export function canonicalValues(
  draft: InputsDraft,
  origins: FieldOrigins,
  unit: Unit,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const path of CONVERTED_PATHS) {
    const v = currentOrigin(draft, origins, path, unit).canonical;
    if (v !== null) out[path] = v;
  }
  return out;
}

/** Parses a draft shown in `unit` to inches and pounds. */
export function parseInUnit(draft: InputsDraft, origins: FieldOrigins, unit: Unit): ParseResult {
  return parseDraft(draft, canonicalValues(draft, origins, unit));
}

/** The canonical value of one field (counts as typed), or null when it does not parse. */
export function fieldValue(
  draft: InputsDraft,
  origins: FieldOrigins,
  unit: Unit,
  path: NumericPath,
): number | null {
  const kind = NUMERIC_FIELDS[path];
  if (kind !== 'count') return currentOrigin(draft, origins, path, unit).canonical;
  const n = parseNumber(draftText(draft, path));
  return typeof n === 'number' ? n : null;
}

/** A draft showing `inputs` in `unit`, with origins holding the exact values. */
export function draftInUnit(
  inputs: Inputs,
  unit: Unit,
): { draft: InputsDraft; origins: FieldOrigins } {
  let draft = draftFromInputs(inputs);
  const origins: FieldOrigins = {};
  for (const path of CONVERTED_PATHS) {
    const value = readPath(inputs, path);
    if (typeof value !== 'number') continue;
    const o = writtenOrigin(NUMERIC_FIELDS[path], value, unit);
    origins[path] = o;
    draft = withDraftText(draft, path, o.text);
  }
  return { draft, origins };
}

/** The default inputs shown in `unit`. */
export function defaultDraft(unit: Unit): { draft: InputsDraft; origins: FieldOrigins } {
  return draftInUnit(DEFAULT_INPUTS, unit);
}

/**
 * The draft shown in `to` instead of `from`. A field that parses gets its origin's text when
 * `to` is the unit it was typed in, else its exact value at the precision of `to`; a field
 * that does not parse keeps its text. Origins are kept.
 */
export function switchUnit(
  draft: InputsDraft,
  origins: FieldOrigins,
  from: Unit,
  to: Unit,
): { draft: InputsDraft; origins: FieldOrigins } {
  const kept = originsFor(draft, origins, from);
  let next = draft;
  for (const path of CONVERTED_PATHS) {
    const o = kept[path];
    if (o && o.canonical !== null)
      next = withDraftText(next, path, originText(NUMERIC_FIELDS[path], o, to));
  }
  return { draft: next, origins: kept };
}
