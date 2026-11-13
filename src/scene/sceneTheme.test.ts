import { describe, expect, it } from 'vitest';
import { LIGHT_BACKGROUND, sceneTheme, type SceneTheme } from './sceneTheme';

const FIXED = {
  unusedSpace: '#EF4444',
  unusedSpaceOpacity: 0.25,
  cartonError: '#EF4444',
  carton: '#d9a066',
  cartonTurned: '#b9783a',
};

describe('sceneTheme', () => {
  it('keeps the light scene colours of today', () => {
    expect(LIGHT_BACKGROUND).toBe('#f3f4f6');
    expect(sceneTheme('light')).toEqual({
      background: '#f3f4f6',
      gridCell: '#d1d5db',
      gridSection: '#9ca3af',
      chipBg: 'rgba(255, 255, 255, 0.9)',
      chipText: '#1f2937',
      measureLine: '#111827',
      fixed: FIXED,
    });
  });

  it('uses the viewport colour, faint pre-blended grid lines and deep chips in harbor', () => {
    expect(sceneTheme('harbor')).toEqual({
      background: '#284256',
      gridCell: '#395265',
      gridSection: '#526A7A',
      chipBg: '#1E3347',
      chipText: '#E9F1EE',
      measureLine: '#E9F1EE',
      fixed: FIXED,
    });
  });

  it('differs between the themes in every field but the fixed colours', () => {
    const light = sceneTheme('light');
    const harbor = sceneTheme('harbor');
    const keys = Object.keys(light) as (keyof SceneTheme)[];
    expect(keys.filter((k) => light[k] === harbor[k])).toEqual(['fixed']);
  });

  it('keeps the unused-space red at 25% in both themes', () => {
    for (const t of ['light', 'harbor'] as const) {
      expect(sceneTheme(t).fixed).toMatchObject({
        unusedSpace: '#EF4444',
        unusedSpaceOpacity: 0.25,
      });
    }
  });
});
