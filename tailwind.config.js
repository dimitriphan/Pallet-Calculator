import { HARBOR } from './src/theme/tokens.ts';

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** @type {import('tailwindcss').Config} */
export default {
  // The Harbor theme is the one "dark" theme: `dark:` classes apply under `.harbor` on <html>.
  darkMode: ['selector', '.harbor'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        harbor: Object.fromEntries(Object.entries(HARBOR).map(([k, v]) => [kebab(k), v])),
      },
    },
  },
  plugins: [],
};
