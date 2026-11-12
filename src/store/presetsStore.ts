import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { samplePresets } from '../data/samplePresets';
import { presetSchema } from '../domain/schemas';
import type { Inputs, Preset } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';
import { createDefaultRepository, onStorageChange } from '../persistence/localStorageRepository';
import type { Repository } from '../persistence/repository';
import { useNoticesStore } from './noticesStore';

export interface PresetsState {
  presets: Preset[];
  activePresetId: string | null;
  create(name: string, from: Inputs): Preset;
  update(id: string, patch: Partial<Omit<Preset, 'id'>>): void;
  clone(id: string): Preset;
  remove(id: string): void;
  setActive(id: string | null): void;
  exportJson(ids?: string[]): string;
  importJson(text: string): { imported: number; skipped: number };
  /** Re-reads the stored presets, e.g. after another tab changed them. */
  refresh(): void;
}

const INVALID_FILE = 'That file is not a valid preset export.';

/** Every field a preset covers, in a fixed order, for value comparison. */
function covered(p: Preset | Inputs) {
  return [
    p.pallet,
    p.maxCarton,
    p.leeway,
    p.wallThickness,
    p.overhang,
    p.targetQuantity,
    p.boxesPerCarton,
    p.rotationMode,
    p.customOrientations,
    p.keepCartonsUpright,
    p.weights.maxPallet,
    p.weights.emptyCarton,
    p.weights.pallet,
    p.minStability,
  ];
}

/**
 * Applies a preset to the current inputs; the product, and so the product box weight, is
 * never part of a preset.
 */
export function presetToInputs(p: Preset, current: Inputs): Inputs {
  return {
    product: current.product,
    pallet: { ...p.pallet },
    maxCarton: { ...p.maxCarton },
    leeway: p.leeway,
    wallThickness: p.wallThickness,
    overhang: p.overhang,
    targetQuantity: p.targetQuantity,
    boxesPerCarton: p.boxesPerCarton,
    rotationMode: p.rotationMode,
    customOrientations: [...p.customOrientations],
    keepCartonsUpright: p.keepCartonsUpright,
    weights: { ...p.weights, productBox: current.weights.productBox },
    minStability: p.minStability,
  };
}

export function inputsMatchPreset(i: Inputs, p: Preset): boolean {
  return JSON.stringify(covered(i)) === JSON.stringify(covered(p));
}

export function createPresetsStore(
  repo: Repository<Preset>,
  notify: (message: string) => void,
): StoreApi<PresetsState> {
  return createStore<PresetsState>()((set, get) => {
    const find = (id: string) => get().presets.find((p) => p.id === id);
    // The repository merges each change with what other tabs stored, so read the list back.
    const sync = () => {
      const presets = repo.list();
      set((s) => ({
        presets,
        activePresetId: presets.some((p) => p.id === s.activePresetId) ? s.activePresetId : null,
      }));
    };
    const add = (preset: Preset) => {
      repo.save(preset);
      sync();
    };
    return {
      presets: repo.list(),
      activePresetId: null,
      create(name, from) {
        const preset: Preset = { ...presetFromInputs(from), id: crypto.randomUUID(), name };
        add(preset);
        return preset;
      },
      update(id, patch) {
        const existing = find(id);
        if (!existing) return;
        const next = { ...existing, ...patch, id };
        repo.save(next);
        sync();
      },
      clone(id) {
        const source = find(id);
        if (!source) throw new Error(`Unknown preset ${id}`);
        const copy: Preset = structuredClone({ ...source, name: `${source.name} (copy)` });
        copy.id = crypto.randomUUID();
        add(copy);
        return copy;
      },
      remove(id) {
        repo.remove(id);
        sync();
      },
      refresh() {
        repo.refresh?.();
        sync();
      },
      setActive: (id) => set({ activePresetId: id }),
      exportJson(ids) {
        const chosen = ids ? get().presets.filter((p) => ids.includes(p.id)) : get().presets;
        return JSON.stringify({ version: 1, presets: chosen }, null, 2);
      },
      importJson(text) {
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        const list = (data as { presets?: unknown } | null)?.presets;
        if (typeof data !== 'object' || data === null || !Array.isArray(list)) {
          notify(INVALID_FILE);
          return { imported: 0, skipped: 0 };
        }
        let skipped = 0;
        for (const item of list) {
          const parsed = presetSchema.safeParse(
            typeof item === 'object' && item !== null ? { ...item, id: crypto.randomUUID() } : item,
          );
          if (parsed.success) add(parsed.data);
          else skipped += 1;
        }
        return { imported: list.length - skipped, skipped };
      },
    };
  });
}

function presetFromInputs(i: Inputs): Omit<Preset, 'id' | 'name'> {
  return {
    pallet: { ...i.pallet },
    maxCarton: { ...i.maxCarton },
    leeway: i.leeway,
    wallThickness: i.wallThickness,
    overhang: i.overhang,
    targetQuantity: i.targetQuantity,
    boxesPerCarton: i.boxesPerCarton,
    rotationMode: i.rotationMode,
    customOrientations: [...i.customOrientations],
    keepCartonsUpright: i.keepCartonsUpright,
    weights: {
      maxPallet: i.weights.maxPallet,
      emptyCarton: i.weights.emptyCarton,
      pallet: i.weights.pallet,
    },
    minStability: i.minStability,
    advanced: {},
  };
}

const notify = (message: string) => useNoticesStore.getState().push(message);
const presetsStore = createPresetsStore(
  createDefaultRepository({
    key: STORAGE_KEYS.presets,
    schema: presetSchema,
    seed: samplePresets,
    onNotice: notify,
  }),
  notify,
);

onStorageChange(STORAGE_KEYS.presets, () => presetsStore.getState().refresh());

export const usePresetsStore = Object.assign(
  <T>(selector: (s: PresetsState) => T): T => useStore(presetsStore, selector),
  presetsStore,
);
