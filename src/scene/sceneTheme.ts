/** Colours of the 3D view that follow the theme. Loads, envelope and selection never change. */
export interface SceneTheme {
  background: string;
  gridCell: string;
  gridSection: string;
  /** Background and text of the label and measurement chips drawn over the scene. */
  chipBg: string;
  chipText: string;
  /** Colour of the measurement dimension lines. */
  measureLine: string;
}

/** The scene background of the light theme, which every PNG and PDF export uses. */
export const LIGHT_BACKGROUND = '#f3f4f6';

/** Measurement line colour of the light theme, also used for exports. */
export const LIGHT_MEASURE_LINE = '#111827';

const LIGHT: SceneTheme = {
  background: LIGHT_BACKGROUND,
  gridCell: '#d1d5db',
  gridSection: '#9ca3af',
  chipBg: 'rgba(255, 255, 255, 0.9)',
  chipText: '#1f2937',
  measureLine: LIGHT_MEASURE_LINE,
};

// The grid greys stay visible on the light background, which exports render with.
const DARK: SceneTheme = {
  background: '#111827',
  gridCell: '#4b5563',
  gridSection: '#9ca3af',
  chipBg: 'rgba(31, 41, 55, 0.9)',
  chipText: '#f3f4f6',
  measureLine: '#d1d5db',
};

export function sceneTheme(theme: 'light' | 'dark'): SceneTheme {
  return theme === 'dark' ? DARK : LIGHT;
}
