/**
 * The editing session behind the manual layout editor (spec 6.2a, 6.2b): the carton design, the
 * working layer, the selection, undo and redo, and what the design and the layer come to under
 * the current inputs. Every rule of geometry is the manual engine's (src/engine/manual); this
 * store only keeps the session and calls it. No React, no text: an action that is refused
 * returns why as a typed result, and the screen words it. Lengths in inches, weights in pounds.
 */
import { EPS } from '../domain/constants';
import type {
  CartonCandidate,
  Dims,
  Inputs,
  Layout,
  OptimizeResult,
  OrientationCode,
} from '../domain/types';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  bestCartonsFor,
  buildManualLayout,
  canSave,
  madeForOf,
  specFromLayout,
  type ManualBuild,
  type ManualFlag,
  type UpperLayers,
} from '../engine/manual/build';
import {
  cartonWeight,
  designCarton,
  designedSize,
  designFlags,
  designOf,
  facingsFor,
  verticalAxis,
  type CartonDesign,
  type CartonFlags,
  type CartonSide,
  type SideDown,
} from '../engine/manual/carton';
import {
  addCarton,
  canPlace,
  cartonBase,
  cartonRect,
  moveCarton,
  palletRect,
  removeCarton,
  snap,
  snapTargets,
  SNAP_THRESHOLD,
  turnCarton,
  type CartonBase,
  type ManualCarton,
  type Point,
} from '../engine/manual/layer';
import { usableFootprint, type Rect } from '../engine/packing/geometry';
import type { ManualLayoutsState } from './manualLayoutsStore';
import type { ResultsState } from './resultsStore';

export type EditorStep = 'carton' | 'layer';

/** What the session was opened from, which decides what Save does. */
export type EditorOrigin =
  /** A copy of a calculated layout ("Edit layout by hand"): Save adds a new manual layout. */
  | { kind: 'calculated'; layoutId: string }
  /** The best result's carton and layer, at the carton step ("Design my own carton"). */
  | { kind: 'own' }
  /** A saved manual layout: Save saves over it, Save as new adds another. */
  | { kind: 'saved'; id: string };

/** Why an action did nothing. The screen turns this into its message. */
export type EditorRefusal =
  /** No session is open. */
  | { reason: 'noSession' }
  /** There are no valid inputs to edit under. */
  | { reason: 'noInputs' }
  /** There is no such calculated layout, saved layout or carton. */
  | { reason: 'notFound' }
  /** The saved layout is out of date: it cannot be edited, only rebuilt (see `rebuild`). */
  | { reason: 'outOfDate' }
  /** A count that is not a whole number of 1 or more, an unknown facing, a bad position. */
  | { reason: 'invalid' }
  /** "Keep cartons upright" is on: the carton stays on its base. */
  | { reason: 'cartonsKeptUpright' }
  /** The carton cannot go on to the layer step: it cannot fit the footprint, or is too tall. */
  | { reason: 'cartonBlocked'; blocked: 'footprint' | 'height' }
  /**
   * The carton changed and the layer was edited by hand: going on (or saving) replaces the
   * layer with the tool's best layer for the new carton. Ask, then call again with
   * `{ replace: true }`.
   */
  | { reason: 'layerEdited' }
  /** A layer action away from the layer step. */
  | { reason: 'notOnLayerStep' }
  /** No carton is selected (or there is no carton at that index). */
  | { reason: 'noSelection' }
  /** The carton would overlap another there: it stays where it was. */
  | { reason: 'overlap' }
  /** The turned carton would overlap wherever it is put. */
  | { reason: 'turnRefused' }
  /** There is no room for one more carton inside the usable footprint. */
  | { reason: 'noFreeSpot' }
  /** The layout has a flag that cannot be saved (empty layer, carton cannot fit, too tall). */
  | { reason: 'cannotSave'; flags: ManualFlag[] }
  | { reason: 'nothingToUndo' }
  | { reason: 'nothingToRedo' };

export type EditorResult<T = object> = ({ ok: true } & T) | ({ ok: false } & EditorRefusal);

