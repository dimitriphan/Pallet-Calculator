import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage } from '../persistence/testStorage';
import { createPrefsStore, type ThemePref } from '../store/prefsStore';
import { makeStores } from './testUtils';
import { StoreProvider } from './StoreContext';
import { useResolvedTheme, useTheme } from './useTheme';

function setup(theme: ThemePref, hook: () => ThemePref = useTheme) {
  const prefs = createPrefsStore(new FakeStorage(), { viewMode: 'full', theme });
  const stores = { ...makeStores(), prefs };
  const rendered = renderHook(hook, {
    wrapper: ({ children }) => <StoreProvider stores={stores}>{children}</StoreProvider>,
  });
  return { prefs, ...rendered };
}

const root = document.documentElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  root.classList.remove('harbor', 'dark');
});

describe('useTheme', () => {
  it('adds the harbor class for harbor and removes it for light', () => {
    const { prefs, result } = setup('harbor');
    expect(root).toHaveClass('harbor');
    expect(result.current).toBe('harbor');
    act(() => prefs.getState().setTheme('light'));
    expect(root).not.toHaveClass('harbor');
    expect(result.current).toBe('light');
  });

  it('removes a stale dark class left by an older version', () => {
    root.classList.add('dark');
    setup('light');
    expect(root).not.toHaveClass('dark');
    root.classList.add('dark');
    setup('harbor');
    expect(root).not.toHaveClass('dark');
    expect(root).toHaveClass('harbor');
  });

  it('ignores the operating system setting', () => {
    const matchMedia = vi.fn();
    vi.stubGlobal('matchMedia', matchMedia);
    const { result } = setup('light');
    expect(result.current).toBe('light');
    expect(matchMedia).not.toHaveBeenCalled();
  });
});

describe('useResolvedTheme', () => {
  it('reads the theme without touching the document', () => {
    const { result } = setup('harbor', useResolvedTheme);
    expect(result.current).toBe('harbor');
    expect(root).not.toHaveClass('harbor');
  });
});
