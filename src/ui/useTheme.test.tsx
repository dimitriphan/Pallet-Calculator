import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage } from '../persistence/testStorage';
import { createPrefsStore } from '../store/prefsStore';
import { makeStores } from './testUtils';
import { StoreProvider } from './StoreContext';
import { useTheme } from './useTheme';

class FakeMediaQuery {
  matches: boolean;
  listeners = new Set<(e: { matches: boolean }) => void>();
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_: string, fn: (e: { matches: boolean }) => void) {
    this.listeners.add(fn);
  }
  removeEventListener(_: string, fn: (e: { matches: boolean }) => void) {
    this.listeners.delete(fn);
  }
  dispatch(matches: boolean) {
    this.matches = matches;
    this.listeners.forEach((fn) => fn({ matches }));
  }
}

let mq: FakeMediaQuery;

function setup(theme: 'system' | 'light' | 'dark') {
  const prefs = createPrefsStore(new FakeStorage(), { viewMode: 'full', theme });
  const stores = { ...makeStores(), prefs };
  const hook = renderHook(() => useTheme(), {
    wrapper: ({ children }) => <StoreProvider stores={stores}>{children}</StoreProvider>,
  });
  return { prefs, ...hook };
}

const isDark = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  mq = new FakeMediaQuery(false);
  vi.stubGlobal('matchMedia', () => mq);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

describe('useTheme', () => {
  it('adds the dark class for the dark preference and removes it for light', () => {
    const { prefs, result } = setup('dark');
    expect(isDark()).toBe(true);
    expect(result.current).toBe('dark');
    act(() => prefs.getState().setTheme('light'));
    expect(isDark()).toBe(false);
    expect(result.current).toBe('light');
  });

  it('follows the system live while the preference is system, then stops', () => {
    const { prefs, result } = setup('system');
    expect(isDark()).toBe(false);
    act(() => mq.dispatch(true));
    expect(isDark()).toBe(true);
    expect(result.current).toBe('dark');
    act(() => mq.dispatch(false));
    expect(isDark()).toBe(false);
    act(() => prefs.getState().setTheme('light'));
    expect(mq.listeners.size).toBe(0);
    act(() => mq.dispatch(true));
    expect(isDark()).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = setup('system');
    expect(mq.listeners.size).toBe(1);
    unmount();
    expect(mq.listeners.size).toBe(0);
  });

  it('treats a missing matchMedia as a light system', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = setup('system');
    expect(result.current).toBe('light');
    expect(isDark()).toBe(false);
  });
});
