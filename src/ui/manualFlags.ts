/**
 * The words for every broken limit of a manual layout (spec 6.3), in one place: the editor,
 * the results list and the build sheet all say a flag the same way. Lengths and weights arrive
 * in inches and pounds and are shown in the display unit through format.ts.
 */
import type { ManualFlag } from '../engine/manual/build';
import type { CartonFlags, OverMaximumSide, RankedSide } from '../engine/manual/carton';
import { fmtCount, lengthText, weightText, type Unit } from './format';

/** How a flag is shown: 'error' is a broken limit (the error style), 'note' is information. */
export type FlagTone = 'error' | 'note';

export interface FlagLine {
  /** Stable per kind of flag: a React key, and what tests look a line up by. */
  key: ManualFlag['kind'];
  text: string;
  tone: FlagTone;
  /** The layout cannot be saved while this flag stands. */
  blocking: boolean;
}

const SIDE: Record<RankedSide, string> = {
  longest: 'longest side',
  middle: 'middle side',
  shortest: 'shortest side',
};

function overMaximumText(sides: readonly OverMaximumSide[], unit: Unit): string {
  const parts = sides.map((s) => `${lengthText(s.by, unit)} (${SIDE[s.side]})`);
  const list =
    parts.length <= 2
      ? parts.join(' and ')
      : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
  return `Carton is over the maximum carton size by ${list}`;
}

/** One flag as a sentence (no full stop, as the other notes on a card are written). */
export function flagText(flag: ManualFlag, unit: Unit): string {
  switch (flag.kind) {
    case 'overhang':
      return `${fmtCount(flag.cartons)} ${
        flag.cartons === 1 ? 'carton overhangs' : 'cartons overhang'
      } the allowed footprint by up to ${lengthText(flag.by, unit)}`;
    case 'overMaximum':
      return overMaximumText(flag.sides, unit);
    case 'overWeight':
      return `Over the maximum pallet weight by ${weightText(flag.by, unit)} (one layer is kept)`;
    case 'overHeight':
      return `Carton is taller than the stacking height by ${lengthText(flag.by, unit)}`;
    case 'cannotFit':
      return 'Carton is too big for the allowed footprint, whichever way it is turned';
    case 'empty':
      return 'The layer has no cartons';
    case 'overlap':
      return `${fmtCount(flag.pairs)} ${
        flag.pairs === 1 ? 'pair of cartons overlaps' : 'pairs of cartons overlap'
      }`;
    case 'orientationNotAllowed':
      return 'The boxes stand a way up that the rotation setting does not allow. It is kept because you chose it';
    case 'invalid':
      return 'This layout cannot be read';
  }
}

const BLOCKING: ReadonlySet<ManualFlag['kind']> = new Set([
  'overHeight',
  'cannotFit',
  'empty',
  'overlap',
  'invalid',
]);

/** Every flag as a line to show, broken limits first, in the order given otherwise. */
export function flagLines(flags: readonly ManualFlag[], unit: Unit): FlagLine[] {
  const lines = flags.map((flag): FlagLine => ({
    key: flag.kind,
    text: flagText(flag, unit),
    tone: flag.kind === 'orientationNotAllowed' ? 'note' : 'error',
    blocking: BLOCKING.has(flag.kind),
  }));
  return [...lines.filter((l) => l.tone === 'error'), ...lines.filter((l) => l.tone === 'note')];
}

/** A designed carton's flags as layout flags, so the carton step words them the same way. */
export function cartonFlagList(flags: CartonFlags): ManualFlag[] {
  const out: ManualFlag[] = [];
  if (flags.cannotFitFootprint) out.push({ kind: 'cannotFit' });
  if (flags.overHeightBy !== null) out.push({ kind: 'overHeight', by: flags.overHeightBy });
  if (flags.overMaximum.length > 0) out.push({ kind: 'overMaximum', sides: flags.overMaximum });
  if (flags.orientationNotAllowed) out.push({ kind: 'orientationNotAllowed' });
  return out;
}

/**
 * Why a layout cannot be saved, as one sentence, or null when it can: the first flag that
 * stops it. A carton that cannot go on the pallet is said before the empty layer it causes.
 */
export function cannotSaveText(flags: readonly ManualFlag[], unit: Unit): string | null {
  const order: ManualFlag['kind'][] = ['invalid', 'cannotFit', 'overHeight', 'overlap', 'empty'];
  for (const kind of order) {
    const flag = flags.find((f) => f.kind === kind);
    if (flag) return `Cannot be saved: ${lowerFirst(flagText(flag, unit))}.`;
  }
  return null;
}

/** Why a designed carton cannot go on to the Pallet layer step, or null when it can. */
export function cartonBlockedText(flags: CartonFlags, unit: Unit): string | null {
  if (flags.blocked === null) return null;
  const flag: ManualFlag =
    flags.blocked === 'footprint'
      ? { kind: 'cannotFit' }
      : { kind: 'overHeight', by: flags.overHeightBy ?? 0 };
  return `${flagText(flag, unit)}. Change the carton to go on to the pallet layer or to save.`;
}

function lowerFirst(text: string): string {
  // "Carton is…" and "The layer…" read on after a colon; a leading count stays as it is.
  return text.charAt(0).toLowerCase() + text.slice(1);
}