/** The carton step's live figures (spec 6.2a), in inches and pounds. */
export interface CartonFigures {
  boxesPerCarton: number;
  /** Along the carton's own length, width and height. */
  inner: Dims;
  outer: Dims;
  /** One full carton's weight, or null when the box weight is blank. */
  weight: number | null;
  /** How well the boxes fill the carton: box volume over the carton's outer volume, 0 to 1. */
  fill: number;
}

export interface EditorSession {
  origin: EditorOrigin;
  /** The name Save proposes: the saved layout's, or the next default name. */
  name: string;
  step: EditorStep;
  snapping: boolean;

  design: CartonDesign;
  /**
   * The working layer: the cartons the layer step shows and edits (frame: see layer.ts). While
   * `layerPending`, these still belong to the carton before the change.
   */
  cartons: ManualCarton[];
  upperLayers: UpperLayers;
  /** The index of the selected carton in `cartons`, or null. */
  selected: number | null;
  /** The working layer was changed by hand since it was loaded (or is a saved manual layer). */
  layerEdited: boolean;
  /**
   * The carton's base is no longer the one the working layer was laid out for. Going to the
   * layer step (or saving) replaces the layer with the tool's best layer for the carton.
   */
  layerPending: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Something differs from what the session opened with (Cancel should ask first). */
  dirty: boolean;

  /** The inputs everything below was worked out under: the last valid ones. */
  inputs: Inputs;
  carton: CartonCandidate;
  /** The designed carton's base on the pallet (see layer.ts). */
  base: CartonBase;
  /** The usable footprint and, in its frame, the pallet: for the outlines and for snapping. */
  usable: Point;
  pallet: Rect;
  /** The facings that really differ for the product: the facing buttons. */
  facings: OrientationCode[];
  figures: CartonFigures;
  cartonFlags: CartonFlags;
  /**
   * The layer that is built and would be saved: `cartons`, or while `layerPending` the tool's
   * best layer for the designed carton.
   */
  layer: ManualCarton[];
  /** The layout, flags and rating of `layer` stacked under the inputs: the bar's figures. */
  build: ManualBuild;
  canSave: boolean;
}

export interface SaveOptions {
  /** The name to save under; the session's name when left out. */
  name?: string;
  /** Confirms replacing a hand-edited layer after a carton change (see 'layerEdited'). */
  replace?: boolean;
}

export interface ManualEditorState {
  session: EditorSession | null;

  /** "Edit layout by hand": a copy of the calculated layout at `index`, at the layer step. */
  openFromCalculated(index: number, step?: EditorStep): EditorResult;
  /** "Design my own carton": the best calculated layout, at the carton step. */
  openOwn(): EditorResult;
  /** Edit a saved manual layout (at the layer step). Refused when it is out of date. */
  openSaved(id: string, step?: EditorStep): EditorResult;
  /**
   * "Rebuild" an out-of-date saved layout: the best calculated layout under the saved one's
   * name, at the carton step; Save saves over the saved one.
   */
  rebuild(id: string): EditorResult;

  /**
   * Moves between the steps. Going to the layer step is refused for a blocked carton, and
   * after a carton change it loads the best layer for the carton, asking first (refusal
   * 'layerEdited') when the layer was edited by hand.
   */
  goToStep(step: EditorStep, opts?: { replace?: boolean }): EditorResult;
  setName(name: string): void;
  setSnapping(on: boolean): void;

  setCount(side: CartonSide, count: number): EditorResult;
  setFacing(facing: OrientationCode): EditorResult;
  setSideDown(sideDown: SideDown): EditorResult;
  /** "Use a calculated carton": the carton of the calculated layout at `index`. */
  applyCalculatedCarton(index: number): EditorResult;
  setUpperLayers(upperLayers: UpperLayers): EditorResult;

