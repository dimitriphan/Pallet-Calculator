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
  isValidSpec,
  toPalletFrame,
  type MadeFor,
  type ManualBuild,
  type ManualFlag,
  type ManualLayoutSpec,
  type UpperLayers,
} from '../engine/manual/build';
import type { Repository } from '../persistence/repository';

/** What marks a selected layout as a manual one; see selection.ts. */
export interface ManualMarker {
  /** The stored layout's id (its layout's id is this with the `manual:` prefix). */
  id: string;
  name: string;
  flags: ManualFlag[];
  status: 'current' | 'outOfDate';
  /** What the upper layers do, and the inputs the carton was made for: for the exports. */
  upperLayers: UpperLayers;
  /**
   * True when the choice is 'alternate' and it changes nothing: the layer is the same after a
   * half turn, so no layer is turned. Wherever the choice is reported, this is said with it.
   */
  upperLayersNoEffect: boolean;
  madeFor: MadeFor;
}

/**
 * A manual layout in the shape screens and exports take a selected layout. It was not ranked or
 * scored: `rank` is 0, every score part 0 and the explanation empty, and none of them may be
 * shown; `manual` says so. The exports write null for them (see exportData.ts).
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
  'design' | 'cartons' | 'frame' | 'upperLayers' | 'madeFor'
>;

/** What loading a scenario's manual layouts did (see `addFromScenario`). */
export interface ScenarioMerge {
  /** Layouts added: new ones, and copies of ones that differ from the layout of the same id. */
  added: number;
  /** Layouts already present exactly as the scenario holds them: nothing was done. */
  skipped: number;
  /** Layouts that could not be written to the browser's storage. */
  notStored: number;
}

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
  /**
   * Saves a new layout (under a new id: this is also "Save as new"). A blank or missing name
   * gives the next default name. Null when it could not be written to the browser's storage:
   * nothing was saved.
   *
   * No two layouts have the same name: wherever a name is given here (save, update, rename,
   * duplicate, a scenario's layouts) one that another layout already has gets " (2)", " (3)",
   * ... added, and `onNameAdjusted` is told.
   */
  save(draft: ManualLayoutDraft, name?: string): ManualLayoutSpec | null;
  /**
   * Saves over layout `id`, keeping its name unless one is given. Null when there is no such
   * layout, or when it could not be written (the stored layout is unchanged).
   */
  update(id: string, draft: ManualLayoutDraft, name?: string): ManualLayoutSpec | null;
  /**
   * Renames a layout. False when nothing was renamed: no such layout, a blank name, or the
   * change could not be written.
   */
  rename(id: string, name: string): boolean;
  /** A copy named "<name> (copy)". Null when there is no such layout or it was not written. */
  duplicate(id: string): ManualLayoutSpec | null;
  /** Deletes a layout. False when the deletion could not be written: it is still there. */
  remove(id: string): boolean;
  /**
   * Adds a loaded scenario's manual layouts to the ones present; nothing present is removed or
   * changed. One whose id is not present is added. One whose id is present with the same
   * content is skipped, whatever either is now named (a rename is not a different layout).
   * One whose id is present with different content is added as a copy named
   * "<name> (from scenario)" (unless a layout with that content is already there, as after an
   * earlier load). `overhang` is the scenario's allowed overhang, for layouts stored before positions
   * were kept in the pallet frame.
   */
  addFromScenario(specs: readonly ManualLayoutSpec[], overhang: number): ScenarioMerge;
  /** The current inputs when they are valid, or null while they are not. */
  setInputs(inputs: Inputs | null): void;
  /** Re-reads the stored layouts, e.g. after another tab changed them. */
  refresh(): void;
}

