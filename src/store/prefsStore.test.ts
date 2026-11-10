import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../persistence/keys';
import { FakeStorage } from '../persistence/testStorage';
import { createPrefsStore, resolveTheme } from './prefsStore';

describe('prefsStore', () => {
  it('defaults to basic view and system theme', () => {
    const s = createPrefsStore(new FakeStorage()).getState();
    expect(s.viewMode).toBe('basic');
    expect(s.theme).toBe('system');
  });

  it('persists changes across store instances', () => {
    const storage = new FakeStorage();
    const a = createPrefsStore(storage);
    a.getState().setViewMode('full');
    a.getState().setTheme('dark');
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.prefs) ?? '')).toEqual({
      viewMode: 'full',
      theme: 'dark',
    });
    const b = createPrefsStore(storage).getState();
    expect(b.viewMode).toBe('full');
    expect(b.theme).toBe('dark');
  });

  it('falls back to defaults for unreadable or wrong-shaped data', () => {
    for (const raw of ['{bad', 'null', '[]', '"x"', '{"viewMode":1,"theme":2}']) {
      const storage = new FakeStorage();
      storage.setItem(STORAGE_KEYS.prefs, raw);
      const s = createPrefsStore(storage).getState();
      expect([s.viewMode, s.theme]).toEqual(['basic', 'system']);
    }
  });

  it('keeps the valid part of partly valid data', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEYS.prefs, '{"viewMode":"wide","theme":"dark"}');
    const s = createPrefsStore(storage).getState();
    expect([s.viewMode, s.theme]).toEqual(['basic', 'dark']);
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
    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('dark');
  });

  it('lets initial override stored values', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEYS.prefs, '{"viewMode":"basic","theme":"dark"}');
    const s = createPrefsStore(storage, { viewMode: 'full', theme: 'light' }).getState();
    expect([s.viewMode, s.theme]).toEqual(['full', 'light']);
  });
});

describe('resolveTheme', () => {
  it('follows the system only for the system preference', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
