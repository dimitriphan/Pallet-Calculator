import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { HARBOR, HARBOR_TEXT_PAIRS } from './tokens';

type Pair = (typeof HARBOR_TEXT_PAIRS)[number];
const has = (text: Pair['text'], on: Pair['on']) =>
  HARBOR_TEXT_PAIRS.some((p) => p.text === text && p.on === on);

describe('HARBOR tokens', () => {
  it('has the exact hex values of the spec', () => {
    expect(HARBOR).toEqual({
      deep: '#1E3347',
      panel: '#2E4A62',
      raised: '#35546D',
      teal: '#3F8F96',
      tealFill: '#34767C',
      tealText: '#A3CACD',
      foam: '#E9F1EE',
      mist: '#B4C8CF',
      coral: '#E2725B',
      coralText: '#F0B5A9',
      sand: '#D8C49A',
      green: '#7BCF80',
      viewport: '#284256',
    });
  });
});

describe('HARBOR_TEXT_PAIRS', () => {
  it.each(HARBOR_TEXT_PAIRS.map((p) => [`${p.text} on ${p.on}`, p] as const))(
    '%s is at least 4.5:1',
    (_name, p) => {
      expect(contrastRatio(HARBOR[p.text], HARBOR[p.on])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('lists every pairing of spec 4.1 and nothing else', () => {
    const grid: [Pair['text'], Pair['on'][]][] = [
      ['foam', ['deep', 'panel', 'raised']],
      ['mist', ['deep', 'panel', 'raised']],
      ['tealText', ['deep', 'panel', 'raised']],
      ['coralText', ['deep', 'panel', 'raised']],
      ['sand', ['deep', 'panel', 'raised']],
      ['green', ['deep', 'panel']],
    ];
    for (const [text, ons] of grid) for (const on of ons) expect(has(text, on)).toBe(true);
    expect(has('foam', 'tealFill')).toBe(true);
    expect(has('deep', 'sand')).toBe(true);
    expect(has('deep', 'green')).toBe(true);
    expect(has('foam', 'viewport')).toBe(true);
    expect(has('mist', 'viewport')).toBe(true);
    expect(HARBOR_TEXT_PAIRS).toHaveLength(18 - 1 + 5);
  });

  it('never has green on raised', () => {
    expect(has('green', 'raised')).toBe(false);
  });

  it('matches the ratios printed in the spec', () => {
    const r = (t: Pair['text'], o: Pair['on']) => contrastRatio(HARBOR[t], HARBOR[o]).toFixed(2);
    expect(r('foam', 'deep')).toBe('11.29');
    expect(r('foam', 'panel')).toBe('8.05');
    expect(r('foam', 'raised')).toBe('6.92');
    expect(r('mist', 'raised')).toBe('4.58');
    expect(r('tealText', 'raised')).toBe('4.50');
    expect(r('coralText', 'raised')).toBe('4.50');
    expect(r('sand', 'raised')).toBe('4.65');
    expect(r('green', 'panel')).toBe('4.88');
    expect(r('foam', 'tealFill')).toBe('4.54');
    expect(r('deep', 'sand')).toBe('7.58');
    expect(r('deep', 'green')).toBe('6.84');
  });
});