export interface ManualLayoutsOptions {
  /**
   * Called with the ids now saved after every change to the list: `source` is 'local' for a
   * change made through this store and 'external' for one read back from storage (another tab).
   */
  onListChange?: (ids: string[], source: 'local' | 'external') => void;
  /**
   * Called when a layout was saved under another name than the one asked for, because another
   * layout already has that name.
   */
  onNameAdjusted?: (wanted: string, given: string) => void;
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

/**
 * `name` when no layout in `taken` has it, else the first of "<name> (2)", "<name> (3)", ...
 * that none has.
 */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  let n = 2;
  while (used.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
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

/** What marks a built layout as a manual one, for the screens and the exports. */
export function manualMarker(spec: ManualLayoutSpec, build: ManualBuild): ManualMarker {
  return {
    id: spec.id,
    name: spec.name,
    // An out-of-date layout is shown as it was made, for inputs that no longer apply: what it
    // would break under them is not said anywhere, on screen or in an export.
    flags: build.status === 'outOfDate' ? [] : build.flags,
    status: build.status,
    upperLayers: spec.upperLayers,
    upperLayersNoEffect: build.alternateHasNoEffect,
    madeFor: spec.madeFor,
  };
}

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
      manual: manualMarker(spec, build),
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

    // The frame-less layouts already moved to the pallet frame this session, by id, with the
    // stored text each was moved from. Kept so that a move that could not be written is not
    // tried (and its failure not said) again at every change of the inputs, and so that the
    // layout meanwhile stays where it was put on the pallet.
    const moved = new Map<string, { from: string; spec: ManualLayoutSpec }>();

    /**
     * Layouts stored before positions were kept in the pallet frame are moved to it as soon as
     * there are valid inputs to say where the pallet was (their positions were relative to the
     * usable footprint under the inputs in force). Each is written once; if that fails it is
     * said once (by the repository) and the moved layout is kept in memory for the session.
     * Returns the list to use.
     */
    const migrated = (specs: ManualLayoutSpec[], inputs: Inputs | null): ManualLayoutSpec[] => {
      // One that cannot be read as a layout at all is left for the build to flag.
      const due = (s: ManualLayoutSpec) => s.frame === undefined && isValidSpec(s);
      if (!inputs || !specs.some(due)) return specs;
      let wrote = false;
      const place = (list: ManualLayoutSpec[], write: boolean) =>
        list.map((spec) => {
          if (!due(spec)) return spec;
          const from = JSON.stringify(spec);
          const kept = moved.get(spec.id);
          if (kept && kept.from === from) return kept.spec;
          const next = toPalletFrame(spec, inputs.overhang);
          moved.set(spec.id, { from, spec: next });
          if (write && repo.save(next)) wrote = true;
          return next;
        });
      const placed = place(specs, true);
      // After a write the stored list is read back (it is merged with other tabs' changes).
      return wrote ? place(repo.list(), false) : placed;
    };

    // The repository merges each change with what other tabs stored, so read the list back.
    const sync = (source: 'local' | 'external' = 'local') => {
      const specs = migrated(repo.list(), get().inputs);
      set({ specs, entries: build(specs, get().inputs) });
      opts.onListChange?.(
        specs.map((s) => s.id),
        source,
      );
    };
    const find = (id: string) => get().specs.find((s) => s.id === id);
    /**
     * The name to save under: the one given (the fallback when it is blank), made different
     * from every other layout's. `self` is the id of the layout being named, which may keep
     * its own name.
     */
    const named = (name: string | undefined, fallback: () => string, self?: string) => {
      const trimmed = name?.trim() ?? '';
      const wanted = trimmed === '' ? fallback() : trimmed;
      const given = uniqueName(
        wanted,
        get()
          .specs.filter((s) => s.id !== self)
          .map((s) => s.name),
      );
      if (given !== wanted) adjusted.push([wanted, given]);
      return given;
    };
    // Names changed by `named`, told once the layout is known to have been written.
    let adjusted: [string, string][] = [];
    const tellAdjusted = (written: boolean) => {
      const list = adjusted;
      adjusted = [];
      if (written) for (const [wanted, given] of list) opts.onNameAdjusted?.(wanted, given);
    };
    const fields = (draft: ManualLayoutDraft): ManualLayoutDraft =>
      structuredClone({
        design: draft.design,
        cartons: draft.cartons,
        ...(draft.frame ? { frame: draft.frame } : {}),
        upperLayers: draft.upperLayers,
        madeFor: draft.madeFor,
      });
    /** Writes one layout; the list is read back either way. Null when it was not written. */
    const store = (spec: ManualLayoutSpec): ManualLayoutSpec | null => {
      const written = repo.save(spec);
      sync();
      tellAdjusted(written);
      return written ? spec : null;
    };
    const add = (draft: ManualLayoutDraft, name: string | undefined) =>
      store({ id: newId(), name: named(name, get().nextName), ...fields(draft) });

    const specs = repo.list();
    return {
      specs,
      entries: [],
      inputs: null,
      stale: false,
      nextName: () => nextManualName(get().specs.map((s) => s.name)),
      save: (draft, name) => add(draft, name),
      update(id, draft, name) {
        const existing = find(id);
        if (!existing) return null;
        return store({ id, name: named(name, () => existing.name, id), ...fields(draft) });
      },
      rename(id, name) {
        const existing = find(id);
        const trimmed = name.trim();
        if (!existing || trimmed === '') return false;
        return store({ ...existing, name: named(trimmed, () => existing.name, id) }) !== null;
      },
      duplicate(id) {
        const source = find(id);
        if (!source) return null;
        return store({
          ...structuredClone(source),
          id: newId(),
          name: named(`${source.name} (copy)`, get().nextName),
        });
      },
      remove(id) {
        const removed = repo.remove(id);
        sync();
        return removed;
      },
      addFromScenario(incoming, overhang) {
        const outcome: ScenarioMerge = { added: 0, skipped: 0, notStored: 0 };
        // Read as each is added, so two scenario layouts with one id are told apart too.
        for (const given of incoming) {
          const spec = toPalletFrame(structuredClone(given), overhang);
          const present = repo.list();
          const same = present.find((s) => s.id === spec.id);
          // The same layout under another name (renamed here, or since the scenario was
          // saved) is still the same layout.
          if (same && contentKey(same) === contentKey(spec)) {
            outcome.skipped++;
            continue;
          }
          // The copy an earlier load of this scenario made is not made again.
          if (same && present.some((s) => contentKey(s) === contentKey(spec))) {
            outcome.skipped++;
            continue;
          }
          const wanted = same ? `${spec.name} (from scenario)` : spec.name;
          const name = uniqueName(
            wanted,
            present.map((s) => s.name),
          );
          const toAdd: ManualLayoutSpec = same ? { ...spec, id: newId(), name } : { ...spec, name };
          if (repo.save(toAdd)) {
            outcome.added++;
            if (name !== wanted) opts.onNameAdjusted?.(wanted, name);
          } else outcome.notStored++;
        }
        sync();
        return outcome;
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
        const specs = migrated(get().specs, inputs);
        set({ inputs, stale: false, specs, entries: build(specs, inputs) });
      },
      refresh() {
        repo.refresh?.();
        sync('external');
      },
    };
  });
}

/**
 * What a stored layout holds, without its id and its name, as text: two layouts with the same
 * text are the same layout, whatever each is called. Written out field by field so the order
 * the fields were stored in cannot matter.
 */
export function contentKey(spec: ManualLayoutSpec): string {
  const { counts } = spec.design;
  const m = spec.madeFor;
  return JSON.stringify([
    [counts.length, counts.width, counts.height, spec.design.facing, spec.design.sideDown],
    spec.frame ?? 'usable',
    spec.cartons.map((c) => [c.x, c.y, c.rotated]),
    spec.upperLayers,
    [m.product.length, m.product.width, m.product.height, m.wallThickness, m.leeway],
    [m.outer.L, m.outer.W, m.outer.H],
  ]);
}

/** Binds a vanilla store as a hook that is also the store, like the other app stores. */
export function asHook<S>(store: StoreApi<S>) {
  return Object.assign(<T>(selector: (s: S) => T): T => useStore(store, selector), store);
}
