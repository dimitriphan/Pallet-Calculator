import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { createPrefsStore } from './prefsStore';

describe('prefsStore', () => {
  it('defaults to basic view and the Harbor theme', () => {
    const s = createPrefsStore(new FakeStorage()).getState();
    expect(s.viewMode).toBe('basic');
    expect(s.theme).toBe('harbor');
  });

  it('persists changes across store instances', () => {
    const storage = new FakeStorage();
    const a = createPrefsStore(storage);
    a.getState().setViewMode('full');
    a.getState().setTheme('harbor');
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.prefs) ?? '')).toEqual({
      viewMode: 'full',
      theme: 'harbor',
    });
    const b = createPrefsStore(storage).getState();
    expect(b.viewMode).toBe('full');
    expect(b.theme).toBe('harbor');
  });

  it('falls back to defaults for unreadable or wrong-shaped data', () => {
    for (const raw of ['{bad', 'null', '[]', '"x"', '{"viewMode":1,"theme":2}']) {
      const storage = new FakeStorage();
      storage.setItem(STORAGE_KEYS.prefs, raw);
      const s = createPrefsStore(storage).getState();
      expect([s.viewMode, s.theme]).toEqual(['basic', 'harbor']);
    }
  });

  it('keeps the valid part of partly valid data', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEYS.prefs, '{"viewMode":"wide","theme":"light"}');
    const s = createPrefsStore(storage).getState();
    expect([s.viewMode, s.theme]).toEqual(['basic', 'light']);
  });

  it('keeps working when storage reads or writes throw', () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    storage.failWrites = true;
    const store = createPrefsStore(storage);
    expect(store.getState().viewMode).toBe('basic');
    store.getState().setViewMode('full');
    store.getState().setTheme('light');
    expect([store.getState().viewMode, store.getState().theme]).toEqual(['full', 'light']);
  });

  it('works without storage', () => {
    const store = createPrefsStore(null);
    store.getState().setTheme('harbor');
    expect(store.getState().theme).toBe('harbor');
  });

  it('lets initial override stored values', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEYS.prefs, '{"viewMode":"basic","theme":"harbor"}');
    const s = createPrefsStore(storage, { viewMode: 'full', theme: 'light' }).getState();
    expect([s.viewMode, s.theme]).toEqual(['full', 'light']);
  });
});

describe('theme preference migration', () => {
  const load = (raw: string | null) => {
    const storage = new FakeStorage();
    if (raw !== null) storage.setItem(STORAGE_KEYS.prefs, raw);
    return createPrefsStore(storage).getState().theme;
  };

  it.each([
    ['dark', 'harbor', '{"theme":"dark"}'],
    ['system', 'harbor', '{"theme":"system"}'],
    ['harbor', 'harbor', '{"theme":"harbor"}'],
    ['light', 'light', '{"theme":"light"}'],
    ['an unknown string', 'harbor', '{"theme":"x"}'],
    ['a non-string', 'harbor', '{"theme":3}'],
    ['a missing theme', 'harbor', '{"viewMode":"full"}'],
    ['corrupt JSON', 'harbor', '{bad'],
    ['nothing stored', 'harbor', null],
  ])('loads %s as %s', (_name, expected, raw) => {
    expect(load(raw)).toBe(expected);
  });

  it('writes only harbor or light', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEYS.prefs, '{"viewMode":"basic","theme":"dark"}');
    const store = createPrefsStore(storage);
    store.getState().setViewMode('full');
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.prefs) ?? '').theme).toBe('harbor');
    store.getState().setTheme('light');
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.prefs) ?? '').theme).toBe('light');
  });
});
