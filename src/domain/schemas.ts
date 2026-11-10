import { z } from 'zod';
import { PALLET_HEIGHT } from './constants';
import { analyticsSchema, optimizeResultSchema } from './resultSchemas';
import type { Inputs, InputsDraft, OrientationCode, Preset, Scenario } from './types';

const POSITIVE = 'Must be greater than 0';
const NEGATIVE = 'Cannot be negative';
const PALLET_HEIGHT_MSG = `Pallet height must be greater than ${PALLET_HEIGHT} inches`;
const TARGET_MSG = 'Enter a whole number of 1 or more';
const CUSTOM_MSG = 'Select at least one orientation';

const dimension = z.number({ error: 'Enter a number' }).gt(0, { error: POSITIVE });
const nonNegative = z.number({ error: 'Enter a number' }).min(0, { error: NEGATIVE });

const dims = z.object({ length: dimension, width: dimension, height: dimension });
const palletDims = z.object({
  length: dimension,
  width: dimension,
  height: z.number({ error: 'Enter a number' }).gt(PALLET_HEIGHT, { error: PALLET_HEIGHT_MSG }),
});

const orientation = z.enum(['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL']);

const inputsShape = {
  pallet: palletDims,
  product: dims,
  maxCarton: dims,
  targetQuantity: z.number().int({ error: TARGET_MSG }).min(1, { error: TARGET_MSG }).nullable(),
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
    rotationMode: inputsShape.rotationMode,
    customOrientations: inputsShape.customOrientations,
    keepCartonsUpright: inputsShape.keepCartonsUpright,
    advanced: z.record(z.string(), z.unknown()),
  })
  .refine((v) => v.rotationMode !== 'custom' || v.customOrientations.length > 0, {
    path: ['customOrientations'],
    error: CUSTOM_MSG,
  });

export const scenarioSchema: z.ZodType<Scenario> = z.object({
  id: z.string().min(1),
  name: z.string(),
  savedAt: z.string(),
  inputs: inputsSchema,
  result: optimizeResultSchema,
  selectedIndex: z.number().int().min(0),
  analytics: analyticsSchema.nullable(),
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
function parseNumber(raw: string): number | string {
  const text = raw.trim();
  if (text === '') return 'Required';
  if (!NUMERIC.test(text)) return 'Enter a number';
  return Number(text);
}

export function parseDraft(draft: InputsDraft): ParseResult {
  const errors: Record<string, string> = {};
  // Fields that failed text parsing get a harmless placeholder so the schema can still
  // validate every other field in the same pass.
  const num = (key: string, raw: string): number => {
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

  let targetQuantity: number | null = null;
  if (draft.targetQuantity.trim() !== '') {
    const parsed = parseNumber(draft.targetQuantity);
    if (typeof parsed === 'string')
      errors.targetQuantity = parsed === 'Required' ? TARGET_MSG : parsed;
    else targetQuantity = parsed;
  }

  const candidate: Inputs = {
    pallet: dimsOf('pallet'),
    product: dimsOf('product'),
    maxCarton: dimsOf('maxCarton'),
    targetQuantity,
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
