import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createDefaultRepository,
  createLocalStorageRepository,
  getBrowserStorage,
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
      '1 saved item(s) could not be read and were skipped. A backup copy was kept.',
    ]);
  });

  it('returns [] with a notice for unparseable JSON', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, '{not json');
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual(['Saved data could not be read. A backup copy was kept.']);
  });

  it('returns [] with a notice for a wrong version or shape', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, JSON.stringify({ version: 2, items: [] }));
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual(['Saved data could not be read. A backup copy was kept.']);
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

    it('still writes the main key when the backup write fails', () => {
      const storage = new FakeStorage();
      storage.setItem(KEY, '{not json');
      const realSet = storage.setItem.bind(storage);
      storage.setItem = (k, v) => {
        if (k.endsWith('.backup')) throw new Error('quota');
        realSet(k, v);
      };
      const { repo } = setup(storage);
      repo.save({ id: 'a', n: 1 });
      expect(JSON.parse(storage.getItem(KEY)!).items).toHaveLength(1);
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
