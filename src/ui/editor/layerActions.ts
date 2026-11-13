/**
 * What the Pallet layer step's tools, keys and drags do (spec 6.2b), in one place: each calls
 * the editing session and, when the session refuses, says why in the message line by the
 * tools. The buttons, the keyboard and the 3D view all go through here, so a refusal reads the
 * same however it was caused.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import type { Point } from '../../engine/manual/layer';
import type { UpperLayers } from '../../engine/manual/build';
import type { EditorResult } from '../../store/manualEditorStore';
import { useStores } from '../StoreContext';

/** The words for each refusal of a layer action. */
export const LAYER_MESSAGES = {
  noFreeSpot: 'No free space for another carton inside the footprint',
  turnRefused: 'Cannot turn: it would overlap another carton',
  /** Inside the footprint, and turned it would only fit outside: a turn never overhangs. */
  turnNoRoom: 'No room to turn this carton here. Move it first.',
  overlap: 'Cartons cannot overlap',
  /** A carton dropped on another: it is back where it was. */
  dropRefused: 'Cartons cannot overlap. The carton went back to where it was',
  noSelection: 'Select a carton first',
  /** Dragged, nudged or typed to a place where nothing of it would be over the footprint. */
  offPallet: 'Keep the carton at least partly on the pallet.',
  /** A drag let go outside the 3D view: given up, the carton is where it was. */
  dropOutside: 'Drop the carton inside the view.',
} as const;

/** Why Turn and Remove are off. */
export const NEEDS_SELECTION = 'Select a carton to turn or remove it.';

interface LayerMessageState {
  text: string | null;
  say(text: string): void;
  clear(): void;
}

/**
 * The one message shown by the layer tools. Not part of the editing session: it is what the
 * screen last said, and it goes when the layer next changes.
 */
export const useLayerMessage = create<LayerMessageState>()((set) => ({
  text: null,
  say: (text) => set({ text }),
  clear: () => set({ text: null }),
}));

/** The message for a refusal, or null when it needs none (nothing to undo, no session). */
export function refusalText(result: EditorResult<object>): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case 'noFreeSpot':
      return LAYER_MESSAGES.noFreeSpot;
    case 'turnRefused':
      return LAYER_MESSAGES.turnRefused;
    case 'turnNoRoom':
      return LAYER_MESSAGES.turnNoRoom;
    case 'overlap':
      return LAYER_MESSAGES.overlap;
    case 'noSelection':
      return LAYER_MESSAGES.noSelection;
    case 'offPallet':
      return LAYER_MESSAGES.offPallet;
    default:
      return null;
  }
}

/** Inches an arrow key moves the selected carton; with Shift, the larger step. */
export const NUDGE_STEP = 0.25;
export const NUDGE_STEP_LARGE = 1;

export interface LayerActions {
  add(): boolean;
  turn(): boolean;
  remove(): boolean;
  reset(): boolean;
  /** Moves the selected carton by (dx, dy) inches in the footprint's frame. */
  nudge(dx: number, dy: number): boolean;
  /** Drops carton `index` with its minimum corner at `to`, snapped when snapping is on. */
  drop(index: number, to: Point): boolean;
  /** A drag was let go outside the view: nothing moves, and the message line says why. */
  dropOutside(): void;
  /** Selects the next (1) or previous (-1) carton, going round. */
  cycle(by: 1 | -1): void;
  select(index: number | null): void;
  undo(): void;
  redo(): void;
  setSnapping(on: boolean): void;
  setUpperLayers(upperLayers: UpperLayers): void;
}

/** The layer actions for the open session, each reporting its own refusal. */
export function useLayerActions(): LayerActions {
  const { manualEditor } = useStores();
  return useMemo(() => {
    const editor = () => manualEditor.getState();
    const report = (result: EditorResult<object>, refused?: string): boolean => {
      const text = result.ok ? null : (refused ?? refusalText(result));
      if (text) useLayerMessage.getState().say(text);
      else useLayerMessage.getState().clear();
      return result.ok;
    };
    return {
      add: () => report(editor().add()),
      turn: () => report(editor().turn()),
      remove: () => report(editor().remove()),
      reset: () => report(editor().reset()),
      nudge: (dx, dy) => report(editor().nudge(dx, dy)),
      drop: (index, to) => {
        const result = editor().move(index, to);
        return report(
          result,
          !result.ok && result.reason === 'overlap' ? LAYER_MESSAGES.dropRefused : undefined,
        );
      },
      dropOutside: () => useLayerMessage.getState().say(LAYER_MESSAGES.dropOutside),
      cycle: (by) => {
        const session = editor().session;
        const count = session?.cartons.length ?? 0;
        if (!session || count === 0) return;
        const from = session.selected;
        const next = from === null ? (by === 1 ? 0 : count - 1) : (from + by + count) % count;
        report(editor().select(next));
      },
      select: (index) => {
        report(editor().select(index));
      },
      undo: () => {
        report(editor().undo());
      },
      redo: () => {
        report(editor().redo());
      },
      setSnapping: (on) => editor().setSnapping(on),
      setUpperLayers: (upperLayers) => {
        report(editor().setUpperLayers(upperLayers));
      },
    };
  }, [manualEditor]);
}

/** What `handleLayerKey` reads of a key event. */
export interface LayerKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

/** Whether what has the focus takes typing: its keys are its own. */
export function takesTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/**
 * The layer step's keys, for the 3D view and the carton list: arrows move the selected carton
 * a quarter of an inch (one inch with Shift), left and right across the pallet, up away from
 * the front and down toward it, as the default view shows them; Delete or Backspace removes;
 * R turns; [ and ] select the previous and next carton; Escape clears the selection; Ctrl or
 * Cmd+Z undoes, with Shift (or Ctrl+Y) redoes. Tab is left alone, so focus is never trapped.
 * Returns whether the key was one of these (it is then also kept from the browser).
 */
export function handleLayerKey(
  e: LayerKeyEvent,
  actions: LayerActions,
  selected: number | null,
): boolean {
  if (takesTyping(e.target) || e.altKey) return false;
  const done = () => {
    e.preventDefault();
    return true;
  };
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z') {
      if (e.shiftKey) actions.redo();
      else actions.undo();
      return done();
    }
    if (key === 'y' && e.ctrlKey && !e.shiftKey) {
      actions.redo();
      return done();
    }
    return false;
  }
  const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
  switch (key) {
    case 'ArrowLeft':
      actions.nudge(-step, 0);
      return done();
    case 'ArrowRight':
      actions.nudge(step, 0);
      return done();
    case 'ArrowUp':
      // Away from the front, which is the edge at the greatest y.
      actions.nudge(0, -step);
      return done();
    case 'ArrowDown':
      actions.nudge(0, step);
      return done();
    case 'Delete':
    case 'Backspace':
      actions.remove();
      return done();
    case 'r':
      actions.turn();
      return done();
    case ']':
      actions.cycle(1);
      return done();
    case '[':
      actions.cycle(-1);
      return done();
    case 'Escape':
      if (selected === null) return false;
      actions.select(null);
      return done();
    default:
      return false;
  }
}
