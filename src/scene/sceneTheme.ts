import { HARBOR } from '../theme/tokens';

/** 3D colours that are the same in both themes and in every export. */
export interface FixedSceneColors {
  /** The headroom and gap blocks of the unused-space overlay, drawn at unusedSpaceOpacity. */
  unusedSpace: string;
  unusedSpaceOpacity: number;
  /**
   * The manual layout editor's error colour: a carton dragged over another, and the tint and
   * outline of cartons outside the allowed footprint.
   */
  cartonError: string;
  /** A carton that lies turned in the editor's layer view (an unturned one is `carton`). */
  carton: string;
  cartonTurned: string;
  /** The outline of the usable footprint in the editor: the envelope's blue of the normal view. */
  footprintOutline: string;
}

const FIXED: FixedSceneColors = {
  unusedSpace: '#EF4444',
  unusedSpaceOpacity: 0.25,
  cartonError: '#EF4444',
  carton: '#d9a066',
  cartonTurned: '#b9783a',
  footprintOutline: '#3b82f6',
};

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
  /** The fixed colours, identical in both themes. */
  fixed: FixedSceneColors;
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
  fixed: FIXED,
};

// Harbor: the viewport colour with faint grid lines, foam on deep chips and foam lines. drei's
// Grid has no opacity, so the lines are mist pre-blended over the viewport colour: 12% for the
// cells (#395265) and 30% for the sections (#526A7A); full-strength mist would dominate the view.
const HARBOR_SCENE: SceneTheme = {
  background: HARBOR.viewport,
  gridCell: '#395265',
  gridSection: '#526A7A',
  chipBg: HARBOR.deep,
  chipText: HARBOR.foam,
  measureLine: HARBOR.foam,
  fixed: FIXED,
};

export function sceneTheme(theme: 'light' | 'harbor'): SceneTheme {
  return theme === 'harbor' ? HARBOR_SCENE : LIGHT;
}
