import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { z } from 'zod';
import { STORAGE_KEYS } from '../persistence/keys';

export type ViewMode = 'basic' | 'full';
export type ThemePref = 'system' | 'light' | 'dark';

export interface PrefsState {
  viewMode: ViewMode;
  theme: ThemePref;
  setViewMode(m: ViewMode): void;
  setTheme(t: ThemePref): void;
}

type StoredPrefs = Pick<PrefsState, 'viewMode' | 'theme'>;

const DEFAULTS: StoredPrefs = { viewMode: 'basic', theme: 'system' };
const viewModeSchema = z.enum(['basic', 'full']);
const themeSchema = z.enum(['system', 'light', 'dark']);

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
          theme: themeSchema.catch(DEFAULTS.theme).parse(obj.theme),
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

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function createPrefsStore(
  storage: Storage | null = defaultStorage(),
  initial: Partial<StoredPrefs> = {},
): StoreApi<PrefsState> {
  return createStore<PrefsState>()((set, get) => {
    const start = { ...loadPrefs(storage), ...initial };
    const apply = (next: Partial<StoredPrefs>) => {
      const merged = { viewMode: get().viewMode, theme: get().theme, ...next };
      savePrefs(storage, merged);
      set(merged);
    };
    return {
      ...start,
      setViewMode: (viewMode) => apply({ viewMode }),
      setTheme: (theme) => apply({ theme }),
    };
  });
}

const prefsStore = createPrefsStore();

export const usePrefsStore = Object.assign(
  <T>(selector: (s: PrefsState) => T): T => useStore(prefsStore, selector),
  prefsStore,
);
