import { z } from 'zod';
import { PALLET_HEIGHT } from './constants';
import { computeAnalytics, type Analytics } from '../engine/analytics/analytics';
import { analyticsSchema, optimizeResultSchema } from './resultSchemas';
import type { Inputs, InputsDraft, OrientationCode, Preset, Scenario } from './types';

const POSITIVE = 'Must be greater than 0';
const NEGATIVE = 'Cannot be negative';
/** In inches, as the engine is; the interface shows the limit in the display unit. */
export const PALLET_HEIGHT_MSG = `Pallet height must be greater than ${PALLET_HEIGHT} inches`;
const WHOLE_NUMBER_MSG = 'Enter a whole number of 1 or more';
const CUSTOM_MSG = 'Select at least one orientation';

const dimension = z.number({ error: 'Enter a number' }).gt(0, { error: POSITIVE });
const nonNegative = z.number({ error: 'Enter a number' }).min(0, { error: NEGATIVE });

const dims = z.object({ length: dimension, width: dimension, height: dimension });
const palletDims = z.object({
  length: dimension,
  width: dimension,
  height: z.number({ error: 'Enter a number' }).gt(PALLET_HEIGHT, { error: PALLET_HEIGHT_MSG }),
});

const wholeNumber = z.number().int({ error: WHOLE_NUMBER_MSG }).min(1, { error: WHOLE_NUMBER_MSG });

const orientation = z.enum(['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL']);

const inputsShape = {
  pallet: palletDims,
  product: dims,
  maxCarton: dims,
  targetQuantity: wholeNumber.nullable(),
  // Added in Round 2: data saved before it has no such key and reads as blank.
  boxesPerCarton: wholeNumber.nullable().default(null),
  leeway: nonNegative,
  wallThickness: nonNegative,
  overhang: nonNegative,
  rotationMode: z.enum(['full', 'upright', 'noSide', 'custom']),
  customOrientations: z.array(orientation),
  keepCartonsUpright: z.boolean(),
};

export const inputsSchema: z.ZodType<Inputs> = z
  .object(inputsShape)
  .refine((v) => v.rotationMode !== 'custom' || v.customOrientations.length > 0, {
    path: ['customOrientations'],
    error: CUSTOM_MSG,
  });

export const presetSchema: z.ZodType<Preset> = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    pallet: inputsShape.pallet,
    maxCarton: inputsShape.maxCarton,
    leeway: inputsShape.leeway,
    wallThickness: inputsShape.wallThickness,
    overhang: inputsShape.overhang,
    targetQuantity: inputsShape.targetQuantity,
    boxesPerCarton: inputsShape.boxesPerCarton,
    rotationMode: inputsShape.rotationMode,
    customOrientations: inputsShape.customOrientations,
    keepCartonsUpright: inputsShape.keepCartonsUpright,
    advanced: z.record(z.string(), z.unknown()),
  })
  .refine((v) => v.rotationMode !== 'custom' || v.customOrientations.length > 0, {
    path: ['customOrientations'],
    error: CUSTOM_MSG,
  });

export const scenarioSchema: z.ZodType<Scenario> = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    savedAt: z.string(),
    inputs: inputsSchema,
    result: optimizeResultSchema,
    selectedIndex: z.number().int().min(0),
    analytics: analyticsSchema.nullable(),
  })
  .transform((s): Scenario => {
    const a = s.analytics;
    if (a === null || (a.carton.counts && a.carton.layerOrientations)) {
      return { ...s, analytics: a as Analytics | null };
    }
    // Saved before the carton arrangement was part of the analytics: recompute from the
    // saved layout, which is the same pure calculation that produced the rest.
    const layout = s.result.layouts[s.selectedIndex]?.layout;
    return { ...s, analytics: layout ? computeAnalytics(layout, s.inputs) : null };
  });

export function draftFromInputs(inputs: Inputs): InputsDraft {
  const dimsDraft = (d: Inputs['pallet']) => ({
    length: String(d.length),
    width: String(d.width),
    height: String(d.height),
  });
  return {
    pallet: dimsDraft(inputs.pallet),
    product: dimsDraft(inputs.product),
    maxCarton: dimsDraft(inputs.maxCarton),
    targetQuantity: inputs.targetQuantity === null ? '' : String(inputs.targetQuantity),
    boxesPerCarton: inputs.boxesPerCarton === null ? '' : String(inputs.boxesPerCarton),
    leeway: String(inputs.leeway),
    wallThickness: String(inputs.wallThickness),
    overhang: String(inputs.overhang),
    rotationMode: inputs.rotationMode,
    customOrientations: [...inputs.customOrientations],
    keepCartonsUpright: inputs.keepCartonsUpright,
  };
}

export type ParseResult =
  { ok: true; inputs: Inputs } | { ok: false; errors: Record<string, string> };

const NUMERIC = /^\d+(\.\d+)?$|^\.\d+$/;

/** Parses typed text to a number, or returns an error message. */
export function parseNumber(raw: string): number | string {
  const text = raw.trim();
  if (text === '') return 'Required';
  if (!NUMERIC.test(text)) return 'Enter a number';
  return Number(text);
}

/**
 * Parses a draft. `known` gives exact values (inches, pounds) by field path for fields whose
 * text is shown in another unit; any other field's text is read as inches.
 */
export function parseDraft(
  draft: InputsDraft,
  known: Readonly<Record<string, number>> = {},
): ParseResult {
  const errors: Record<string, string> = {};
  // Fields that failed text parsing get a harmless placeholder so the schema can still
  // validate every other field in the same pass.
  const num = (key: string, raw: string): number => {
    const exact = known[key];
    if (exact !== undefined) return exact;
    const parsed = parseNumber(raw);
    if (typeof parsed === 'string') {
      errors[key] = parsed;
      return 1;
    }
    return parsed;
  };
  const dimsOf = (key: 'pallet' | 'product' | 'maxCarton') => ({
    length: num(`${key}.length`, draft[key].length),
    width: num(`${key}.width`, draft[key].width),
    height: num(`${key}.height`, draft[key].height),
  });

  // Optional whole numbers: blank is null; the schema checks whole and at least 1.
  const optionalWhole = (key: 'targetQuantity' | 'boxesPerCarton'): number | null => {
    if (draft[key].trim() === '') return null;
    const parsed = parseNumber(draft[key]);
    if (typeof parsed === 'string') {
      errors[key] = parsed === 'Required' ? WHOLE_NUMBER_MSG : parsed;
      return null;
    }
    return parsed;
  };
  const targetQuantity = optionalWhole('targetQuantity');
  const boxesPerCarton = optionalWhole('boxesPerCarton');

  const candidate: Inputs = {
    pallet: dimsOf('pallet'),
    product: dimsOf('product'),
    maxCarton: dimsOf('maxCarton'),
    targetQuantity,
    boxesPerCarton,
    leeway: num('leeway', draft.leeway),
    wallThickness: num('wallThickness', draft.wallThickness),
    overhang: num('overhang', draft.overhang),
    rotationMode: draft.rotationMode,
    customOrientations: draft.customOrientations as OrientationCode[],
    keepCartonsUpright: draft.keepCartonsUpright,
  };

  const result = inputsSchema.safeParse(candidate);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!(key in errors)) errors[key] = issue.message;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, inputs: candidate };
}
