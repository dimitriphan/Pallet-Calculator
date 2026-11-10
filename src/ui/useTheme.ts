import { useEffect } from 'react';
import { usePrefs } from './StoreContext';

/** The theme in effect, without touching the DOM. */
export function useResolvedTheme(): 'harbor' | 'light' {
  return usePrefs((s) => s.theme);
}

/**
 * Applies the "harbor" class on <html> for the theme and returns it. Call it once, at the top of
 * the app; everything else reads the theme with `useResolvedTheme`.
 */
export function useTheme(): 'harbor' | 'light' {
  const theme = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('harbor', theme === 'harbor');
    // An older version of the app marked dark mode with this class.
    root.classList.remove('dark');
  }, [theme]);

  return theme;
}