  select(index: number | null): EditorResult;
  /**
   * Where carton `index` would land if dropped with its minimum corner at `to` (snapped when
   * snapping is on) and whether it may be dropped there. Changes nothing: for showing a drag.
   */
  previewMove(index: number, to: Point): { position: Point; valid: boolean } | null;
  /**
   * Drops carton `index` at `to`, snapped when snapping is on (`snap` overrides the toggle;
   * a typed position passes false). Refused when it would overlap.
   */
  move(index: number, to: Point, opts?: { snap?: boolean }): EditorResult<{ position: Point }>;
  /** Moves the selected carton by exactly (dx, dy), without snapping. */
  nudge(dx: number, dy: number): EditorResult<{ position: Point }>;
  /** Turns a carton 90° (the selected one by default). */
  turn(index?: number): EditorResult;
  /** Adds a carton at the first free spot and selects it. */
  add(): EditorResult<{ index: number }>;
  /** Removes a carton (the selected one by default). */
  remove(index?: number): EditorResult;
  /** Back to the layer the session started from (or the last best layer loaded). */
  reset(): EditorResult;

  undo(): EditorResult;
  redo(): EditorResult;

  /** Saves: over the saved layout the session was opened from, else as a new one. Closes. */
  save(opts?: SaveOptions): EditorResult<{ id: string }>;
  /** Saves as a new layout whatever the session was opened from. Closes. */
  saveAsNew(opts?: SaveOptions): EditorResult<{ id: string }>;
  /** Discards the session. The screen asks first when `dirty`. */
  cancel(): void;
}

export interface ManualEditorDeps {
  manualLayouts: StoreApi<ManualLayoutsState>;
  results: StoreApi<ResultsState>;
  /** Called with the saved layout's id after Save or Save as new. */
  onSaved?: (id: string) => void;
}

/** A calculated carton offered by "Use a calculated carton". */
export interface CalculatedCarton {
  /** The index of the first calculated layout that uses it (for `applyCalculatedCarton`). */
  index: number;
  design: CartonDesign;
  carton: CartonCandidate;
}

/** The different cartons the tool found, best layout first, each once. */
export function calculatedCartons(result: OptimizeResult | null): CalculatedCarton[] {
  const seen = new Set<string>();
  const out: CalculatedCarton[] = [];
  result?.layouts.forEach((ranked, index) => {
    const bottom = ranked.layout.layers[0];
    if (!bottom) return;
    const design = designOf(ranked.layout.carton, bottom.vertical);
    const key = JSON.stringify(design);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ index, design, carton: ranked.layout.carton });
  });
  return out;
}

/** Undo steps kept; older ones are dropped. */
export const HISTORY_LIMIT = 200;

const FACINGS: readonly OrientationCode[] = ['LWH', 'LHW', 'WLH', 'WHL', 'HLW', 'HWL'];
const SIDES_DOWN: readonly SideDown[] = ['base', 'side', 'end'];
const SIDES: readonly CartonSide[] = ['length', 'width', 'height'];

/** Everything undo and redo put back. */
interface Core {
  design: CartonDesign;
  cartons: ManualCarton[];
  upperLayers: UpperLayers;
  /** The carton base `cartons` were laid out for. */
  layerBase: CartonBase;
  layerEdited: boolean;
  /** What Reset goes back to, and whether that layer is the user's own. */
  start: ManualCarton[];
  startEdited: boolean;
  selected: number | null;
  /** Whether the last carton touched lies turned: the way Add lays the next one. */
  lastRotated: boolean;
}

interface Meta {
  origin: EditorOrigin;
  name: string;
  step: EditorStep;
  snapping: boolean;
}

const sameBase = (p: CartonBase, q: CartonBase) =>
  Math.abs(p.a - q.a) <= EPS && Math.abs(p.b - q.b) <= EPS;

const samePoint = (p: Point, q: Point) => p.x === q.x && p.y === q.y;

function baseOf(design: CartonDesign, inputs: Inputs): CartonBase {
  return cartonBase(designCarton(design, inputs), verticalAxis(design));
}

