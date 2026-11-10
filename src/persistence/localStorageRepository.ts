import type { z } from 'zod';
import { createMemoryRepository, type Repository } from './repository';

const UNREADABLE = 'Saved data could not be read.';
const KEPT_BACKUP = ' A backup copy was kept.';
const NOT_SAVED = 'Could not save: browser storage is full or unavailable.';

/** The browser's Local Storage, or null when it is missing or access throws. */
export function getBrowserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Local Storage when usable, otherwise a repository that lives only in memory. */
export function createDefaultRepository<T extends { id: string }>(opts: {
  key: string;
  schema: z.ZodType<T>;
  seed?: T[];
  onNotice?: (message: string) => void;
}): Repository<T> {
  const storage = getBrowserStorage();
  return storage
    ? createLocalStorageRepository({ ...opts, storage })
    : createMemoryRepository(opts.seed, () => opts.onNotice?.(NOT_SAVED));
}

/**
 * Stores `{ version: 1, items }` under one key. The first read is cached, so items stay
 * available in memory even when a write fails. `seed` is used only when the key has never
 * been written (it is not written until the first change).
 */
export function createLocalStorageRepository<T extends { id: string }>(opts: {
  key: string;
  schema: z.ZodType<T>;
  storage?: Storage;
  onNotice?: (message: string) => void;
  seed?: T[];
}): Repository<T> {
  const { key, schema, onNotice } = opts;
  const storage = opts.storage ?? getBrowserStorage();
  let items: T[] | null = null;
  // Original text of data that could not be fully read; copied aside before the first write.
  let pendingBackup: string | null = null;

  const load = (): T[] => {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(key) ?? null;
      if (raw === null) return [...(opts.seed ?? [])];
      const data: unknown = JSON.parse(raw);
      if (
        typeof data !== 'object' ||
        data === null ||
        (data as { version?: unknown }).version !== 1 ||
        !Array.isArray((data as { items?: unknown }).items)
      ) {
        pendingBackup = raw;
        onNotice?.(UNREADABLE + KEPT_BACKUP);
        return [];
      }
      const valid: T[] = [];
      let skipped = 0;
      for (const item of (data as { items: unknown[] }).items) {
        const parsed = schema.safeParse(item);
        if (parsed.success) valid.push(parsed.data);
        else skipped += 1;
      }
      if (skipped > 0) {
        pendingBackup = raw;
        onNotice?.(`${skipped} saved item(s) could not be read and were skipped.${KEPT_BACKUP}`);
      }
      return valid;
    } catch {
      if (raw !== null) pendingBackup = raw;
      onNotice?.(raw === null ? UNREADABLE : UNREADABLE + KEPT_BACKUP);
      return [];
    }
  };

  const current = (): T[] => (items ??= load());

  const persist = (): void => {
    if (pendingBackup !== null) {
      try {
        storage?.setItem(`${key}.backup`, pendingBackup);
      } catch {
        // the main write below still gets its chance
      }
      pendingBackup = null;
    }
    try {
      if (!storage) throw new Error('no storage');
      storage.setItem(key, JSON.stringify({ version: 1, items }));
    } catch {
      onNotice?.(NOT_SAVED);
    }
  };

  return {
    list: () => [...current()],
    save(item) {
      const all = current();
      items = all.some((i) => i.id === item.id)
        ? all.map((i) => (i.id === item.id ? item : i))
        : [...all, item];
      persist();
    },
    remove(id) {
      items = current().filter((i) => i.id !== id);
      persist();
    },
  };
}
