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

  it('uses a dark background, mid-grey grid lines and light-on-dark chips in dark', () => {
    const dark = sceneTheme('dark');
    expect(dark.background).toBe('#111827');
    expect(dark.gridCell).toBe('#4b5563');
    expect(dark.gridSection).toBe('#9ca3af');
    expect(dark.chipBg).toBe('rgba(31, 41, 55, 0.9)');
    expect(dark.chipText).toBe('#f3f4f6');
    expect(dark.measureLine).toBe('#d1d5db');
  });

  it('differs between the themes in every field but the grid section colour', () => {
    // The brief fixes the grid section colour at #9ca3af in both themes: a mid-grey that
    // shows on the light and the dark background alike.
    const light = sceneTheme('light');
    const dark = sceneTheme('dark');
    const keys = Object.keys(light) as (keyof SceneTheme)[];
    expect(keys.filter((k) => light[k] === dark[k])).toEqual(['gridSection']);
  });
});
