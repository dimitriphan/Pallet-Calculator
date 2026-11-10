import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { resolveTheme } from '../store/prefsStore';
import { usePrefs } from './StoreContext';

const QUERY = '(prefers-color-scheme: dark)';

/** jsdom and very old browsers have no matchMedia: treat the system as light. */
function systemMedia(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

const systemIsDark = () => systemMedia()?.matches ?? false;

/**
 * The theme in effect, without touching the DOM. While the preference is "system" it follows the
 * operating system live.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const pref = usePrefs((s) => s.theme);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = pref === 'system' ? systemMedia() : null;
      if (!media) return () => {};
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [pref],
  );
  const systemDark = useSyncExternalStore(subscribe, systemIsDark);
  return resolveTheme(pref, systemDark);
}

/**
 * Applies the "dark" class on <html> for the resolved theme and returns it. Call it once, at the
 * top of the app; everything else reads the theme with `useResolvedTheme`.
 */
export function useTheme(): 'light' | 'dark' {
  const resolved = useResolvedTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  return resolved;
}
