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
 * Applies the "dark" class on <html> for the resolved theme and returns it. While the preference
 * is "system" it follows the operating system live.
 */
export function useTheme(): 'light' | 'dark' {
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
  const resolved = resolveTheme(pref, systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  return resolved;
}
