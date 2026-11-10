import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLocalStorageRepository } from './localStorageRepository';
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
    expect(notices).toEqual(['1 saved item(s) could not be read and were skipped.']);
  });

  it('returns [] with a notice for unparseable JSON', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, '{not json');
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual(['Saved data could not be read.']);
  });

  it('returns [] with a notice for a wrong version or shape', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, JSON.stringify({ version: 2, items: [] }));
    const { repo, notices } = setup(storage);
    expect(repo.list()).toEqual([]);
    expect(notices).toEqual(['Saved data could not be read.']);
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
});