export function createManualEditorStore(deps: ManualEditorDeps): StoreApi<ManualEditorState> {
  const { manualLayouts, results } = deps;
  return createStore<ManualEditorState>()((set, get) => {
    let core: Core | null = null;
    let meta: Meta | null = null;
    let past: Core[] = [];
    let future: Core[] = [];
    let inputs: Inputs | null = null;
    /** The snapping choice outlives a session: it is the user's way of working. */
    let snapping = true;
    /** What the session opened with, as `contentKey` gives it. */
    let opened = '';
    // The best layer per design under one inputs object; searched once, then reused.
    let bestFor: { inputs: Inputs; byDesign: Map<string, ManualCarton[]> } | null = null;

    const best = (design: CartonDesign, i: Inputs): ManualCarton[] => {
      if (bestFor?.inputs !== i) bestFor = { inputs: i, byDesign: new Map() };
      const key = JSON.stringify(design);
      let found = bestFor.byDesign.get(key);
      if (!found) {
        found = bestCartonsFor(design, i);
        bestFor.byDesign.set(key, found);
      }
      return found;
    };

    const pending = (c: Core, i: Inputs) => !sameBase(baseOf(c.design, i), c.layerBase);
    const layerOf = (c: Core, i: Inputs) => (pending(c, i) ? best(c.design, i) : c.cartons);
    const contentKey = (c: Core, i: Inputs) =>
      JSON.stringify([c.design, layerOf(c, i), c.upperLayers]);

    /** Publishes the session for the current core, meta and inputs. */
    const publish = () => {
      if (!core || !meta || !inputs) {
        set({ session: null });
        return;
      }
      // On the layer step the layer shown must be the designed carton's.
      if (meta.step === 'layer' && pending(core, inputs)) meta = { ...meta, step: 'carton' };
      const { design } = core;
      const carton = designCarton(design, inputs);
      const layer = layerOf(core, inputs);
      const build = buildManualLayout(
        {
          id: meta.origin.kind === 'saved' ? meta.origin.id : 'draft',
          name: meta.name,
          design,
          cartons: layer,
          upperLayers: core.upperLayers,
          madeFor: madeForOf(design, inputs),
        },
        inputs,
      );
      const session: EditorSession = {
        ...meta,
        design,
        cartons: core.cartons,
        upperLayers: core.upperLayers,
        selected: core.selected,
        layerEdited: core.layerEdited,
        layerPending: pending(core, inputs),
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        dirty: contentKey(core, inputs) !== opened,
        inputs,
        carton,
        base: cartonBase(carton, verticalAxis(design)),
        usable: usableFootprint(inputs),
        pallet: palletRect(inputs),
        facings: facingsFor(inputs.product),
        figures: {
          boxesPerCarton: carton.boxesPerCarton,
          inner: designedSize(design, carton, 'inner'),
          outer: designedSize(design, carton, 'outer'),
          weight: cartonWeight(carton, inputs),
          fill: carton.utilization,
        },
        cartonFlags: designFlags(design, inputs),
        layer,
        build,
        canSave: canSave(build.flags),
      };
      set({ session });
    };

    /** A change the user made: the state before it goes on the undo stack. */
    const commit = (next: Core) => {
      if (!core) return;
      past = [...past, core].slice(-HISTORY_LIMIT);
      future = [];
      core = next;
      publish();
    };

    const open = (
      origin: EditorOrigin,
      name: string,
      step: EditorStep,
      from: {
        design: CartonDesign;
        cartons: ManualCarton[];
        upperLayers: UpperLayers;
        layerEdited: boolean;
      },
      i: Inputs,
    ) => {
      inputs = i;
      core = {
        design: structuredClone(from.design),
        cartons: structuredClone(from.cartons),
        upperLayers: from.upperLayers,
        layerBase: baseOf(from.design, i),
        layerEdited: from.layerEdited,
        start: structuredClone(from.cartons),
        startEdited: from.layerEdited,
        selected: null,
        lastRotated: from.cartons.at(-1)?.rotated ?? false,
      };
      meta = { origin, name, step, snapping };
      past = [];
      future = [];
      opened = contentKey(core, i);
      publish();
    };

    const close = () => {
      core = null;
      meta = null;
      past = [];
      future = [];
      publish();
    };

    /** The inputs to edit under: the last valid ones, else those of the calculation. */
    const currentInputs = () => manualLayouts.getState().inputs ?? results.getState().inputs;

    const openCalculated = (
      layout: Layout | undefined,
      origin: EditorOrigin | null,
      name: string,
      step: EditorStep,
    ): EditorResult => {
      const made = results.getState().inputs;
      const i = currentInputs();
      if (!i || !made) return { ok: false, reason: 'noInputs' };
      const spec = layout ? specFromLayout(layout, made, 'draft', name) : null;
      if (!layout || !spec) return { ok: false, reason: 'notFound' };
      open(
        origin ?? { kind: 'calculated', layoutId: layout.id },
        name,
        step,
        { ...spec, layerEdited: false },
        i,
      );
      return { ok: true };
    };

    const layoutAt = (index: number) => results.getState().result?.layouts[index]?.layout;

    /** The open session's parts, or the refusal to return. */
    const need = (layerStep = false) => {
      if (!core || !meta || !inputs) return { no: { ok: false, reason: 'noSession' } } as const;
      if (layerStep && meta.step !== 'layer')
        return { no: { ok: false, reason: 'notOnLayerStep' } } as const;
      return { no: null, core, meta, inputs, base: baseOf(core.design, inputs) };
    };

    const setDesign = (design: CartonDesign): EditorResult => {
      const s = need();
      if (s.no) return s.no;
      if (JSON.stringify(design) !== JSON.stringify(s.core.design)) commit({ ...s.core, design });
      return { ok: true };
    };

    /** A change to the working layer made by hand. */
    const editLayer = (c: Core, cartons: ManualCarton[], rest: Partial<Core> = {}) =>
      commit({ ...c, cartons, layerEdited: true, ...rest });

    const moveTo = (
      index: number,
      to: Point,
      snapping: boolean,
    ): EditorResult<{ position: Point }> => {
      const s = need(true);
      if (s.no) return s.no;
      const current = s.core.cartons[index];
      if (!current) return { ok: false, reason: 'noSelection' };
      if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return { ok: false, reason: 'invalid' };
      const position = snapped(s.core, s.inputs, s.base, index, to, snapping);
      if (samePoint(position, current)) return { ok: true, position };
      const cartons = moveCarton(s.core.cartons, index, position, s.base);
      if (!cartons) return { ok: false, reason: 'overlap' };
      editLayer(s.core, cartons, { lastRotated: current.rotated });
      return { ok: true, position };
    };

    const snapped = (
      c: Core,
      i: Inputs,
      base: CartonBase,
      index: number,
      to: Point,
      snapping: boolean,
    ): Point => {
      const current = c.cartons[index];
      if (!current || !snapping) return { x: to.x, y: to.y };
      const { w, h } = cartonRect(current, base);
      return snap(to, { w, h }, snapTargets(c.cartons, base, i, index), SNAP_THRESHOLD);
    };

    const saveWith = (opts: SaveOptions, asNew: boolean): EditorResult<{ id: string }> => {
      const s = need();
      if (s.no) return s.no;
      const session = get().session;
      if (!session) return { ok: false, reason: 'noSession' };
      if (session.layerPending && session.layerEdited && !opts.replace)
        return { ok: false, reason: 'layerEdited' };
      if (!session.canSave) return { ok: false, reason: 'cannotSave', flags: session.build.flags };
      const draft = {
        design: s.core.design,
        cartons: session.layer,
        upperLayers: s.core.upperLayers,
        madeFor: madeForOf(s.core.design, s.inputs),
      };
      const store = manualLayouts.getState();
      const { origin } = s.meta;
      const savedOver =
        !asNew && origin.kind === 'saved'
          ? store.update(origin.id, draft, opts.name ?? s.meta.name)
          : null;
      // A copy of a saved layout does not take its name: it gets the next default one.
      const copyOfSaved = asNew && origin.kind === 'saved';
      const spec =
        savedOver ?? store.save(draft, opts.name ?? (copyOfSaved ? undefined : s.meta.name));
      close();
      deps.onSaved?.(spec.id);
      return { ok: true, id: spec.id };
    };

    // The layout is re-checked as the inputs change, as saved ones are.
    manualLayouts.subscribe((m) => {
      if (!core || !m.inputs || m.inputs === inputs) return;
      inputs = m.inputs;
      publish();
    });

    return {
      session: null,

      openFromCalculated(index, step = 'layer') {
        return openCalculated(layoutAt(index), null, manualLayouts.getState().nextName(), step);
      },
      openOwn() {
        return openCalculated(
          layoutAt(0),
          { kind: 'own' },
          manualLayouts.getState().nextName(),
          'carton',
        );
      },
      openSaved(id, step = 'layer') {
        const i = currentInputs();
        if (!i) return { ok: false, reason: 'noInputs' };
        const spec = manualLayouts.getState().specs.find((s) => s.id === id);
        if (!spec) return { ok: false, reason: 'notFound' };
        if (buildManualLayout(spec, i).status === 'outOfDate')
          return { ok: false, reason: 'outOfDate' };
        // A saved manual layer is the user's own: replacing it is always asked about.
        open({ kind: 'saved', id }, spec.name, step, { ...spec, layerEdited: true }, i);
        return { ok: true };
      },
      rebuild(id) {
        const spec = manualLayouts.getState().specs.find((s) => s.id === id);
        if (!spec) return { ok: false, reason: 'notFound' };
        return openCalculated(layoutAt(0), { kind: 'saved', id }, spec.name, 'carton');
      },

      goToStep(step, opts = {}) {
        const s = need();
        if (s.no) return s.no;
        if (step === 'carton') {
          meta = { ...s.meta, step };
          publish();
          return { ok: true };
        }
        const blocked = designFlags(s.core.design, s.inputs).blocked;
        if (blocked) return { ok: false, reason: 'cartonBlocked', blocked };
        if (pending(s.core, s.inputs)) {
          if (s.core.layerEdited && !opts.replace) return { ok: false, reason: 'layerEdited' };
          // Loaded in place: undo goes back past the carton change, to the layer as it was.
          const cartons = structuredClone(best(s.core.design, s.inputs));
          core = {
            ...s.core,
            cartons,
            layerBase: s.base,
            layerEdited: false,
            start: cartons,
            startEdited: false,
            selected: null,
            lastRotated: cartons.at(-1)?.rotated ?? false,
          };
        }
        meta = { ...s.meta, step };
        publish();
        return { ok: true };
      },
      setName(name) {
        if (!meta) return;
        meta = { ...meta, name };
        publish();
      },
      setSnapping(on) {
        if (!meta) return;
        snapping = on;
        meta = { ...meta, snapping: on };
        publish();
      },

      setCount(side, count) {
        const s = need();
        if (s.no) return s.no;
        if (!SIDES.includes(side) || !Number.isInteger(count) || count < 1)
          return { ok: false, reason: 'invalid' };
        const { design } = s.core;
        return setDesign({ ...design, counts: { ...design.counts, [side]: count } });
      },
      setFacing(facing) {
        const s = need();
        if (s.no) return s.no;
        if (!FACINGS.includes(facing)) return { ok: false, reason: 'invalid' };
        return setDesign({ ...s.core.design, facing });
      },
      setSideDown(sideDown) {
        const s = need();
        if (s.no) return s.no;
        if (!SIDES_DOWN.includes(sideDown)) return { ok: false, reason: 'invalid' };
        if (s.inputs.keepCartonsUpright && sideDown !== 'base')
          return { ok: false, reason: 'cartonsKeptUpright' };
        return setDesign({ ...s.core.design, sideDown });
      },
      applyCalculatedCarton(index) {
        const s = need();
        if (s.no) return s.no;
        const layout = layoutAt(index);
        const bottom = layout?.layers[0];
        if (!layout || !bottom) return { ok: false, reason: 'notFound' };
        return setDesign(designOf(layout.carton, bottom.vertical));
      },
      setUpperLayers(upperLayers) {
        const s = need();
        if (s.no) return s.no;
        if (upperLayers !== 'same' && upperLayers !== 'alternate')
          return { ok: false, reason: 'invalid' };
        if (upperLayers !== s.core.upperLayers) commit({ ...s.core, upperLayers });
        return { ok: true };
      },

      select(index) {
        const s = need(true);
        if (s.no) return s.no;
        const picked = index === null ? null : s.core.cartons[index];
        if (index !== null && !picked) return { ok: false, reason: 'noSelection' };
        // Selecting is not a change to undo.
        core = {
          ...s.core,
          selected: index,
          lastRotated: picked ? picked.rotated : s.core.lastRotated,
        };
        publish();
        return { ok: true };
      },
      previewMove(index, to) {
        const s = need(true);
        const current = s.no ? undefined : s.core.cartons[index];
        if (s.no || !current || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return null;
        const position = snapped(s.core, s.inputs, s.base, index, to, s.meta.snapping);
        return {
          position,
          valid: canPlace(s.core.cartons, { ...current, ...position }, s.base, index),
        };
      },
      move(index, to, opts = {}) {
        return moveTo(index, to, opts.snap ?? meta?.snapping ?? true);
      },
      nudge(dx, dy) {
        const s = need(true);
        if (s.no) return s.no;
        const current = s.core.selected === null ? undefined : s.core.cartons[s.core.selected];
        if (s.core.selected === null || !current) return { ok: false, reason: 'noSelection' };
        return moveTo(s.core.selected, { x: current.x + dx, y: current.y + dy }, false);
      },
      turn(index) {
        const s = need(true);
        if (s.no) return s.no;
        const at = index ?? s.core.selected;
        const current = at === null ? undefined : s.core.cartons[at];
        if (at === null || !current) return { ok: false, reason: 'noSelection' };
        const cartons = turnCarton(s.core.cartons, at, s.base, usableFootprint(s.inputs));
        if (!cartons) return { ok: false, reason: 'turnRefused' };
        editLayer(s.core, cartons, { lastRotated: !current.rotated });
        return { ok: true };
      },
      add() {
        const s = need(true);
        if (s.no) return s.no;
        const usable = usableFootprint(s.inputs);
        // The way the last carton touched lies; the other way only when that has no room.
        const added =
          addCarton(s.core.cartons, s.core.lastRotated, s.base, usable) ??
          addCarton(s.core.cartons, !s.core.lastRotated, s.base, usable);
        if (!added) return { ok: false, reason: 'noFreeSpot' };
        editLayer(s.core, added.cartons, {
          selected: added.index,
          lastRotated: added.cartons[added.index]?.rotated ?? s.core.lastRotated,
        });
        return { ok: true, index: added.index };
      },
      remove(index) {
        const s = need(true);
        if (s.no) return s.no;
        const at = index ?? s.core.selected;
        if (at === null || !s.core.cartons[at]) return { ok: false, reason: 'noSelection' };
        const { selected } = s.core;
        editLayer(s.core, removeCarton(s.core.cartons, at), {
          // The selection follows its carton; it goes when its carton does.
          selected:
            selected === null || selected === at ? null : selected - (selected > at ? 1 : 0),
        });
        return { ok: true };
      },
      reset() {
        const s = need(true);
        if (s.no) return s.no;
        if (JSON.stringify(s.core.cartons) !== JSON.stringify(s.core.start))
          commit({
            ...s.core,
            cartons: s.core.start,
            layerEdited: s.core.startEdited,
            selected: null,
          });
        return { ok: true };
      },

      undo() {
        const s = need();
        if (s.no) return s.no;
        const previous = past.at(-1);
        if (!previous) return { ok: false, reason: 'nothingToUndo' };
        past = past.slice(0, -1);
        future = [s.core, ...future];
        core = previous;
        publish();
        return { ok: true };
      },
      redo() {
        const s = need();
        if (s.no) return s.no;
        const next = future[0];
        if (!next) return { ok: false, reason: 'nothingToRedo' };
        future = future.slice(1);
        past = [...past, s.core];
        core = next;
        publish();
        return { ok: true };
      },

      save: (opts = {}) => saveWith(opts, false),
      saveAsNew: (opts = {}) => saveWith(opts, true),
      cancel: close,
    };
  });
}
