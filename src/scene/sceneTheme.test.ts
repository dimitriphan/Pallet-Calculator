import { describe, expect, it } from 'vitest';
import { LIGHT_BACKGROUND, sceneTheme, type SceneTheme } from './sceneTheme';

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
    });
  });

  it('uses the viewport colour, mist grid lines and deep chips in harbor', () => {
    expect(sceneTheme('harbor')).toEqual({
      background: '#284256',
      gridCell: '#B4C8CF',
      gridSection: '#B4C8CF',
      chipBg: '#1E3347',
      chipText: '#E9F1EE',
      measureLine: '#E9F1EE',
    });
  });

  it('differs between the themes in every field', () => {
    const light = sceneTheme('light');
    const harbor = sceneTheme('harbor');
    const keys = Object.keys(light) as (keyof SceneTheme)[];
    expect(keys.filter((k) => light[k] === harbor[k])).toEqual([]);
  });
});
