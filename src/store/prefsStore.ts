import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { z } from 'zod';
import type { Unit } from '../engine/units/units';
import { STORAGE_KEYS } from '../persistence/keys';

export type ViewMode = 'basic' | 'full';
export type ThemePref = 'harbor' | 'light';

export interface PrefsState {
  viewMode: ViewMode;
  theme: ThemePref;
  /** Display unit; the app keeps this in step with the inputs store's unit. */
  unit: Unit;
  setViewMode(m: ViewMode): void;
  setTheme(t: ThemePref): void;
  setUnit(u: Unit): void;
}

type StoredPrefs = Pick<PrefsState, 'viewMode' | 'theme' | 'unit'>;

const DEFAULTS: StoredPrefs = { viewMode: 'basic', theme: 'harbor', unit: 'in' };
const viewModeSchema = z.enum(['basic', 'full']);
// Stored "dark" and "system" come from the previous version: both open as Harbor.
const themeSchema = z.enum(['harbor', 'light']).catch('harbor');
// Prefs stored before units existed have no unit: they open in inches, as before.
const unitSchema = z.enum(['in', 'cm', 'mm']).catch('in');

/** Each invalid or missing part falls back to its own default. */
function loadPrefs(storage: Storage | null): StoredPrefs {
  try {
    const raw = storage?.getItem(STORAGE_KEYS.prefs);
    if (raw) {
      const data: unknown = JSON.parse(raw);
      if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>;
        return {
          viewMode: viewModeSchema.catch(DEFAULTS.viewMode).parse(obj.viewMode),
          theme: themeSchema.parse(obj.theme),
          unit: unitSchema.parse(obj.unit),
        };
      }
    }
  } catch {
    // Unreadable storage or bad JSON: preferences are a convenience, so use the defaults.
  }
  return DEFAULTS;
}

function savePrefs(storage: Storage | null, prefs: StoredPrefs): void {
  try {
    storage?.setItem(STORAGE_KEYS.prefs, JSON.stringify(prefs));
  } catch {
    // Quota or blocked storage: ignore.
  }
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createPrefsStore(
  storage: Storage | null = defaultStorage(),
  initial: Partial<StoredPrefs> = {},
): StoreApi<PrefsState> {
  return createStore<PrefsState>()((set, get) => {
    const start = { ...loadPrefs(storage), ...initial };
    const apply = (next: Partial<StoredPrefs>) => {
      const { viewMode, theme, unit } = get();
      const merged = { viewMode, theme, unit, ...next };
      savePrefs(storage, merged);
      set(merged);
    };
    return {
      ...start,
      setViewMode: (viewMode) => apply({ viewMode }),
      setTheme: (theme) => apply({ theme }),
      setUnit: (unit) => apply({ unit }),
    };
  });
}

const prefsStore = createPrefsStore();

export const usePrefsStore = Object.assign(
  <T>(selector: (s: PrefsState) => T): T => useStore(prefsStore, selector),
  prefsStore,
);
