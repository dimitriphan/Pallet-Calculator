import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const components = Object.entries(sources).filter(([path]) => !path.endsWith('.test.tsx'));

describe('square, flat shapes', () => {
  it('scans the component sources', () => {
    expect(components.length).toBeGreaterThan(10);
  });

  it.each(['rounded', 'shadow'])('no class token starts with "%s"', (prefix) => {
    const pattern = new RegExp(`(?<![\\w-])${prefix}|boxShadow`);
    const offenders = components
      .filter(([, text]) => pattern.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
