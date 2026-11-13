import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../engine/analytics/analytics';
import { buildManualLayout, canSave, isValidSpec } from '../engine/manual/build';
import {
  manualSpec,
  OVERHANG_INPUTS as I,
  overhangingLayout,
  resultOf,
} from '../engine/manual/testSupport';
import {
  manualLayoutListSchema,
  manualLayoutSpecSchema,
  MAX_STORED_CARTONS,
} from './manualSchemas';
import { scenarioSchema } from './schemas';

const GOOD = manualSpec({ id: 'a', name: 'Manual 1' });
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe('manualLayoutSpecSchema', () => {
  it('passes a stored layout unchanged, overhanging and negative positions included', () => {
    expect(manualLayoutSpecSchema.parse(json(GOOD))).toEqual(GOOD);
    expect(GOOD.cartons.some((c) => c.x < 0)).toBe(true);
    expect(manualLayoutSpecSchema.safeParse({ ...GOOD, cartons: [] }).success).toBe(true);
  });

  const at = (x: unknown, y: unknown = 0, rotated: unknown = false) => ({ x, y, rotated });
  const counts = (length: unknown, width: unknown = 1, height: unknown = 1) => ({
    ...GOOD.design,
    counts: { length, width, height },
  });
  const bad: [string, object][] = [
    ['no id', { id: '' }],
    ['a name that is not text', { name: 7 }],
    ['a position that is NaN', { cartons: [at(NaN)] }],
    ['a position that is infinite', { cartons: [at(0, Infinity)] }],
    ['a position that is negative infinity', { cartons: [at(-Infinity)] }],
    ['a position that is text', { cartons: [at('3')] }],
    ['a position that is null (NaN through JSON)', { cartons: [at(null)] }],
    ['a turn that is not true or false', { cartons: [at(0, 0, 'yes')] }],
    ['cartons that are not a list', { cartons: {} }],
    ['too many cartons', { cartons: Array(MAX_STORED_CARTONS + 1).fill(at(0)) }],
    ['a count of 0', { design: counts(0) }],
    ['a count of 1.5', { design: counts(2, 1.5) }],
    ['a count of -1', { design: counts(2, 2, -1) }],
    ['a count that is NaN', { design: counts(NaN) }],
    ['a count that is infinite', { design: counts(Infinity) }],
    ['a count that is text', { design: counts('2') }],
    ['a missing count', { design: { ...GOOD.design, counts: { length: 1, width: 1 } } }],
    ['an unknown facing', { design: { ...GOOD.design, facing: 'LLH' } }],
    ['an unknown side down', { design: { ...GOOD.design, sideDown: 'top' } }],
    ['an unknown upper-layer choice', { upperLayers: 'spiral' }],
    ['no design', { design: undefined }],
    ['no madeFor', { madeFor: undefined }],
    [
      'a product size of 0',
      { madeFor: { ...GOOD.madeFor, product: { length: 0, width: 8, height: 4 } } },
    ],
    [
      'a negative product size',
      { madeFor: { ...GOOD.madeFor, product: { length: -1, width: 8, height: 4 } } },
    ],
    [
      'an infinite product size',
      { madeFor: { ...GOOD.madeFor, product: { length: Infinity, width: 8, height: 4 } } },
    ],
    ['an outer size of 0', { madeFor: { ...GOOD.madeFor, outer: { L: 25, W: 0, H: 5 } } }],
    [
      'an outer size that is NaN',
      { madeFor: { ...GOOD.madeFor, outer: { L: 25, W: 17, H: NaN } } },
    ],
    ['a negative wall thickness', { madeFor: { ...GOOD.madeFor, wallThickness: -0.25 } }],
    ['an infinite leeway', { madeFor: { ...GOOD.madeFor, leeway: Infinity } }],
  ];

  it.each(bad)('rejects %s', (_, over) => {
    expect(manualLayoutSpecSchema.safeParse({ ...GOOD, ...over }).success).toBe(false);
  });

  it('agrees with the engine: what the schema passes builds, what the engine refuses fails it', () => {
    const engineChecks = bad.filter(
      ([what]) => !['no id', 'a name that is not text', 'too many cartons'].includes(what),
    );
    for (const [what, over] of engineChecks) {
      const spec = { ...GOOD, ...over } as typeof GOOD;
      expect(isValidSpec(spec), what).toBe(false);
      expect(canSave(buildManualLayout(spec, I).flags), what).toBe(false);
    }
    expect(isValidSpec(manualLayoutSpecSchema.parse(json(GOOD)))).toBe(true);
    const build = buildManualLayout(manualLayoutSpecSchema.parse(json(GOOD)), I);
    expect(canSave(build.flags)).toBe(true);
    expect(Number.isFinite(build.layout.totalProducts)).toBe(true);
  });
});

describe('manualLayoutListSchema', () => {
  it('drops each entry that cannot be read and keeps the others in order', () => {
    const other = manualSpec({ id: 'b', name: 'Manual 2', cartons: [] });
    const list = [{ ...GOOD, cartons: [{ x: null, y: 0, rotated: false }] }, GOOD, 4, null, other];
    expect(manualLayoutListSchema.parse(json(list))).toEqual([GOOD, other]);
    expect(manualLayoutListSchema.parse([])).toEqual([]);
    expect(manualLayoutListSchema.safeParse('x').success).toBe(false);
  });
});

describe('scenarios with manual layouts', () => {
  const layout = overhangingLayout();
  const old = {
    id: 's1',
    name: 'Saved before Round 5',
    savedAt: '2026-11-01T10:00:00.000Z',
    inputs: I,
    result: resultOf(layout),
    selectedIndex: 0,
    analytics: computeAnalytics(layout, I),
  };

  it('a scenario saved before manual layouts existed loads, with no such field', () => {
    const parsed = scenarioSchema.parse(json(old));
    expect(parsed).toEqual(old);
    expect('manualLayouts' in parsed).toBe(false);
  });

  it('keeps the manual layouts a scenario was saved with, and an empty list', () => {
    const other = manualSpec({ id: 'b', name: 'Manual 2', upperLayers: 'same' });
    const parsed = scenarioSchema.parse(json({ ...old, manualLayouts: [GOOD, other] }));
    expect(parsed.manualLayouts).toEqual([GOOD, other]);
    expect(scenarioSchema.parse(json({ ...old, manualLayouts: [] })).manualLayouts).toEqual([]);
  });

  it('one unreadable manual layout does not cost the scenario or the other layouts', () => {
    const broken = { ...GOOD, id: 'x', design: { ...GOOD.design, counts: { length: 0 } } };
    const parsed = scenarioSchema.parse(json({ ...old, manualLayouts: [broken, GOOD] }));
    expect(parsed.manualLayouts).toEqual([GOOD]);
    expect(parsed.result).toEqual(old.result);
  });

  it('a manualLayouts field that is not a list is refused', () => {
    expect(scenarioSchema.safeParse(json({ ...old, manualLayouts: 'none' })).success).toBe(false);
  });
});
