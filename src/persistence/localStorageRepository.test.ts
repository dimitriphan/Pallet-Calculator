import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createDefaultRepository,
  createLocalStorageRepository,
  getBrowserStorage,
  onStorageChange,
} from './localStorageRepository';
import { FakeStorage } from './testStorage';

const schema = z.object({ id: z.string(), n: z.number() });
type Item = z.infer<typeof schema>;
const KEY = 'test.items';

function setup(storage = new FakeStorage()) {
  const notices: string[] = [];
  const repo = createLocalStorageRepository<Item>({
    key: KEY,
    schema,
    storage,
    onNotice: (m) => notices.push(m),
  });
  return { storage, notices, repo };
}

describe('createLocalStorageRepository', () => {
  it('round-trips save, list and remove', () => {
    const { storage, repo } = setup();
    repo.save({ id: 'a', n: 1 });
    repo.save({ id: 'b', n: 2 });
    repo.save({ id: 'a', n: 3 });
    expect(repo.list()).toEqual([
      { id: 'a', n: 3 },
      { id: 'b', n: 2 },
    ]);
    repo.remove('a');
    expect(repo.list()).toEqual([{ id: 'b', n: 2 }]);
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ version: 1, items: [{ id: 'b', n: 2 }] });
    expect(setup(storage).repo.list()).toEqual([{ id: 'b', n: 2 }]);
  });

  it('skips one corrupt item and reports it once', () => {
    const storage = new FakeStorage();
    storage.setItem(
      KEY,
      JSON.stringify({ version: 1, items: [{ id: 'a', n: 1 }, { id: 'x' }, { id: 'c', n: 3 }] }),
    );
    const { repo, notices } = setup(storage);
    expect(repo.list().map((i) => i.id)).toEqual(['a', 'c']);
    repo.list();
    expect(notices).toEqual([
      '1 saved item(s) could not be read and were skipped. They will be backed up before anything is overwritten.',
    ]);
  });

  it('returns [] with a notice for unparseable JSON', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, '{not json');
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual([
      'Saved data could not be read. It will be backed up before anything is overwritten.',
    ]);
  });

  it('returns [] with a notice for a wrong version or shape', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, JSON.stringify({ version: 2, items: [] }));
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual([
      'Saved data could not be read. It will be backed up before anything is overwritten.',
    ]);
  });

  it('returns [] with a notice when getItem throws', () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual(['Saved data could not be read.']);
  });

  it('reports a failed write and keeps the in-memory state', () => {
    const storage = new FakeStorage();
    storage.failWrites = true;
    const { repo, notices } = setup(storage);
    repo.save({ id: 'a', n: 1 });
    repo.save({ id: 'b', n: 2 });
    expect(notices).toEqual([
      'Could not save: browser storage is full or unavailable.',
      'Could not save: browser storage is full or unavailable.',
    ]);
    expect(repo.list()).toHaveLength(2);
  });

  it('seeds only when the key has never been written', () => {
    const seed = [{ id: 's', n: 9 }];
    const fresh = new FakeStorage();
    const a = createLocalStorageRepository<Item>({ key: KEY, schema, storage: fresh, seed });
    expect(a.list()).toEqual(seed);
    const written = new FakeStorage();
    written.setItem(KEY, JSON.stringify({ version: 1, items: [] }));
    const b = createLocalStorageRepository<Item>({ key: KEY, schema, storage: written, seed });
    expect(b.list()).toEqual([]);
  });

  describe('backup of unreadable data', () => {
    it('backs up a version-2 blob before the first save', () => {
      const storage = new FakeStorage();
      const original = JSON.stringify({ version: 2, items: [{ id: 'z' }] });
      storage.setItem(KEY, original);
      const { repo } = setup(storage);
      repo.save({ id: 'a', n: 1 });
      expect(storage.getItem(`${KEY}.backup`)).toBe(original);
      expect(JSON.parse(storage.getItem(KEY)!).version).toBe(1);
    });

    it('backs up when a corrupt item is skipped and an item is removed', () => {
      const storage = new FakeStorage();
      const original = JSON.stringify({
        version: 1,
        items: [{ id: 'a', n: 1 }, { id: 'x' }, { id: 'c', n: 3 }],
      });
      storage.setItem(KEY, original);
      const { repo } = setup(storage);
      repo.remove('a');
      expect(storage.getItem(`${KEY}.backup`)).toBe(original);
    });

    it('does not create a backup after a clean load', () => {
      const storage = new FakeStorage();
      storage.setItem(KEY, JSON.stringify({ version: 1, items: [{ id: 'a', n: 1 }] }));
      const { repo } = setup(storage);
      repo.save({ id: 'b', n: 2 });
      expect(storage.getItem(`${KEY}.backup`)).toBeNull();
    });

    it('does not overwrite the backup on a second write', () => {
      const storage = new FakeStorage();
      storage.setItem(KEY, '{not json');
      const { repo } = setup(storage);
      repo.save({ id: 'a', n: 1 });
      repo.save({ id: 'b', n: 2 });
      expect(storage.getItem(`${KEY}.backup`)).toBe('{not json');
    });

    it('leaves the main key unchanged and keeps the change when the backup write fails', () => {
      const storage = new FakeStorage();
      storage.setItem(KEY, '{not json');
      const realSet = storage.setItem.bind(storage);
      let backupFails = true;
      storage.setItem = (k, v) => {
        if (k.endsWith('.backup') && backupFails) throw new Error('quota');
        realSet(k, v);
      };
      const { repo, notices } = setup(storage);
      repo.save({ id: 'a', n: 1 });
      expect(storage.getItem(KEY)).toBe('{not json');
      expect(repo.list()).toEqual([{ id: 'a', n: 1 }]);
      expect(notices).toContain(
        'Could not keep a backup, so your change was not saved. Free up browser storage and try again.',
      );
      // Once the backup can be written, the kept change is saved with the next one.
      backupFails = false;
      repo.save({ id: 'b', n: 2 });
      expect(storage.getItem(`${KEY}.backup`)).toBe('{not json');
      expect(JSON.parse(storage.getItem(KEY)!).items.map((i: Item) => i.id)).toEqual(['a', 'b']);
    });
  });

  describe('two tabs sharing one key', () => {
    it('keeps the items both tabs saved', () => {
      const storage = new FakeStorage();
      const a = setup(storage).repo;
      const b = setup(storage).repo;
      expect(a.list()).toEqual([]);
      expect(b.list()).toEqual([]);
      a.save({ id: 'a', n: 1 });
      b.save({ id: 'b', n: 2 });
      expect(JSON.parse(storage.getItem(KEY)!).items).toEqual([
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
      ]);
      expect(b.list().map((i) => i.id)).toEqual(['a', 'b']);
    });

    it('does not bring back an item the other tab removed', () => {
      const storage = new FakeStorage();
      storage.setItem(KEY, JSON.stringify({ version: 1, items: [{ id: 'x', n: 0 }] }));
      const a = setup(storage).repo;
      const b = setup(storage).repo;
      expect(a.list().map((i) => i.id)).toEqual(['x']);
      expect(b.list().map((i) => i.id)).toEqual(['x']);
      b.remove('x');
      a.save({ id: 'y', n: 1 });
      expect(JSON.parse(storage.getItem(KEY)!).items).toEqual([{ id: 'y', n: 1 }]);
      expect(a.list()).toEqual([{ id: 'y', n: 1 }]);
    });

    it("refresh picks up the other tab's changes", () => {
      const storage = new FakeStorage();
      const a = setup(storage).repo;
      const b = setup(storage).repo;
      a.list();
      b.save({ id: 'b', n: 2 });
      expect(a.list()).toEqual([]);
      a.refresh?.();
      expect(a.list()).toEqual([{ id: 'b', n: 2 }]);
    });
  });

  describe('missing or throwing localStorage', () => {
    afterEach(() => vi.unstubAllGlobals());
    const NOT_SAVED = 'Could not save: browser storage is full or unavailable.';

    it('handles localStorage being undefined', () => {
      vi.stubGlobal('localStorage', undefined);
      expect(getBrowserStorage()).toBeNull();
      const notices: string[] = [];
      const repo = createDefaultRepository<Item>({
        key: KEY,
        schema,
        seed: [{ id: 's', n: 1 }],
        onNotice: (m) => notices.push(m),
      });
      expect(repo.list()).toEqual([{ id: 's', n: 1 }]);
      repo.save({ id: 'a', n: 1 });
      repo.save({ id: 'b', n: 2 });
      repo.remove('a');
      expect(notices).toEqual([NOT_SAVED]);
      expect(repo.list().map((i) => i.id)).toEqual(['s', 'b']);
    });

    it('handles access to localStorage throwing', () => {
      vi.stubGlobal('localStorage', undefined);
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('denied');
        },
      });
      expect(getBrowserStorage()).toBeNull();
      const notices: string[] = [];
      const repo = createDefaultRepository<Item>({
        key: KEY,
        schema,
        onNotice: (m) => notices.push(m),
      });
      expect(repo.list()).toEqual([]);
      repo.save({ id: 'a', n: 1 });
      expect(notices).toEqual([NOT_SAVED]);
    });
  });
});

describe('onStorageChange', () => {
  it('calls back for its key or a cleared storage, and stops after unsubscribing', () => {
    const calls: string[] = [];
    const stop = onStorageChange(KEY, () => calls.push('changed'));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(calls).toEqual(['changed', 'changed']);
  });
});
