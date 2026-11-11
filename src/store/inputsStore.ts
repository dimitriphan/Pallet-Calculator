import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { z } from 'zod';
import { DEFAULT_INPUTS } from '../domain/constants';
import type { ParseResult } from '../domain/schemas';
import type {
  Inputs,
  InputsDraft,
  OrientationCode,
  PresetFields,
  RotationMode,
} from '../domain/types';
import type { Unit } from '../engine/units/units';
import { STORAGE_KEYS } from '../persistence/keys';
import { usePrefsStore } from './prefsStore';
import {
  defaultDraft,
  draftInUnit,
  fieldValue,
  isNumericPath,
  NUMERIC_FIELDS,
  originsFor,
  parseInUnit,
  switchUnit,
  typedOrigin,
  withDraftText,
  type FieldOrigins,
  type NumericPath,
} from './unitFields';

export interface InputsState {
  /** Every numeric field's text, shown in `unit` (counts as typed). */
  draft: InputsDraft;
  /** The draft in inches and pounds; deep-equal before and after setUnit. */
  parsed: ParseResult;
  /** The display unit the draft is shown in. */
  unit: Unit;
  /** Where each length and weight field's text came from; see unitFields.ts. */
  origins: FieldOrigins;
  /** Sets a numeric field's text, read in the current unit. Unknown paths are ignored. */
  setField(path: string, value: string): void;
  /** Shows the draft in another unit. Never changes `parsed`. */
  setUnit(u: Unit): void;
  setRotationMode(m: RotationMode): void;
  toggleOrientation(c: OrientationCode): void;
  setKeepCartonsUpright(v: boolean): void;
  replaceInputs(i: Inputs): void;
  /**
   * Writes the fields a preset covers (everything but the product and its box weight) and
   * leaves the product and box weight text as typed.
   */
  applyPreset(fields: PresetFields): void;
  reset(): void;
}

export interface InputsStoreOptions {
  /** The unit to show when nothing is remembered; a remembered draft keeps its own unit. */
  unit?: Unit;
}

const dimsDraftSchema = z.object({ length: z.string(), width: z.string(), height: z.string() });
const orientationSchema = z.enum(['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL']);
const unitSchema = z.enum(['in', 'cm', 'mm']);
const originSchema = z.object({
  text: z.string(),
  unit: unitSchema,
  canonical: z.number().nullable(),
});
const draftShapeSchema = z.object({
  pallet: dimsDraftSchema,
  product: dimsDraftSchema,
  maxCarton: dimsDraftSchema,
  targetQuantity: z.string(),
  // Added in Round 2: a draft remembered before it has no such key and reads as blank.
  boxesPerCarton: z.string().default(''),
  leeway: z.string(),
  wallThickness: z.string(),
  overhang: z.string(),
  rotationMode: z.enum(['full', 'upright', 'noSide', 'custom']),
  customOrientations: z.array(orientationSchema),
  keepCartonsUpright: z.boolean(),
  // Added in Round 4: a draft remembered before weights has none; loadSnapshot fills them in.
  weights: z
    .object({
      productBox: z.string(),
      maxPallet: z.string(),
      emptyCarton: z.string(),
      pallet: z.string(),
    })
    .optional(),
});
// Added in Round 4: a draft remembered before units existed is in inches, with no origins.
const storedSchema = draftShapeSchema.extend({
  unit: unitSchema.catch('in').default('in'),
  origins: z.record(z.string(), z.unknown()).catch({}).default({}),
});

const WEIGHT_PATHS = (Object.keys(NUMERIC_FIELDS) as NumericPath[]).filter((p) =>
  p.startsWith('weights.'),
);
/** Fields that belong to the product, which a preset never covers. */
const PRODUCT_PATHS: NumericPath[] = [
  'product.length',
  'product.width',
  'product.height',
  'weights.productBox',
];

interface Snapshot {
  draft: InputsDraft;
  unit: Unit;
  origins: FieldOrigins;
}

