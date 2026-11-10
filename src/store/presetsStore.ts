import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { samplePresets } from '../data/samplePresets';
import { presetSchema } from '../domain/schemas';
import type { Inputs, Preset } from '../domain/types';
import { STORAGE_KEYS } from '../persistence/keys';
import { createDefaultRepository } from '../persistence/localStorageRepository';
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
    p.rotationMode,
    p.customOrientations,
    p.keepCartonsUpright,
  ];
}

/** Applies a preset to the current inputs; the product is never part of a preset. */
export function presetToInputs(p: Preset, current: Inputs): Inputs {
  return {
    product: current.product,
    pallet: { ...p.pallet },
    maxCarton: { ...p.maxCarton },
    leeway: p.leeway,
    wallThickness: p.wallThickness,
    overhang: p.overhang,
    targetQuantity: p.targetQuantity,
    rotationMode: p.rotationMode,
    customOrientations: [...p.customOrientations],
    keepCartonsUpright: p.keepCartonsUpright,
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
    const add = (preset: Preset) => {
      repo.save(preset);
      set((s) => ({ presets: [...s.presets, preset] }));
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
        set((s) => ({ presets: s.presets.map((p) => (p.id === id ? next : p)) }));
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
        set((s) => ({
          presets: s.presets.filter((p) => p.id !== id),
          activePresetId: s.activePresetId === id ? null : s.activePresetId,
        }));
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
    rotationMode: i.rotationMode,
    customOrientations: [...i.customOrientations],
    keepCartonsUpright: i.keepCartonsUpright,
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

export const usePresetsStore = Object.assign(
  <T>(selector: (s: PresetsState) => T): T => useStore(presetsStore, selector),
  presetsStore,
);
