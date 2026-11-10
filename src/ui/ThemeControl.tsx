import { useId } from 'react';
import type { ThemePref } from '../store/prefsStore';
import { usePrefs, useStores } from './StoreContext';

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Theme preference: follow the system, or force light or dark. */
export function ThemeControl() {
  const { prefs } = useStores();
  const theme = usePrefs((s) => s.theme);
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-gray-700 dark:text-gray-300">
        Theme
      </label>
      <select
        id={id}
        value={theme}
        onChange={(e) => prefs.getState().setTheme(e.target.value as ThemePref)}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:border-blue-400 dark:focus:ring-blue-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
