/**
 * The manual layouts the user has saved (spec 6.4 to 6.6), stored in the browser like presets,
 * and what each one comes to under the current inputs: its layout, flags and whether it is out
 * of date. Building one layout is quick, so builds are redone at once whenever the valid inputs
 * or the stored list change; nothing here waits on the search.
 */
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Inputs, RankedLayout } from '../domain/types';
import {
  buildManualLayout,
  type ManualBuild,
  type ManualFlag,
  type ManualLayoutSpec,
} from '../engine/manual/build';
import type { Repository } from '../persistence/repository';

/** What marks a selected layout as a manual one; see selection.ts. */
export interface ManualMarker {
  /** The stored layout's id (its layout's id is this with the `manual:` prefix). */
  id: string;
  name: string;
  flags: ManualFlag[];
  status: 'current' | 'outOfDate';
}

/**
 * A manual layout in the shape screens and exports take a selected layout. It was not ranked or
 * scored: `rank` is 0, every score part 0 and the explanation empty, and none of them may be
 * shown; `manual` says so.
 */
export interface ManualRanked extends RankedLayout {
  manual: ManualMarker;
}

/** One saved layout with what it comes to under the store's inputs. */
export interface ManualEntry {
  spec: ManualLayoutSpec;
  build: ManualBuild;
  ranked: ManualRanked;
}

/** What the editor hands over to be saved: everything but the id and the name. */
export type ManualLayoutDraft = Pick<
  ManualLayoutSpec,
  'design' | 'cartons' | 'upperLayers' | 'madeFor'
>;

export interface ManualLayoutsState {
  /** The saved layouts as stored, in the order saved. */
  specs: ManualLayoutSpec[];
  /**
   * The saved layouts built under `inputs`, in the same order. Empty until valid inputs have
   * been given. The objects are kept from one change to the next where nothing about a layout
   * changed.
   */
  entries: ManualEntry[];
  /** The last valid inputs given; what `entries` were built with. */
  inputs: Inputs | null;
  /** True while the current inputs are invalid: `entries` are from the last valid ones. */
  stale: boolean;
  /** "Manual N" with the lowest number no saved layout is named with. */
  nextName(): string;
  /** Saves a new layout. A blank or missing name gives the next default name. */
  save(draft: ManualLayoutDraft, name?: string): ManualLayoutSpec;
  /** Saves over layout `id`, keeping its name unless one is given. Null when there is none. */
  update(id: string, draft: ManualLayoutDraft, name?: string): ManualLayoutSpec | null;
  /** Saves a copy under a new id while editing a saved layout; otherwise as `save`. */
  saveAsNew(draft: ManualLayoutDraft, name?: string): ManualLayoutSpec;
  /** Renames a layout; a blank name is ignored. */
  rename(id: string, name: string): void;
  /** A copy named "<name> (copy)". Null when there is no such layout. */
  duplicate(id: string): ManualLayoutSpec | null;
  remove(id: string): void;
  /** Puts `specs` in place of every saved layout (loading a scenario). */
  replaceAll(specs: ManualLayoutSpec[]): void;
  /** The current inputs when they are valid, or null while they are not. */
  setInputs(inputs: Inputs | null): void;
  /** Re-reads the stored layouts, e.g. after another tab changed them. */
  refresh(): void;
}

export interface ManualLayoutsOptions {
  /** Called with the ids now saved after every change to the list (this tab's or another's). */
  onListChange?: (ids: string[]) => void;
  newId?: () => string;
}

const DEFAULT_NAME = /^Manual ([1-9]\d*)$/;