function loadSnapshot(storage: Storage | undefined, fallbackUnit: Unit): Snapshot {
  try {
    const raw = storage?.getItem(STORAGE_KEYS.inputs);
    if (raw) {
      const parsed = storedSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        const { unit, origins: storedOrigins, weights, ...rest } = parsed.data;
        // Keep only well-formed origins; originsFor() drops any that do not match the text.
        const origins: FieldOrigins = {};
        for (const [path, o] of Object.entries(storedOrigins)) {
          const ok = originSchema.safeParse(o);
          if (ok.success) origins[path] = ok.data;
        }
        // Remembered before weights: the default weights, shown in the draft's own unit.
        let draftWeights = weights;
        if (draftWeights === undefined) {
          const defaults = defaultDraft(unit);
          draftWeights = defaults.draft.weights;
          for (const path of WEIGHT_PATHS) origins[path] = defaults.origins[path];
        }
        const draft: InputsDraft = { ...rest, weights: draftWeights };
        return { draft, unit, origins: originsFor(draft, origins, unit) };
      }
    }
  } catch {
    // Unreadable storage or bad JSON: the draft is a convenience, so use the defaults.
  }
  return { ...defaultDraft(fallbackUnit), unit: fallbackUnit };
}

function saveSnapshot(storage: Storage | undefined, snap: Snapshot): void {
  try {
    storage?.setItem(
      STORAGE_KEYS.inputs,
      JSON.stringify({ ...snap.draft, unit: snap.unit, origins: snap.origins }),
    );
  } catch {
    // Quota or blocked storage: ignore.
  }
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Same JSON means the same numbers: JSON keeps every double exactly. */
function sameParse(a: ParseResult, b: ParseResult): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createInputsStore(
  storage: Storage | undefined = defaultStorage(),
  options: InputsStoreOptions = {},
): StoreApi<InputsState> {
  return createStore<InputsState>()((set, get) => {
    const apply = (next: Partial<Snapshot>) => {
      const { draft, unit, origins } = { ...get(), ...next };
      saveSnapshot(storage, { draft, unit, origins });
      const parsed = parseInUnit(draft, origins, unit);
      // Keep the same object when nothing changed, so nothing downstream recalculates.
      set({
        draft,
        unit,
        origins,
        parsed: sameParse(parsed, get().parsed) ? get().parsed : parsed,
      });
    };
    /** Writes exact values in the current unit, keeping the other fields. */
    const write = (inputs: Inputs, keepProduct: boolean) => {
      const { unit, draft: old, origins: oldOrigins } = get();
      const { draft, origins } = draftInUnit(inputs, unit);
      if (!keepProduct) {
        apply({ draft, origins });
        return;
      }
      const kept: FieldOrigins = { ...origins };
      for (const path of PRODUCT_PATHS) kept[path] = oldOrigins[path];
      apply({
        draft: {
          ...draft,
          product: old.product,
          weights: { ...draft.weights, productBox: old.weights.productBox },
        },
        origins: kept,
      });
    };
    const initial = loadSnapshot(storage, options.unit ?? 'in');
    return {
      ...initial,
      parsed: parseInUnit(initial.draft, initial.origins, initial.unit),
      setField(path, value) {
        if (!isNumericPath(path)) return;
        const { draft, origins, unit } = get();
        const kind = NUMERIC_FIELDS[path];
        apply({
          draft: withDraftText(draft, path, value),
          origins:
            kind === 'count' ? origins : { ...origins, [path]: typedOrigin(kind, value, unit) },
        });
      },
      setUnit(to) {
        const { draft, origins, unit } = get();
        if (to === unit) return;
        apply({ ...switchUnit(draft, origins, unit, to), unit: to });
      },
      setRotationMode: (rotationMode) => apply({ draft: { ...get().draft, rotationMode } }),
      toggleOrientation(code) {
        const current = get().draft.customOrientations;
        const customOrientations = current.includes(code)
          ? current.filter((c) => c !== code)
          : [...current, code];
        apply({ draft: { ...get().draft, customOrientations } });
      },
      setKeepCartonsUpright: (keepCartonsUpright) =>
        apply({ draft: { ...get().draft, keepCartonsUpright } }),
      replaceInputs: (i) => write(i, false),
      applyPreset: (fields) =>
        write(
          {
            ...fields,
            product: DEFAULT_INPUTS.product,
            weights: { ...fields.weights, productBox: null },
          },
          true,
        ),
      reset: () => write(DEFAULT_INPUTS, false),
    };
  });
}

/** The exact value (inches, pounds; counts as typed) of one numeric field, or null. */
export function inputFieldValue(s: InputsState, path: NumericPath): number | null {
  return fieldValue(s.draft, s.origins, s.unit, path);
}

// With nothing remembered, start in the unit the preferences hold.
const inputsStore = createInputsStore(defaultStorage(), { unit: usePrefsStore.getState().unit });

export const useInputsStore = Object.assign(
  <T>(selector: (s: InputsState) => T): T => useStore(inputsStore, selector),
  inputsStore,
);
