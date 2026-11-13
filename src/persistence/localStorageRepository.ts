import type { z } from 'zod';
import { createMemoryRepository, type Repository } from './repository';

const UNREADABLE = 'Saved data could not be read.';
const BACKED_UP = ' It will be backed up before anything is overwritten.';
const THEY_BACKED_UP = ' They will be backed up before anything is overwritten.';
export const NOT_SAVED = 'Could not save: browser storage is full or unavailable.';
const BACKUP_FAILED =
  'Could not keep a backup, so your change was not saved. Free up browser storage and try again.';

/** The browser's Local Storage, or null when it is missing or access throws. */
export function getBrowserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Calls `onChange` when another tab changes `key` (or clears storage). Returns an unsubscribe
 * function; does nothing outside a browser.
 */
export function onStorageChange(key: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (e: StorageEvent) => {
    if (e.key === null || e.key === key) onChange();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/** Local Storage when usable, otherwise a repository that lives only in memory. */
export function createDefaultRepository<T extends { id: string }>(opts: {
  key: string;
  schema: z.ZodType<T>;
  seed?: T[];
  onNotice?: (message: string) => void;
  discardFailed?: boolean;
}): Repository<T> {
  const storage = getBrowserStorage();
  return storage
    ? createLocalStorageRepository({ ...opts, storage })
    : createMemoryRepository(opts.seed, () => opts.onNotice?.(NOT_SAVED));
}

/** What one read of the key found. `items` holds every valid item; `clean` is false when some were not. */
interface StoredRead<T> {
  raw: string | null;
  items: T[];
  clean: boolean;
  skipped: number;
  /** True when the whole value could not be read (bad JSON, wrong version or shape). */
  unreadable: boolean;
}

/**
 * Stores `{ version: 1, items }` under one key. Every change is applied to what is stored at
 * that moment (re-read just before writing), so two tabs saving different items keep both and
 * an item removed in one tab is not brought back by the other. Changes whose write failed stay
 * in memory and are applied again on the next write. Data that could not be fully read is
 * copied to `<key>.backup` before the key is first overwritten; if that copy cannot be written,
 * nothing is overwritten. `seed` is used only when the key has never been written.
 *
 * With `discardFailed`, a change whose write failed is dropped instead of kept in memory: the
 * list stays what is really stored, so a caller can say plainly that nothing was saved (`save`
 * and `remove` return false either way).
 */
export function createLocalStorageRepository<T extends { id: string }>(opts: {
  key: string;
  schema: z.ZodType<T>;
  storage?: Storage;
  onNotice?: (message: string) => void;
  seed?: T[];
  discardFailed?: boolean;
}): Repository<T> {
  const { key, schema, onNotice } = opts;
  const storage = opts.storage ?? getBrowserStorage();
  let items: T[] | null = null;
  // Original text of data that could not be fully read; copied aside before the first write.
  let pendingBackup: string | null = null;
  // Changes not yet written: the saved item, or null for a removal, by id in change order.
  const unsynced = new Map<string, T | null>();

  /** Reads and validates the stored value. Throws when getItem throws. */
  const read = (): StoredRead<T> => {
    const raw = storage ? storage.getItem(key) : null;
    const none = { raw, items: [], clean: false, skipped: 0, unreadable: true };
    if (raw === null)
      return { ...none, items: [...(opts.seed ?? [])], clean: true, unreadable: false };
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return none;
    }
    if (
      typeof data !== 'object' ||
      data === null ||
      (data as { version?: unknown }).version !== 1 ||
      !Array.isArray((data as { items?: unknown }).items)
    ) {
      return none;
    }
    const valid: T[] = [];
    let skipped = 0;
    for (const item of (data as { items: unknown[] }).items) {
      const parsed = schema.safeParse(item);
      if (parsed.success) valid.push(parsed.data);
      else skipped += 1;
    }
    return { raw, items: valid, clean: skipped === 0, skipped, unreadable: false };
  };

  /** The stored items with this instance's unwritten changes applied; null if reading threw. */
  const readMerged = (): T[] | null => {
    let r: StoredRead<T>;
    try {
      r = read();
    } catch {
      return null;
    }
    if (!r.clean && r.raw !== null && pendingBackup === null) pendingBackup = r.raw;
    let merged = r.items;
    for (const [id, item] of unsynced) {
      if (item === null) merged = merged.filter((i) => i.id !== id);
      else if (merged.some((i) => i.id === id))
        merged = merged.map((i) => (i.id === id ? item : i));
      else merged = [...merged, item];
    }
    return merged;
  };

  const load = (): T[] => {
    let r: StoredRead<T>;
    try {
      r = read();
    } catch {
      onNotice?.(UNREADABLE);
      return [];
    }
    if (r.unreadable) {
      pendingBackup = r.raw;
      onNotice?.(UNREADABLE + BACKED_UP);
    } else if (r.skipped > 0) {
      pendingBackup = r.raw;
      onNotice?.(`${r.skipped} saved item(s) could not be read and were skipped.${THEY_BACKED_UP}`);
    }
    return r.items;
  };

  const current = (): T[] => (items ??= load());

  /**
   * Records one change, merges it into what is stored now and writes the result. Returns
   * whether it was written.
   */
  const change = (id: string, item: T | null): boolean => {
    const before = current();
    const failed = (notice: string): false => {
      onNotice?.(notice);
      if (opts.discardFailed) {
        // The change is given up: the list is again what is stored (or what it was).
        unsynced.delete(id);
        items = readMerged() ?? before;
      }
      return false;
    };
    unsynced.delete(id); // re-insert so the change order is kept
    unsynced.set(id, item);
    items = readMerged() ?? applyLocal(before, id, item);
    if (pendingBackup !== null) {
      try {
        if (!storage) throw new Error('no storage');
        storage.setItem(`${key}.backup`, pendingBackup);
        pendingBackup = null;
      } catch {
        return failed(BACKUP_FAILED); // the change stays in memory and unwritten
      }
    }
    try {
      if (!storage) throw new Error('no storage');
      storage.setItem(key, JSON.stringify({ version: 1, items }));
      unsynced.clear();
      return true;
    } catch {
      return failed(NOT_SAVED);
    }
  };

  return {
    list: () => [...current()],
    save: (item) => change(item.id, item),
    remove: (id) => change(id, null),
    refresh() {
      if (items === null) return;
      items = readMerged() ?? items;
    },
  };
}

/** `list` with one change applied, used when storage cannot be read at all. */
function applyLocal<T extends { id: string }>(list: T[], id: string, item: T | null): T[] {
  if (item === null) return list.filter((i) => i.id !== id);
  return list.some((i) => i.id === id)
    ? list.map((i) => (i.id === id ? item : i))
    : [...list, item];
}