/** "Manual N" with the lowest N (from 1) that none of `names` uses. */
export function nextManualName(names: readonly string[]): string {
  const used = new Set<number>();
  for (const name of names) {
    const m = DEFAULT_NAME.exec(name.trim());
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `Manual ${n}`;
}

const NO_SCORE = {
  quantity: 0,
  utilization: 0,
  space: 0,
  quantityContribution: 0,
  utilizationContribution: 0,
  spaceContribution: 0,
  total: 0,
};

function entryOf(spec: ManualLayoutSpec, inputs: Inputs): ManualEntry | null {
  let build: ManualBuild;
  try {
    build = buildManualLayout(spec, inputs);
  } catch {
    // Stored data that passes the schema but cannot be built is left out, not fatal.
    return null;
  }
  return {
    spec,
    build,
    ranked: {
      rank: 0,
      layout: build.layout,
      score: NO_SCORE,
      explanation: '',
      manual: { id: spec.id, name: spec.name, flags: build.flags, status: build.status },
    },
  };
}

export function createManualLayoutsStore(
  repo: Repository<ManualLayoutSpec>,
  opts: ManualLayoutsOptions = {},
): StoreApi<ManualLayoutsState> {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  return createStore<ManualLayoutsState>()((set, get) => {
    // Entries by id with the stored text and inputs they were built from, so a layout that did
    // not change keeps its objects (and nothing drawn from them is redone).
    let cache = new Map<string, { key: string; inputs: Inputs; entry: ManualEntry | null }>();

    const build = (specs: ManualLayoutSpec[], inputs: Inputs | null): ManualEntry[] => {
      if (!inputs) return [];
      const next: typeof cache = new Map();
      const entries: ManualEntry[] = [];
      for (const spec of specs) {
        const key = JSON.stringify(spec);
        const kept = cache.get(spec.id);
        const hit =
          kept && kept.key === key && kept.inputs === inputs
            ? kept
            : { key, inputs, entry: entryOf(spec, inputs) };
        next.set(spec.id, hit);
        if (hit.entry) entries.push(hit.entry);
      }
      cache = next;
      return entries;
    };

    // The repository merges each change with what other tabs stored, so read the list back.
    const sync = () => {
      const specs = repo.list();
      set({ specs, entries: build(specs, get().inputs) });
      opts.onListChange?.(specs.map((s) => s.id));
    };
    const find = (id: string) => get().specs.find((s) => s.id === id);
    const named = (name: string | undefined, fallback: () => string) => {
      const trimmed = name?.trim() ?? '';
      return trimmed === '' ? fallback() : trimmed;
    };
    const fields = (draft: ManualLayoutDraft): ManualLayoutDraft =>
      structuredClone({
        design: draft.design,
        cartons: draft.cartons,
        upperLayers: draft.upperLayers,
        madeFor: draft.madeFor,
      });
    const add = (draft: ManualLayoutDraft, name: string | undefined): ManualLayoutSpec => {
      const spec = { id: newId(), name: named(name, get().nextName), ...fields(draft) };
      repo.save(spec);
      sync();
      return spec;
    };

    const specs = repo.list();
    return {
      specs,
      entries: [],
      inputs: null,
      stale: false,
      nextName: () => nextManualName(get().specs.map((s) => s.name)),
      save: (draft, name) => add(draft, name),
      saveAsNew: (draft, name) => add(draft, name),
      update(id, draft, name) {
        const existing = find(id);
        if (!existing) return null;
        const spec = { id, name: named(name, () => existing.name), ...fields(draft) };
        repo.save(spec);
        sync();
        return spec;
      },
      rename(id, name) {
        const existing = find(id);
        const trimmed = name.trim();
        if (!existing || trimmed === '') return;
        repo.save({ ...existing, name: trimmed });
        sync();
      },
      duplicate(id) {
        const source = find(id);
        if (!source) return null;
        const copy = { ...structuredClone(source), id: newId(), name: `${source.name} (copy)` };
        repo.save(copy);
        sync();
        return copy;
      },
      remove(id) {
        repo.remove(id);
        sync();
      },
      replaceAll(next) {
        const keep = new Set(next.map((s) => s.id));
        for (const s of repo.list()) if (!keep.has(s.id)) repo.remove(s.id);
        for (const s of next) repo.save(structuredClone(s));
        sync();
      },
      setInputs(inputs) {
        if (inputs === null) {
          if (!get().stale) set({ stale: true });
          return;
        }
        if (inputs === get().inputs) {
          if (get().stale) set({ stale: false });
          return;
        }
        set({ inputs, stale: false, entries: build(get().specs, inputs) });
      },
      refresh() {
        repo.refresh?.();
        sync();
      },
    };
  });
}

/** Binds a vanilla store as a hook that is also the store, like the other app stores. */
export function asHook<S>(store: StoreApi<S>) {
  return Object.assign(<T>(selector: (s: S) => T): T => useStore(store, selector), store);
}
