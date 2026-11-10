import { describe, expect, it } from 'vitest';

/**
 * Display numbers and unit suffixes go through src/ui/format.ts, so a unit switch reaches
 * everything shown. This scans the interface, 3D view and export sources for numbers formatted
 * by hand or units written out.
 */
const sources = import.meta.glob('/src/{ui,scene,export}/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Files allowed to format numbers and name units. */
const ALLOWED = new Set(['/src/ui/format.ts', '/src/ui/UnitControl.tsx']);

const scanned = Object.entries(sources).filter(
  ([path]) => !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !ALLOWED.has(path),
);

/** Source without comments, so prose about inches in a comment is not flagged. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const UNIT = '(?:in|cm|mm|lb|kg)';
/** What each forbidden pattern catches. */
const FORBIDDEN: [string, RegExp][] = [
  ['toFixed', /\.toFixed\(/],
  // "12.00 in", `${x} in`, "{dims} in": a number or interpolation followed by a unit (but
  // not the prose "Product 3 in carton 2").
  ['number then unit', new RegExp(`[\\d}] ${UNIT}\\b(?! carton\\b)`)],
  // ' in', " cm", ` mm`: a literal that starts with a unit suffix.
  ['unit suffix literal', new RegExp(`['"\`] ${UNIT}\\b`)],
  // "(in)" in a column or row title.
  ['unit in brackets', new RegExp(`\\(${UNIT}\\)`)],
  // in², in³, cm²: area and volume labels.
  ['area or volume label', /\b(?:in|cm|mm)[²³]/],
  // suffix="in", suffix = 'cm': a unit given as a field suffix.
  ['unit as suffix prop', new RegExp(`suffix\\s*=\\s*['"{]*${UNIT}['"]`)],
  // "5-inch", "5 inches".
  ['spelled-out inches', /\binch(?:es)?\b/],
  // The formatters come from format.ts; engine/units gives display code only its types.
  ['value import from engine/units', /^import (?!type )[^;]*from '[./]*engine\/units\/units'/],
];

describe('display formatting guard', () => {
  it('scans the interface, 3D view and export sources', () => {
    const paths = scanned.map(([p]) => p);
    expect(paths).toContain('/src/ui/InputsPanel.tsx');
    expect(paths).toContain('/src/scene/sceneGeometry.ts');
    expect(paths).toContain('/src/export/csv.ts');
    expect(paths).not.toContain('/src/ui/format.ts');
  });

  it.each([
    ['toFixed', 'x.toFixed(2)'],
    ['number then unit', '`${formatNumber(v)} in`'],
    ['number then unit', '{formatDims(p.pallet)} in ·'],
    ['number then unit', "'5.00 cm'"],
    ['unit suffix literal', "const s = ' in';"],
    ['unit in brackets', "'Carton (in)'"],
    ['area or volume label', "'Volume used (in³)'"],
    ['area or volume label', '`${n} cm²`'],
    ['unit as suffix prop', "suffix = 'in',"],
    ['unit as suffix prop', 'suffix="mm"'],
    ['spelled-out inches', 'A 5-inch pallet'],
    ['value import from engine/units', "import { formatNumber } from '../engine/units/units';"],
  ])('the %s pattern catches %s', (name, sample) => {
    const pattern = FORBIDDEN.find(([n]) => n === name)?.[1];
    expect(pattern?.test(sample)).toBe(true);
  });

  it.each([
    "jsPDF({ unit: 'in', format: 'letter' })",
    'Click an object in the 3D view',
    'Search was limited to keep it fast',
    '`Product ${p} in carton ${c}`',
    '{ in: 1, cm: 2.54 }',
    'suffix="boxes"',
    "import type { Unit } from '../engine/units/units';",
  ])('does not flag ordinary code or prose: %s', (sample) => {
    expect(FORBIDDEN.filter(([, p]) => p.test(sample)).map(([n]) => n)).toEqual([]);
  });

  it.each(FORBIDDEN)('no file has a %s outside format.ts', (_name, pattern) => {
    const offenders = scanned.flatMap(([path, text]) =>
      code(text)
        .split('\n')
        .filter((line) => pattern.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
