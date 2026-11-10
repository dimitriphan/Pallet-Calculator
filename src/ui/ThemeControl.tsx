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
    <div className="flex items-center gap-1 xl:gap-2">
      <label
        htmlFor={id}
        className="sr-only text-sm text-gray-700 xl:not-sr-only dark:text-harbor-mist"
      >
        Theme
      </label>
      <span className="focus-ticks-within flex">
        <select
          id={id}
          value={theme}
          onChange={(e) => prefs.getState().setTheme(e.target.value as ThemePref)}
          className="border border-gray-300 bg-white px-1 py-1 text-sm focus:outline-none 2xl:px-2 dark:border-harbor-foam dark:bg-harbor-raised dark:text-harbor-foam"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
