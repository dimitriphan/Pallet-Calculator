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
    const offenders = components.filter(([, text]) => pattern.test(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

/** Class-like tokens of a source file: runs of characters that can make up a utility. */
const tokensOf = (text: string) => text.split(/[\s"'`{}()]+/).filter(Boolean);

/** String literals of a source file, each standing for the classes of one element or state. */
const literalsOf = (text: string) => text.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [];

const offendersBy = (match: (text: string) => string[]) =>
  components.flatMap(([path, text]) => match(text).map((hit) => `${path}: ${hit}`));

describe('focus ticks only', () => {
  it('no ring utility is left', () => {
    const rings = (text: string) =>
      tokensOf(text).filter((token) => /(?:^|:)ring(?:-|$)/.test(token));
    expect(offendersBy(rings)).toEqual([]);
  });

  it('no focus state changes a border', () => {
    const borders = (text: string) =>
      tokensOf(text).filter((token) => /(?:^|:)focus(?:-visible|-within)?:border-/.test(token));
    expect(offendersBy(borders)).toEqual([]);
  });

  it('no focus state draws a coloured or sized outline', () => {
    const outlines = (text: string) =>
      tokensOf(text).filter(
        (token) =>
          /(?:^|:)focus(?:-visible|-within)?:-?outline/.test(token) &&
          !/:outline-none$/.test(token),
      );
    expect(offendersBy(outlines)).toEqual([]);
  });
});

describe('Harbor colours', () => {
  it('no dark: utility uses a default Tailwind palette colour', () => {
    const OLD =
      /dark:(?:[a-z-]+:)*(?:bg|text|border|ring|divide|outline|placeholder|accent|fill|stroke|decoration|from|via|to)(?:-[xytrblse])?-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/g;
    expect(offendersBy((text) => text.match(OLD) ?? [])).toEqual([]);
  });

  it('every harbor- colour utility sits behind the dark: variant', () => {
    const leaks = (text: string) =>
      tokensOf(text).filter(
        (token) => /-harbor-[a-z]/.test(token) && !token.split(':').slice(0, -1).includes('dark'),
      );
    expect(offendersBy(leaks)).toEqual([]);
  });

  it('Harbor text is never dimmed with an alpha value', () => {
    const dimmed = (text: string) =>
      tokensOf(text).filter((token) => /(?:^|:)text-harbor-[a-z-]+\/\d+/.test(token));
    expect(offendersBy(dimmed)).toEqual([]);
  });

  it('Harbor text is never faded with an opacity utility', () => {
    // Class strings that may fade in Light but not in Harbor; none are exempt today.
    const EXEMPT: string[] = [];
    const faded = ([path, text]: [string, string]) =>
      path === '/src/App.tsx' || path.startsWith('/src/ui/')
        ? literalsOf(text)
            .filter((literal) => /(?:^|[\s:'])opacity-(?!100\b)\d+/.test(literal))
            .filter((literal) => !/(?:^|\s)dark:opacity-100\b/.test(literal))
            .filter((literal) => !EXEMPT.includes(literal))
            .map((literal) => `${path}: ${literal}`)
        : [];
    expect(components.flatMap(faded)).toEqual([]);
  });

  it('green is never text on a raised background', () => {
    const greenOnRaised = (text: string) =>
      literalsOf(text).filter(
        (literal) =>
          /(?:^|\s)dark:text-harbor-green\b/.test(literal) &&
          /(?:^|\s)dark:bg-harbor-raised\b/.test(literal),
      );
    expect(offendersBy(greenOnRaised)).toEqual([]);
  });
});
