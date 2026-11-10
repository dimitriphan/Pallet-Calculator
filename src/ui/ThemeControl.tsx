import { useId } from 'react';
import type { ThemePref } from '../store/prefsStore';
import { usePrefs, useStores } from './StoreContext';

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'harbor', label: 'Harbor' },
  { value: 'light', label: 'Light' },
];

/** Theme preference: Harbor or Light. */
export function ThemeControl() {
  const { prefs } = useStores();
  const theme = usePrefs((s) => s.theme);
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-gray-700 dark:text-harbor-mist">
        Theme
      </label>
      <select
        id={id}
        value={theme}
        onChange={(e) => prefs.getState().setTheme(e.target.value as ThemePref)}
        className="border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam dark:focus:border-harbor-teal-text dark:focus:ring-harbor-teal-text"
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
