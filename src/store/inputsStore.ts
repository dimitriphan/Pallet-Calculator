import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { z } from 'zod';
import { DEFAULT_INPUTS } from '../domain/constants';
import { draftFromInputs, parseDraft, type ParseResult } from '../domain/schemas';
import type { Inputs, InputsDraft, OrientationCode, RotationMode } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';

export interface InputsState {
  draft: InputsDraft;
  parsed: ParseResult;
  setField(path: string, value: string): void;
  setRotationMode(m: RotationMode): void;
  toggleOrientation(c: OrientationCode): void;
  setKeepCartonsUpright(v: boolean): void;
  replaceInputs(i: Inputs): void;
  /** Writes the fields a preset covers (everything but the product) and leaves the product text as typed. */
  applyPreset(fields: Omit<Inputs, 'product'>): void;
  reset(): void;
}

const DIM_GROUPS = ['pallet', 'product', 'maxCarton'] as const;
const DIM_KEYS = ['length', 'width', 'height'] as const;
const SCALAR_FIELDS = ['targetQuantity', 'leeway', 'wallThickness', 'overhang'] as const;

const dimsDraftSchema = z.object({ length: z.string(), width: z.string(), height: z.string() });
const orientationSchema = z.enum(['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL']);
const draftShapeSchema = z.object({
  pallet: dimsDraftSchema,
  product: dimsDraftSchema,
  maxCarton: dimsDraftSchema,
  targetQuantity: z.string(),
  leeway: z.string(),
  wallThickness: z.string(),
  overhang: z.string(),
  rotationMode: z.enum(['full', 'upright', 'noSide', 'custom']),
  customOrientations: z.array(orientationSchema),
  keepCartonsUpright: z.boolean(),
});

function loadDraft(storage: Storage | undefined): InputsDraft {
  try {
    const raw = storage?.getItem(STORAGE_KEYS.inputs);
    if (raw) {
      const parsed = draftShapeSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Unreadable storage or bad JSON: the draft is a convenience, so use the defaults.
  }
  return draftFromInputs(DEFAULT_INPUTS);
}

function saveDraft(storage: Storage | undefined, draft: InputsDraft): void {
  try {
    storage?.setItem(STORAGE_KEYS.inputs, JSON.stringify(draft));
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

function withField(draft: InputsDraft, path: string, value: string): InputsDraft | null {
  const [group, key, ...rest] = path.split('.');
  if (rest.length > 0) return null;
  if (
    key !== undefined &&
    (DIM_GROUPS as readonly string[]).includes(group ?? '') &&
    (DIM_KEYS as readonly string[]).includes(key)
  ) {
    const g = group as (typeof DIM_GROUPS)[number];
    return { ...draft, [g]: { ...draft[g], [key]: value } };
  }
  if (key === undefined && (SCALAR_FIELDS as readonly string[]).includes(group ?? '')) {
    return { ...draft, [group as (typeof SCALAR_FIELDS)[number]]: value };
  }
  return null;
}

export function createInputsStore(
  storage: Storage | undefined = defaultStorage(),
): StoreApi<InputsState> {
  return createStore<InputsState>()((set, get) => {
    const apply = (draft: InputsDraft) => {
      saveDraft(storage, draft);
      set({ draft, parsed: parseDraft(draft) });
    };
    const initial = loadDraft(storage);
    return {
      draft: initial,
      parsed: parseDraft(initial),
      setField(path, value) {
        const next = withField(get().draft, path, value);
        if (next) apply(next);
      },
      setRotationMode: (rotationMode) => apply({ ...get().draft, rotationMode }),
      toggleOrientation(code) {
        const current = get().draft.customOrientations;
        const customOrientations = current.includes(code)
          ? current.filter((c) => c !== code)
          : [...current, code];
        apply({ ...get().draft, customOrientations });
      },
      setKeepCartonsUpright: (keepCartonsUpright) => apply({ ...get().draft, keepCartonsUpright }),
      replaceInputs: (i) => apply(draftFromInputs(i)),
      applyPreset(fields) {
        const covered = draftFromInputs({ ...fields, product: DEFAULT_INPUTS.product });
        apply({ ...covered, product: get().draft.product });
      },
      reset: () => apply(draftFromInputs(DEFAULT_INPUTS)),
    };
  });
}

const inputsStore = createInputsStore();

export const useInputsStore = Object.assign(
  <T>(selector: (s: InputsState) => T): T => useStore(inputsStore, selector),
  inputsStore,
);
