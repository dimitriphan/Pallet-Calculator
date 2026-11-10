# Pallet Calculator Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static web app that finds the carton and pallet arrangement putting the most product boxes on one pallet, shows the top 5 layouts with analytics, and renders the load in 3D.

**Architecture:** Pure TypeScript engines (units, packing, ranking, analytics) with no UI dependencies run inside a web worker. Zustand stores hold inputs, results, scene state, presets, and scenarios; React panels and a React Three Fiber scene all read the one selected layout. Persistence goes through a repository interface backed by Local Storage.

**Tech Stack:** React 18.3, TypeScript (strict), Vite 8, Tailwind CSS 3.4, Zustand 5, Zod 4, three ^0.170, @react-three/fiber 8.18, @react-three/drei 9.122, Vitest 5 + @testing-library/react + jsdom, Playwright (pre-installed; do not run `playwright install`), ESLint 10 (flat config, typescript-eslint), Prettier.

**Spec:** `docs/superpowers/specs/2026-11-10-pallet-calculator-design.md`. Read it before starting any task. Section numbers below ("spec 4.3") refer to it.

## Global Constraints

- React must stay on 18.x; `@react-three/fiber` on 8.x and `@react-three/drei` on 9.x (their 9.x/10.x lines need React 19).
- All dimensions are inches, full floating-point precision. Round only in `formatNumber`/`formatLength` for display. Never calculate with a rounded value.
- Every "does it fit" comparison uses `EPS = 1e-9` through `fitsCount` / `fitsWithin` (Task 2). No bare `<=` or `Math.floor(x / y)` on dimensions in engine code.
- `PALLET_HEIGHT = 5`, not configurable. Notice copy, verbatim: "A 5-inch pallet is automatically included. Available stacking height has been reduced by 5 inches."
- Defaults: pallet 50 x 42 x 72, product 12 x 8 x 4, max carton 24 x 18 x 16, target blank, leeway 0.5, wall thickness 0.25, overhang 0, rotation "Fully Rotatable", keep cartons upright off.
- Score weights: 0.60 quantity, 0.25 utilization, 0.15 space. Layouts are ordered by product count first, then score.
- Product visibility threshold: 5000 products.
- Files under `src/engine/` and `src/domain/` must not import React, three, Zustand, or any DOM/browser API.
- Engine coordinate frame: x along pallet length, y along pallet width, z up; origin at the minimum corner of the usable footprint, z = 0 at the pallet's top surface. Only `src/scene/transforms.ts` converts to the three.js frame (scene X = x - usableX/2, scene Z = y - usableY/2, scene Y = z + 5).
- The optimizer is deterministic: identical inputs give deeply equal results. No `Math.random`, no `Date.now` in results (the time budget may only truncate, and sets `truncated: true`).
- Advanced Optimization is rendered collapsed and disabled with the label "Coming in a later release". It must not affect any calculation.
- Do not open a pull request. Commit after every task on branch `claude/pallet-calculator-round-1` and push with `git push -u origin claude/pallet-calculator-round-1`.
- Every task ends with `npm run typecheck && npm run lint && npm test` all passing.

## Review Focus

Inputs the spec implies but does not spell out, most likely to bite first. Each has a test in the task named.

1. **Tiny product on a large pallet** (1 x 1 x 1 box, 48 x 40 x 72 pallet): thousands of cartons to evaluate. Expect an answer within 5 seconds, never a frozen tab. Test in Task 6.
2. **Nothing fits** (box larger than the maximum carton; carton taller than the usable height, such as pallet height 5.5): expect an empty result with a reason, not an exception or a layout of zero cartons. Tests in Task 6.
3. **Decimal dimensions that hit floating-point noise** (three 0.1-wide cartons across a 0.3 space): expect them to fit. Tests in Tasks 2 and 4.
4. **Messy typed input** (" 12 ", "12in", "1,5", "", "-3", "0", "1e2"): expect surrounding spaces accepted, everything non-numeric or non-positive rejected with a message, and no `NaN` reaching the engine. Test in Task 2.
5. **Local Storage missing, full, or corrupt** (private browsing, quota, hand-edited data, a preset file from elsewhere): expect the app to keep working and say what was skipped. Tests in Task 8.

## File Structure

```
index.html, package.json, vite.config.ts, tsconfig*.json, tailwind.config.js,
postcss.config.js, eslint.config.js, .prettierrc, vercel.json, playwright.config.ts
src/
  main.tsx, App.tsx, index.css
  domain/      constants.ts  types.ts  schemas.ts
  engine/
    units/     units.ts
    packing/   tolerance.ts  geometry.ts  rotation.ts  cartons.ts
               layerSearch.ts  stacking.ts  positions.ts  metrics.ts
    ranking/   score.ts  rank.ts  explain.ts
    analytics/ analytics.ts
    optimize.ts
  worker/      optimizer.worker.ts  optimizerClient.ts
  persistence/ repository.ts  localStorageRepository.ts  keys.ts
  store/       inputsStore.ts  resultsStore.ts  sceneStore.ts
               presetsStore.ts  scenariosStore.ts  noticesStore.ts
  data/        samplePresets.ts
  export/      exportData.ts  csv.ts  png.ts  download.ts
  scene/       transforms.ts  cameraFit.ts  colors.ts  PalletScene.tsx
               PalletMesh.tsx  Envelope.tsx  CartonInstances.tsx
               ProductInstances.tsx  Measurements.tsx  Labels.tsx
               CameraRig.tsx  CaptureBridge.tsx  SceneToolbar.tsx
  ui/          Header.tsx  ProductionSummary.tsx  InputsPanel.tsx
               NumberField.tsx  DimsFieldset.tsx  RotationControl.tsx
               AdvancedSection.tsx  LayoutComparisonTable.tsx
               DetailsPanel.tsx  AnalyticsTab.tsx  ExplanationTab.tsx
               SelectionTab.tsx  PresetMenu.tsx  PresetDialog.tsx
               ScenarioDrawer.tsx  ExportMenu.tsx  Notices.tsx
e2e/           workspace.spec.ts
docs/          architecture.md  build-and-deploy.md  assumptions-and-limitations.md
```

Tests sit beside their source as `*.test.ts(x)`.

---

### Task 1: Project scaffold and tooling

**Files:** Create every root config file listed above, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/App.test.tsx`. Replace `README.md`.

**Produces:** npm scripts `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck` (`tsc -b --noEmit`), `lint` (`eslint .`), `format` (`prettier --write .`), `test` (`vitest run`), `e2e` (`playwright test`).

- [ ] **Step 1:** Scaffold Vite React-TS in the repo root without overwriting `docs/`. Install the stack at the versions in the header. TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Vitest: `environment: 'jsdom'`, setup file importing `@testing-library/jest-dom/vitest`, `exclude: ['e2e/**']`. Tailwind 3 via PostCSS with `content: ['./index.html', './src/**/*.{ts,tsx}']`.
- [ ] **Step 2:** `vercel.json`: `{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist" }`. `.gitignore`: `node_modules`, `dist`, `test-results`, `playwright-report`.
- [ ] **Step 3:** Write `src/App.test.tsx`: renders `<App />` and expects `screen.getByRole('heading', { name: 'Pallet Calculator' })`. Run `npm test`; expect FAIL. Implement the heading in `App.tsx`; expect PASS.
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm test && npm run build`. Expect all to exit 0 and `dist/index.html` to exist.
- [ ] **Step 5:** Commit: `chore: scaffold Vite React TypeScript project with tooling`.

---

### Task 2: Domain types, validation, units, tolerance

**Files:** Create `src/domain/constants.ts`, `types.ts`, `schemas.ts`, `src/engine/units/units.ts`, `src/engine/packing/tolerance.ts`, with tests `schemas.test.ts`, `units.test.ts`, `tolerance.test.ts`.

**Produces:**

```ts
// constants.ts
export const PALLET_HEIGHT = 5;
export const EPS = 1e-9;
export const PRODUCT_RENDER_THRESHOLD = 5000;
export const SCORE_WEIGHTS = { quantity: 0.6, utilization: 0.25, space: 0.15 } as const;
export const DEFAULT_INPUTS: Inputs; // values from Global Constraints

// types.ts
export interface Dims { length: number; width: number; height: number }
export type ProductAxis = 'L' | 'W' | 'H';
export type OrientationCode = 'LWH' | 'LHW' | 'WLH' | 'WHL' | 'HLW' | 'HWL';
export type RotationMode = 'full' | 'upright' | 'noSide' | 'custom';
export interface Inputs {
  pallet: Dims; product: Dims; maxCarton: Dims;
  targetQuantity: number | null;
  leeway: number; wallThickness: number; overhang: number;
  rotationMode: RotationMode;
  customOrientations: OrientationCode[]; // used only when rotationMode === 'custom'
  keepCartonsUpright: boolean;
}
/** Same shape as Inputs but every numeric field is the raw text the user typed. */
export interface InputsDraft { /* pallet/product/maxCarton: Record<keyof Dims, string>; targetQuantity, leeway, wallThickness, overhang: string; rotation fields as in Inputs */ }
export interface CartonCandidate {
  counts: Record<ProductAxis, number>;  // boxes along each product dimension
  inner: Record<ProductAxis, number>;   // inches, along each product dimension
  outer: Record<ProductAxis, number>;
  boxesPerCarton: number;
  utilization: number;                  // product volume / outer volume, 0..1
  emptyVolume: number;                  // outer volume - product volume
}
export interface Block { x: number; y: number; cols: number; rows: number; rotated: boolean }
export interface LayerPattern {
  vertical: ProductAxis; height: number; cartonCount: number;
  blocks: Block[]; extent: { x: number; y: number };
}
export interface Layer extends LayerPattern { z: number }
export interface Layout { id: string; carton: CartonCandidate; layers: Layer[]; totalCartons: number; totalProducts: number }
export interface ScoreBreakdown {
  quantity: number; utilization: number; space: number;           // each 0..100
  quantityContribution: number; utilizationContribution: number; spaceContribution: number;
  total: number;
}
export interface RankedLayout { rank: number; layout: Layout; score: ScoreBreakdown; explanation: string }
export type EmptyReason = 'NO_CARTON_FITS' | 'CARTON_EXCEEDS_PALLET';
export interface OptimizeResult { layouts: RankedLayout[]; candidatesEvaluated: number; emptyReason: EmptyReason | null; truncated: boolean }

// schemas.ts
export const inputsSchema: z.ZodType<Inputs>;
export function draftFromInputs(inputs: Inputs): InputsDraft;
export type ParseResult = { ok: true; inputs: Inputs } | { ok: false; errors: Record<string, string> };
export function parseDraft(draft: InputsDraft): ParseResult; // error keys are dotted paths, e.g. 'pallet.height'

// units.ts
export type Unit = 'in' | 'cm' | 'mm';
export function toInches(value: number, unit: Unit): number;   // cm: /2.54, mm: /25.4
export function fromInches(inches: number, unit: Unit): number;
export function formatNumber(value: number, decimals?: number): string; // default 2, toFixed
export function formatLength(inches: number, unit?: Unit): string;      // '12.50'
export function formatDims(d: Dims): string;                            // '12.00 × 8.00 × 4.00'

// tolerance.ts
export function fitsCount(space: number, size: number): number; // Math.floor((space + EPS) / size); 0 when size <= 0
export function fitsWithin(size: number, space: number): boolean; // size <= space + EPS
```

A block's `x`/`y` are relative to its layer's own minimum corner; `cols` runs along x, `rows` along y. `rotated: false` means the footprint's first axis lies along x (see Task 4).

Validation messages (exact): empty field "Required"; not a plain decimal number "Enter a number"; `<= 0` on a dimension "Must be greater than 0"; negative leeway/wall/overhang "Cannot be negative"; pallet height `<= 5` "Pallet height must be greater than 5 inches"; target not a whole number `>= 1` "Enter a whole number of 1 or more"; custom mode with nothing ticked (key `customOrientations`) "Select at least one orientation". A numeric string is accepted only if, after trimming, it matches `/^\d+(\.\d+)?$|^\.\d+$/`. A blank target parses to `null`.

- [ ] **Step 1: Write failing tests.**

```ts
// tolerance.test.ts
expect(fitsCount(0.3, 0.1)).toBe(3);          // 0.1 * 3 = 0.30000000000000004
expect(fitsCount(0.1 + 0.2, 0.3)).toBe(1);
expect(fitsCount(10, 3)).toBe(3);
expect(fitsWithin(0.1 + 0.2, 0.3)).toBe(true);
expect(fitsWithin(0.31, 0.3)).toBe(false);
// units.test.ts
expect(toInches(2.54, 'cm')).toBeCloseTo(1, 12);
expect(fromInches(1, 'mm')).toBeCloseTo(25.4, 12);
expect(formatLength(12.345)).toBe('12.35'); expect(formatLength(12)).toBe('12.00');
// schemas.test.ts
const d = draftFromInputs(DEFAULT_INPUTS);
expect(parseDraft(d)).toEqual({ ok: true, inputs: DEFAULT_INPUTS });
expect(parseDraft({ ...d, leeway: ' 0.5 ' }).ok).toBe(true);
for (const bad of ['12in', '1,5', '1e2', 'abc', '-3'])
  expect(err({ ...d, product: { ...d.product, length: bad } })['product.length']).toBe('Enter a number');
expect(err({ ...d, product: { ...d.product, length: '' } })['product.length']).toBe('Required');
expect(err({ ...d, product: { ...d.product, length: '0' } })['product.length']).toBe('Must be greater than 0');
expect(err({ ...d, pallet: { ...d.pallet, height: '5' } })['pallet.height']).toBe('Pallet height must be greater than 5 inches');
expect(err({ ...d, overhang: '-1' }).overhang).toBe('Enter a number'); // '-' fails the pattern
expect(err({ ...d, targetQuantity: '2.5' }).targetQuantity).toBe('Enter a whole number of 1 or more');
expect(parseDraft({ ...d, targetQuantity: '' })).toMatchObject({ ok: true, inputs: { targetQuantity: null } });
expect(err({ ...d, rotationMode: 'custom', customOrientations: [] }).customOrientations).toBe('Select at least one orientation');
```

(`err(draft)` is a test helper returning `errors` and asserting `ok === false`.) "Cannot be negative" is produced by `inputsSchema` for callers that pass numbers directly; add one test: `inputsSchema.safeParse({ ...DEFAULT_INPUTS, leeway: -1 }).success === false`.

- [ ] **Step 2:** Run `npx vitest run src/domain src/engine/units src/engine/packing/tolerance.test.ts`; expect FAIL (modules missing).
- [ ] **Step 3:** Implement the five files to the signatures above.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add domain types, input validation, units, and tolerance helpers`.

---

### Task 3: Geometry, rotation rules, carton candidates

**Files:** Create `src/engine/packing/geometry.ts`, `rotation.ts`, `cartons.ts` and their tests.

**Consumes:** Task 2 types, `fitsWithin`, `fitsCount`, `PALLET_HEIGHT`.

**Produces:**

```ts
// geometry.ts
export function usableFootprint(i: Inputs): { x: number; y: number }; // length + overhang, width + overhang
export function usableHeight(i: Inputs): number;                      // pallet.height - PALLET_HEIGHT
export function availableVolume(i: Inputs): number;
export function productSize(i: Inputs): Record<ProductAxis, number>;  // { L: length, W: width, H: height }
export function volumeOf(size: Record<ProductAxis, number>): number;
// rotation.ts
export function allowedVerticalAxes(i: Inputs): ProductAxis[]; // in order L, W, H
// cartons.ts
export function cartonKey(c: CartonCandidate): string;         // `${counts.L}x${counts.W}x${counts.H}`
export function generateCartonCandidates(i: Inputs): CartonCandidate[];
```

Rules: `allowedVerticalAxes` returns `full` -> L, W, H; `upright` -> H; `noSide` -> L, H; `custom` -> the distinct third letters of `customOrientations`. For each product axis, `inner = count * size + leeway`, `outer = inner + 2 * wallThickness`. A candidate is valid when its three outer values sorted descending are each `fitsWithin` the maximum carton dimensions sorted descending. Enumerate every count triple `>= 1` that is valid (bound each loop by the largest maximum carton dimension). When `rotationMode === 'full'`, drop candidates that are the same physical carton (equal multiset of `(product size, count)` pairs), keeping the first in L, W, H loop order. Return sorted by `boxesPerCarton` descending, then `cartonKey` ascending.

- [ ] **Step 1: Write failing tests.**

```ts
// geometry
expect(usableFootprint({ ...DEFAULT_INPUTS, overhang: 2 })).toEqual({ x: 52, y: 44 });
expect(usableHeight(DEFAULT_INPUTS)).toBe(67);
// rotation
expect(allowedVerticalAxes(DEFAULT_INPUTS)).toEqual(['L', 'W', 'H']);
expect(allowedVerticalAxes({ ...DEFAULT_INPUTS, rotationMode: 'upright' })).toEqual(['H']);
expect(allowedVerticalAxes({ ...DEFAULT_INPUTS, rotationMode: 'noSide' })).toEqual(['L', 'H']);
expect(allowedVerticalAxes({ ...DEFAULT_INPUTS, rotationMode: 'custom', customOrientations: ['LWH', 'WLH', 'HWL'] })).toEqual(['L', 'H']);
// cartons, default inputs: outer = 12n+1, 8n+1, 4n+1 against max 24, 18, 16
const cs = generateCartonCandidates(DEFAULT_INPUTS);
expect(cs).toHaveLength(10);                       // L:1 x W:1..2 x H:1..5
expect(cs[0]).toMatchObject({ counts: { L: 1, W: 2, H: 5 }, boxesPerCarton: 10,
  inner: { L: 12.5, W: 16.5, H: 20.5 }, outer: { L: 13, W: 17, H: 21 } });
expect(cs[0].utilization).toBeCloseTo(3840 / 4641, 12);
expect(cs[0].emptyVolume).toBeCloseTo(4641 - 3840, 9);
expect(cs.some(c => c.counts.L === 2)).toBe(false); // 25 > 24
// every candidate's sorted outer dims fit the sorted maximum
// product larger than max carton -> []
expect(generateCartonCandidates({ ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 } })).toEqual([]);
// cube product, full rotation: (1,1,2), (1,2,1), (2,1,1) collapse to one
const cube = generateCartonCandidates({ ...DEFAULT_INPUTS, product: { length: 5, width: 5, height: 5 },
  leeway: 0, wallThickness: 0, maxCarton: { length: 10, width: 5, height: 5 } });
expect(cube.map(c => c.boxesPerCarton)).toEqual([2, 1]);
```

- [ ] **Step 2:** Run `npx vitest run src/engine/packing`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: generate carton candidates with leeway, walls, and rotation rules`.

---

### Task 4: Guillotine layer search

**Files:** Create `src/engine/packing/layerSearch.ts`, `layerSearch.test.ts`.

**Consumes:** `fitsCount`, `EPS`, `Block`.

**Produces:**

```ts
export const MAX_LAYER_STATES = 40000;
export interface LayerSearchResult { count: number; blocks: Block[] }
/** Best guillotine arrangement of a x b rectangles (either flat rotation) in a rectX x rectY rectangle. */
export function searchLayer(rectX: number, rectY: number, a: number, b: number): LayerSearchResult;
/** Plain single-grid fill. rotated=false puts `a` along x. Returns count 0 and no blocks if nothing fits. */
export function gridLayer(rectX: number, rectY: number, a: number, b: number, rotated: boolean): LayerSearchResult;
```

Algorithm (the tests do not determine it):

```
normalX = sorted distinct values i*a + j*b (i, j >= 0, not both 0) that fit within rectX; same for normalY.
snap(v, normals) = largest normal value <= v + EPS, or 0.
best(w, h), memoized on (snap(w), snap(h)) using the snapped values as w, h:
  if w or h is 0 -> 0
  result = better of gridLayer(w, h, unrotated) and gridLayer(w, h, rotated)
  for each normalX value p with p <= w/2 + EPS and p < w:   result = max(result, best(p, h) + best(w - p, h))
  for each normalY value q with q <= h/2 + EPS and q < h:   result = max(result, best(w, q) + best(w, h - q))
If normalX.length * normalY.length > MAX_LAYER_STATES, skip the recursion and return the best of:
  both plain grids, and every single cut (x or y, at any normal value) with each side filled by its better plain grid.
```

Reconstruct blocks with absolute origins by carrying an offset down the chosen cuts. Ties keep the earlier option (grid before cuts, unrotated before rotated, x cuts before y cuts, smaller cut first) so results are deterministic. Omit blocks with zero cartons.

- [ ] **Step 1: Write failing tests.**

```ts
expect(searchLayer(10, 10, 5, 5).count).toBe(4);
expect(searchLayer(10, 7, 5, 2).count).toBe(7);   // area bound 70/10; best plain grid is 6
expect(gridLayer(10, 7, 5, 2, false).count).toBe(6);
expect(gridLayer(10, 7, 5, 2, true).count).toBe(5);
expect(searchLayer(4, 4, 5, 5)).toEqual({ count: 0, blocks: [] });
expect(searchLayer(0.3, 0.1, 0.1, 0.1).count).toBe(3);            // floating-point noise
expect(searchLayer(52, 44, 13, 17)).toEqual(searchLayer(52, 44, 13, 17)); // deterministic
// invariants, checked by a helper `expandBlocks(result, a, b)` over a table of
// cases incl. (52,44,13,17), (52,44,21,13), (48,40,9,5), (50,42,7.5,5.25):
//   - sum of cols*rows over blocks === count
//   - every carton rectangle lies inside [0,rectX] x [0,rectY] within EPS
//   - no two carton rectangles overlap by more than EPS
//   - count >= both plain grid counts
// brute force: for integer cases with rectX, rectY <= 12 and a, b in 1..5, compare count with a
// test-local reference that tries every integer cut position without snapping or memo keys.
// large-state fallback returns quickly and validly:
const t = performance.now(); const r = searchLayer(480, 400, 1.1, 0.7);
expect(performance.now() - t).toBeLessThan(1500); expect(r.count).toBeGreaterThan(0);
```

- [ ] **Step 2:** Run `npx vitest run src/engine/packing/layerSearch.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement `layerSearch.ts`.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add guillotine layer search`.

---

### Task 5: Stacking, layouts, positions, metrics

**Files:** Create `src/engine/packing/stacking.ts`, `positions.ts`, `metrics.ts` and tests.

**Consumes:** Tasks 2-4.

**Produces:**

```ts
// stacking.ts
export type LayerCache = Map<string, LayerPattern | null>;
/** Footprint axes for a vertical axis: the other two product axes in L, W, H order. */
export function footprintAxes(vertical: ProductAxis): [ProductAxis, ProductAxis];
export function bestLayer(c: CartonCandidate, vertical: ProductAxis, i: Inputs, cache: LayerCache): LayerPattern | null;
export function plainLayers(c: CartonCandidate, vertical: ProductAxis, i: Inputs): LayerPattern[];
/** All distinct layouts for one carton; [] if it cannot be placed. */
export function buildLayouts(c: CartonCandidate, i: Inputs, cache: LayerCache): Layout[];
export function layoutSignature(l: Layout): string;
// positions.ts
export interface PlacedBox { x: number; y: number; z: number; dx: number; dy: number; dz: number }
export interface PlacedCarton extends PlacedBox { index: number; layerIndex: number;
  axes: { x: ProductAxis; y: ProductAxis; z: ProductAxis } }
export function cartonPlacements(l: Layout, i: Inputs): PlacedCarton[];
export function productsInCarton(l: Layout, i: Inputs, carton: PlacedCarton): PlacedBox[];
export function allProductPlacements(l: Layout, i: Inputs): PlacedBox[];
// metrics.ts
export interface LayoutMetrics { cartonVolume: number; productVolume: number;
  loadExtent: { x: number; y: number; z: number }; loadBoundingVolume: number;
  availableVolume: number; fullestLayerCartons: number; fullestLayerUsedArea: number }
export function layoutMetrics(l: Layout, i: Inputs): LayoutMetrics;
```

Rules:

- A vertical axis is usable only if it is in `allowedVerticalAxes(i)` and `outer[vertical]` fits within `usableHeight(i)`. `bestLayer` runs `searchLayer` on the usable footprint with `a = outer[footprintAxes[0]]`, `b = outer[footprintAxes[1]]`, caches the search result on the key `${a}|${b}` (the footprint and usable area are all it depends on), and returns `null` when the count is 0. `extent` is the bounding size of the blocks.
- `buildLayouts` returns, de-duplicated by `layoutSignature`:
  1. for each usable vertical axis, a single-type stack of `fitsCount(usableHeight, height)` best layers;
  2. for each usable vertical axis, the same using each plain grid from `plainLayers` whose count is below the best layer's count or whose blocks differ;
  3. unless `i.keepCartonsUpright`, the mixed stack: non-negative layer counts per usable vertical axis maximizing total cartons with total height fitting `usableHeight`, found by exhaustive loops (at most three axes); ties prefer fewer distinct axes, then lower total height, then L-before-W-before-H counts.
- Layers are ordered by `cartonCount` descending, then `height` descending; `z` is the running sum of heights.
- `Layout.id` equals `layoutSignature`: `cartonKey` + `|` + per layer `vertical:cartonCount:` + its blocks as `cols x rows r|u` sorted, layers joined by `/`. Mirrored or re-ordered block lists therefore give the same signature.
- Positions: each layer is centred, offset `(usable - extent) / 2` on x and y. Cartons are emitted layer by layer, block by block, row by row; `index` is the running count. In an unrotated block, `axes.x = footprintAxes[0]`; rotated swaps x and y; `axes.z = vertical`.
- Products inside a carton pack tight in a group centred in the carton: the group starts at `wallThickness + leeway / 2` from the carton's minimum corner on each axis, with `counts[axis]` boxes of the product's size along that axis.
- `loadExtent`: maximum layer extent on x and y; z is the sum of layer heights. `fullestLayerUsedArea` = cartons x footprint area of the layer with the most cartons.

- [ ] **Step 1: Write failing tests.**

```ts
// Simple exact case: 10-inch cube product, no leeway or walls, max carton 20 x 20 x 10,
// pallet 40 x 40 x 25 (usable height 20).
const I = { ...DEFAULT_INPUTS, product: { length: 10, width: 10, height: 10 }, leeway: 0, wallThickness: 0,
  maxCarton: { length: 20, width: 20, height: 10 }, pallet: { length: 40, width: 40, height: 25 } };
// every candidate's every layout holds exactly 32 products
for (const c of generateCartonCandidates(I)) for (const l of buildLayouts(c, I, new Map()))
  expect(l.totalProducts).toBe(32);
// default inputs, carton (1,2,5): usable axes exclude any whose outer size exceeds 67 (none here);
// with keepCartonsUpright every layout has a single vertical axis
// rotationMode 'upright' -> every layer.vertical === 'H'
// invariants over all layouts of all default candidates:
//   totalCartons === sum(layer.cartonCount); totalProducts === totalCartons * boxesPerCarton
//   sum of layer heights fitsWithin usableHeight; layer z values are cumulative
//   cartonPlacements: length === totalCartons; all inside [0,usable] in x, y and [0,usableHeight] in z;
//     no pairwise overlap beyond EPS (sort by z, then sweep)
//   allProductPlacements: length === totalProducts; each product lies inside its carton
//     with at least wallThickness clearance on every side; product dz equals the product size on carton.axes.z
// centring: for a layout whose layer extent is smaller than the footprint, min x of the cartons === (usable.x - extent.x) / 2
// metrics: for case I any layout -> cartonVolume 32000, loadBoundingVolume 32000, availableVolume 32000
// buildLayouts returns [] when outer height exceeds usable height on every allowed axis
expect(buildLayouts(generateCartonCandidates(DEFAULT_INPUTS)[0]!, { ...DEFAULT_INPUTS, pallet: { length: 50, width: 42, height: 5.5 } }, new Map())).toEqual([]);
```

- [ ] **Step 2:** Run `npx vitest run src/engine/packing`; expect new tests to FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: stack layers into layouts and derive carton and product positions`.

---

### Task 6: Ranking and the optimize entry point

**Files:** Create `src/engine/ranking/score.ts`, `rank.ts`, `explain.ts`, `src/engine/optimize.ts` and tests.

**Consumes:** Tasks 2-5.

**Produces:**

```ts
export function scoreLayout(l: Layout, i: Inputs, maxProducts: number): ScoreBreakdown;
export function compareRanked(a: { layout: Layout; score: ScoreBreakdown }, b: same): number;
export function rankLayouts(layouts: Layout[], i: Inputs, limit?: number): RankedLayout[]; // limit default 5
export function explainRanking(current: RankedLayout, next: RankedLayout | null, total: number): string;
export const TIME_BUDGET_MS = 4000;
export function optimize(i: Inputs, opts?: { now?: () => number; budgetMs?: number }): OptimizeResult;
```

Rules:

- Score per spec 6.1 using `layoutMetrics`; contributions are component x weight; `total` is their sum.
- Order: `totalProducts` desc, `score.total` desc (difference above 1e-9), `totalCartons` asc, `layout.id` asc.
- Selection: walk the ordered list, skip a layout whose `id` was already taken, and take at most 2 layouts per `cartonKey`; if fewer than `limit` result, fill from the skipped per-carton overflow in order. Assign `rank` 1..n.
- Explanation, exact templates (U = utilization difference in points, current minus next):
  - more products: `Layout #A ranked above Layout #B because it fits N additional unit(s) ` + `while maintaining similar utilization.` if |U| < 1, `with higher utilization.` if U >= 1, `despite lower utilization.` if U <= -1. Use "unit" when N is 1, otherwise "units".
  - same products, higher score: `Layout #A ranked above Layout #B because it has a higher overall score (X vs Y) at the same quantity.` with scores to 2 decimals.
  - same products and score: `Layout #A ranked above Layout #B because it uses fewer cartons for the same result.`
  - last of several: `Layout #A is the lowest-ranked of the N layouts shown.`
  - only one: `Layout #1 is the only distinct layout found.`
- `optimize`: generate candidates; if none, `emptyReason: 'NO_CARTON_FITS'`. Sort candidates by upper bound `boxesPerCarton * floor(availableVolume / outerVolume)` descending (stable). Build layouts for each with one shared `LayerCache`. Keep the best product count found so far among the top 30 layouts; skip a candidate whose upper bound is below the 30th best. Check `now()` before each candidate; once `budgetMs` has elapsed stop and set `truncated: true`. If candidates exist but no layout, `emptyReason: 'CARTON_EXCEEDS_PALLET'`. `candidatesEvaluated` counts candidates passed to `buildLayouts`. `now` defaults to `performance.now`.

- [ ] **Step 1: Write failing tests.**

```ts
// score: case I from Task 5 -> quantity 100, utilization 100, space 100, total 100, contributions 60/25/15
// order: a layout with more products ranks first even when a fabricated rival has higher utilization and space
// contributions sum to total (toBeCloseTo, 9)
// case I: optimize(I).layouts[0] -> totalProducts 32, totalCartons 8, carton.boxesPerCarton 4 (fewest cartons wins the tie)
// defaults: const r = optimize(DEFAULT_INPUTS);
expect(r.emptyReason).toBeNull(); expect(r.truncated).toBe(false);
expect(r.layouts.length).toBeGreaterThanOrEqual(1); expect(r.layouts.length).toBeLessThanOrEqual(5);
expect(r.layouts.map(x => x.rank)).toEqual(r.layouts.map((_, k) => k + 1));
expect(new Set(r.layouts.map(x => x.layout.id)).size).toBe(r.layouts.length);
// products non-increasing down the list; no cartonKey appears more than twice unless fewer than 5 keys exist
expect(optimize(DEFAULT_INPUTS)).toEqual(r);                           // deterministic
expect(r.layouts[0].layout.totalProducts * 384).toBeLessThanOrEqual(50 * 42 * 67);
// the winner is at least as good as the biggest carton on a plain grid:
// compute that baseline in the test from generateCartonCandidates + gridLayer and assert >=
// explanations: exact strings for each template using hand-built RankedLayout fixtures
// empty results
expect(optimize({ ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 } }))
  .toMatchObject({ layouts: [], emptyReason: 'NO_CARTON_FITS' });
expect(optimize({ ...DEFAULT_INPUTS, pallet: { length: 50, width: 42, height: 5.5 } }))
  .toMatchObject({ layouts: [], emptyReason: 'CARTON_EXCEEDS_PALLET' });
// tiny product finishes in time and stays valid
const t0 = performance.now();
const tiny = optimize({ ...DEFAULT_INPUTS, product: { length: 1, width: 1, height: 1 }, pallet: { length: 48, width: 40, height: 72 } });
expect(performance.now() - t0).toBeLessThan(5000); expect(tiny.layouts.length).toBeGreaterThan(0);
// budget: optimize(DEFAULT_INPUTS, { now: fakeClockAdvancing5000PerCall, budgetMs: 4000 }).truncated === true
```

After the tests pass, add a regression test pinning the default-input winner's `totalProducts`, `totalCartons`, and `cartonKey` to the values the engine produces, with a comment that the numbers were recorded from a run that satisfied every invariant above.

- [ ] **Step 2:** Run `npx vitest run src/engine`; expect new tests to FAIL.
- [ ] **Step 3:** Implement the four files.
- [ ] **Step 4:** Re-run; expect PASS. Then add the regression test and run again.
- [ ] **Step 5:** Commit: `feat: rank layouts and add the optimize entry point`.

---

### Task 7: Analytics

**Files:** Create `src/engine/analytics/analytics.ts`, `analytics.test.ts`.

**Produces:**

```ts
export type TargetStatus = 'none' | 'met' | 'exceeded' | 'notAchievable';
export interface Analytics {
  product: { dims: Dims; volume: number; perCarton: number };
  carton: { inner: Dims; outer: Dims; utilizationPct: number; emptyVolume: number; perPallet: number };
  pallet: { dims: Dims; usableHeight: number; usableFootprint: { x: number; y: number }; layers: number;
    cartonsPerLayerMin: number; cartonsPerLayerMax: number; totalLoadHeight: number;
    volumeUtilizationPct: number; remainingHeight: number; remainingFootprintArea: number;
    loadLength: number; loadWidth: number };
  totals: { products: number; cartons: number; volumeUsed: number; volumeAvailable: number;
    utilizationPct: number; remainingVolume: number };
  target: { status: TargetStatus; requested: number | null; maxPossible: number;
    cartonsNeeded: number | null; layersNeeded: number | null };
  summary: { boxesPerCarton: number; cartonsPerLayer: string; layers: number; cartonsPerPallet: number; totalBoxes: number };
}
export function computeAnalytics(l: Layout, i: Inputs): Analytics;
export function cartonDisplayDims(l: Layout, which: 'inner' | 'outer'): Dims;
```

Rules: `cartonDisplayDims`: if every layer shares one vertical axis, `height` is that axis's size and `length >= width` are the other two; otherwise the three values sorted descending. `volumeUsed` is carton outer volume; `utilizationPct` and `volumeUtilizationPct` are both `volumeUsed / volumeAvailable * 100`. `totalLoadHeight` = load z extent + 5. `remainingHeight` = usable height - load z extent. `remainingFootprintArea` = usable area - `fullestLayerUsedArea`. `summary.cartonsPerLayer` is `"8"` when all layers match, else `"6–8"` (min, en dash, max). Target: `cartonsNeeded = ceil(target / boxesPerCarton)`; `layersNeeded` = number of layers from the bottom whose cumulative cartons reach `cartonsNeeded`; both `null` when not achievable or no target.

- [ ] **Step 1: Write failing tests** for case I's winning layout (products 32, cartons 8, volumeUsed 32000, utilizationPct 100, remainingVolume 0, remainingHeight 0, totalLoadHeight 25, summary cartonsPerLayer "4" or "8" matching its layer count) and for target statuses with target 32 (`met`), 20 (`exceeded`, cartonsNeeded 5), 40 (`notAchievable`, maxPossible 32, cartonsNeeded null), null (`none`). Add one default-input test asserting `pallet.usableHeight === 67` and `carton.outer` equals the sorted or vertical-aware dims of the winner.
- [ ] **Step 2:** Run `npx vitest run src/engine/analytics`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add analytics engine`.

---

### Task 8: Persistence, presets, scenarios, notices

**Files:** Create `src/persistence/repository.ts`, `localStorageRepository.ts`, `keys.ts`, `src/store/noticesStore.ts`, `presetsStore.ts`, `scenariosStore.ts`, `src/data/samplePresets.ts` and tests.

**Produces:**

```ts
// repository.ts
export interface Repository<T extends { id: string }> { list(): T[]; save(item: T): void; remove(id: string): void }
// localStorageRepository.ts
export function createLocalStorageRepository<T extends { id: string }>(opts: {
  key: string; schema: z.ZodType<T>; storage?: Storage; onNotice?: (message: string) => void }): Repository<T>;
// keys.ts
export const STORAGE_KEYS = { presets: 'pc.presets.v1', scenarios: 'pc.scenarios.v1', inputs: 'pc.inputs.v1' } as const;
// types added to domain/types.ts and schemas.ts
export interface Preset { id: string; name: string; pallet: Dims; maxCarton: Dims; leeway: number;
  wallThickness: number; overhang: number; targetQuantity: number | null; rotationMode: RotationMode;
  customOrientations: OrientationCode[]; keepCartonsUpright: boolean; advanced: Record<string, unknown> }
export interface Scenario { id: string; name: string; savedAt: string /* ISO */; inputs: Inputs;
  result: OptimizeResult; selectedIndex: number; analytics: Analytics | null }
export const presetSchema: z.ZodType<Preset>; export const scenarioSchema: z.ZodType<Scenario>;
// stores (each created by a factory taking a Repository, plus a default instance)
usePresetsStore: { presets: Preset[]; activePresetId: string | null;
  create(name: string, from: Inputs): Preset; update(id: string, patch: Partial<Omit<Preset,'id'>>): void;
  clone(id: string): Preset; remove(id: string): void; setActive(id: string | null): void;
  exportJson(ids?: string[]): string; importJson(text: string): { imported: number; skipped: number } }
useScenariosStore: { scenarios: Scenario[];
  save(name: string, inputs: Inputs, result: OptimizeResult, selectedIndex: number): Scenario;
  rename(id: string, name: string): void; duplicate(id: string): Scenario; remove(id: string): void }
useNoticesStore: { notices: { id: string; message: string }[]; push(message: string): void; dismiss(id: string): void }
export function presetToInputs(p: Preset, current: Inputs): Inputs;   // keeps current.product
export function inputsMatchPreset(i: Inputs, p: Preset): boolean;
```

Rules: stored value is `{ version: 1, items: T[] }`. `list()` validates each item separately; invalid items are dropped and reported once as `"N saved item(s) could not be read and were skipped."`. Unparseable JSON, a wrong `version`, or a throwing `getItem` yields `[]` plus the notice `"Saved data could not be read."`. A throwing `setItem` reports `"Could not save: browser storage is full or unavailable."` and leaves in-memory state updated. Ids come from `crypto.randomUUID()`. Clone and duplicate append `" (copy)"` to the name. Imported presets always receive new ids; the export format is `{ version: 1, presets: Preset[] }`. If the presets key has never been written, the store seeds `samplePresets`: "Spec example 50 × 42 × 72" (the default inputs) and "Standard GMA 48 × 40 × 72" (pallet 48 x 40 x 72, same other values). Scenario `analytics` is computed with `computeAnalytics` at save time for the selected layout, or `null` if there are no layouts.

- [ ] **Step 1: Write failing tests** using an in-memory `Storage` fake:
  - round-trip save/list/remove;
  - one corrupt item among three -> two returned, notice `"1 saved item(s) could not be read and were skipped."`;
  - `"{not json"` -> `[]` with `"Saved data could not be read."`;
  - `getItem` throwing -> `[]`, no exception;
  - `setItem` throwing -> notice `"Could not save: browser storage is full or unavailable."`, store state still updated;
  - `presetToInputs` leaves `product` untouched and copies every other field;
  - loading a preset then changing inputs does not change `usePresetsStore.getState().presets`; `inputsMatchPreset` flips to false;
  - clone naming; `importJson` of exported text imports all with new ids; `importJson('[]')` and `importJson('nonsense')` return `{ imported: 0, skipped: 0 }` with a notice `"That file is not a valid preset export."`; a file with one valid and one invalid preset returns `{ imported: 1, skipped: 1 }`;
  - first run seeds the two sample presets; a store whose key holds `{version:1,items:[]}` stays empty;
  - scenario save/rename/duplicate/remove and reload from a fresh store instance over the same storage returns deeply equal `result` and `selectedIndex`.
- [ ] **Step 2:** Run `npx vitest run src/persistence src/store`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add local storage repositories, presets, and scenarios`.

---

### Task 9: Worker, inputs store, results store, scene store

**Files:** Create `src/worker/optimizer.worker.ts`, `optimizerClient.ts`, `src/store/inputsStore.ts`, `resultsStore.ts`, `sceneStore.ts` and store tests.

**Produces:**

```ts
// optimizerClient.ts
export type RunOptimizer = (inputs: Inputs) => Promise<OptimizeResult>;
export function createWorkerRunner(): RunOptimizer; // one module Worker; tags each request with an id;
                                                    // falls back to calling optimize() directly if Worker is undefined
// inputsStore.ts
useInputsStore: { draft: InputsDraft; parsed: ParseResult;
  setField(path: string, value: string): void;        // dotted path, e.g. 'pallet.length'
  setRotationMode(m: RotationMode): void; toggleOrientation(c: OrientationCode): void;
  setKeepCartonsUpright(v: boolean): void; replaceInputs(i: Inputs): void; reset(): void }
// resultsStore.ts
export function createResultsStore(run: RunOptimizer): StoreApi<ResultsState>;
interface ResultsState { status: 'idle' | 'running' | 'ready' | 'error'; inputs: Inputs | null;
  result: OptimizeResult | null; stale: boolean; selectedIndex: number; error: string | null;
  request(inputs: Inputs): Promise<void>; markStale(): void; select(index: number): void;
  restore(inputs: Inputs, result: OptimizeResult, selectedIndex: number): void; retry(): void }
export function selectSelected(s: ResultsState): RankedLayout | null;
// sceneStore.ts
export type Selection = { kind: 'product'; cartonIndex: number; productIndex: number }
  | { kind: 'carton'; cartonIndex: number } | { kind: 'pallet' } | null;
useSceneStore: { showProducts: boolean; showCartons: boolean; showLabels: boolean; showEnvelope: boolean;
  showGrid: boolean; showWireframe: boolean; showMeasurements: boolean; forceProducts: boolean;
  selection: Selection; cameraCommand: { type: 'reset' | 'focus'; nonce: number } | null;
  captureViews: null | (() => { current: string; top: string; side: string }); // set by Task 12's CaptureBridge
  setCaptureViews(fn: SceneState['captureViews']): void;
  toggle(key: ToggleKey): void; setSelection(s: Selection): void; resetView(): void; focusSelection(): void }
```

Rules: scene defaults are products off, labels off, wireframe off, measurements off; cartons, envelope, and grid on. `request` sets `running`, awaits the runner, and applies the result only if it is still the latest request; it then sets `ready`, `stale: false`, `selectedIndex: 0`, and clears scene selection. A rejected run sets `error` and keeps the previous `result`. `select` ignores out-of-range indexes and clears scene selection. `inputsStore` persists `draft` to `STORAGE_KEYS.inputs` on change and restores it on creation (falling back to defaults if it fails `parseDraft` structurally). Wiring (in `App.tsx`, Task 10): whenever `parsed.ok` becomes true with changed inputs, call `request` after a 300 ms debounce; when `parsed.ok` is false, call `markStale`.

- [ ] **Step 1: Write failing tests:** `setField('pallet.height', '4')` yields the pallet-height error and keeps the draft text; `replaceInputs` round-trips through `draftFromInputs`; draft persists and restores across store instances; with a controllable fake runner, two overlapping `request` calls resolve out of order and only the later result is stored; rejection keeps the prior result and sets `error`; `select(99)` is ignored; `restore` sets `ready` without calling the runner; `toggle('showGrid')` flips; `resetView` twice produces increasing `nonce`.
- [ ] **Step 2:** Run `npx vitest run src/store`; expect FAIL.
- [ ] **Step 3:** Implement. The worker file is three lines: receive `{ id, inputs }`, post `{ id, result: optimize(inputs) }`, or `{ id, error: message }` on throw. Create it with `new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' })`.
- [ ] **Step 4:** Re-run; expect PASS. Run `npm run build`; expect the worker chunk in `dist/assets`.
- [ ] **Step 5:** Commit: `feat: add optimizer worker and application stores`.

---

### Task 10: Workspace UI (inputs, summary, comparison, details)

**Files:** Create the `src/ui/` components except `PresetMenu`, `PresetDialog`, `ScenarioDrawer`, `ExportMenu`; modify `src/App.tsx`; tests `InputsPanel.test.tsx`, `LayoutComparisonTable.test.tsx`, `ProductionSummary.test.tsx`, `DetailsPanel.test.tsx`.

**Consumes:** Stores from Tasks 8-9, `computeAnalytics`, formatters.

**Layout:** header; production summary bar; then a three-column grid `grid-cols-[320px_minmax(0,1fr)_360px]`, full viewport height, each column scrolling on its own. The centre column holds a placeholder `<div data-testid="scene-slot">` (filled in Task 12) above the comparison table.

**Behaviour and exact copy:**

- Field groups and labels: "Pallet limitation" (Length, Width, Height), "Product box" (Length, Width, Height), "Maximum carton" (Max length, Max width, Max height), "Desired box quantity" (placeholder "Blank = maximize"), "Box leeway", "Carton wall thickness", "Pallet overhang", "Product rotation" (radio: "Fully rotatable", "Keep upright", "No side rotation", "Custom"), six checkboxes labelled with the orientation codes when Custom is chosen, checkbox "Keep cartons upright". Every numeric field shows the suffix "in". Each `NumberField` is a text input with `inputMode="decimal"`, `aria-invalid`, and its error in an element linked by `aria-describedby`.
- Under pallet Height: the notice from Global Constraints, then "Usable stacking height: 67.00 in" (live).
- Under leeway: "Added once per carton dimension."
- `AdvancedSection`: a `<details>` titled "Advanced optimization" that cannot be opened (`aria-disabled`), with the text "Coming in a later release".
- `ProductionSummary`: five tiles "Boxes per carton", "Cartons per layer", "Layers", "Cartons per pallet", "Total boxes per pallet", from `analytics.summary`; "—" when there is no layout.
- `LayoutComparisonTable` columns: "#", "Carton (in)", "Products", "Cartons", "Layers", "Utilization", "Remaining volume (in³)", "Score". Rows are buttons in effect: clicking or pressing Enter/Space calls `select`; the selected row has `aria-selected="true"`. A target-status badge appears beside Products when a target is set: "Target met", "Target exceeded", or "Target not achievable".
- Status line above the table: running -> "Calculating…"; stale -> "Showing the last valid result. Fix the highlighted fields to update."; truncated -> "Search stopped at the time limit; results may not be the best possible."; error -> the message with a "Retry" button.
- Empty states: `NO_CARTON_FITS` -> "No carton fits: the product box (plus leeway and walls) is larger than the maximum carton dimensions." `CARTON_EXCEEDS_PALLET` -> "No layout fits: the smallest possible carton is larger than the usable pallet space."
- `DetailsPanel` tabs "Analytics", "Explanation", "Selection". Analytics lists every field of `Analytics` under headings "Product", "Carton", "Pallet", "Final results", including "Maximum quantity possible" when a target is set. Explanation shows three rows (component value, weight, contribution), the final score, and the explanation sentence. Selection shows, per `Selection` kind: product dimensions and x/y/z coordinates; carton dimensions, product count, utilization %; pallet overall utilization, total cartons, total products, load dimensions; otherwise "Click an object in the 3D view to see its details."
- All numbers go through `formatNumber` (2 decimals); counts are integers.

- [ ] **Step 1: Write failing component tests** (render with real stores, a synchronous fake runner returning `optimize(inputs)`, and fake timers for the debounce):
  - defaults render the notice text and "Usable stacking height: 67.00 in";
  - typing "4" into pallet Height shows "Pallet height must be greater than 5 inches" and the stale status line, and the table still shows the previous rows;
  - the summary tiles equal `computeAnalytics` of the selected layout;
  - clicking row 2 sets `aria-selected` on it and changes the summary tiles to layout 2's values;
  - with a target of 1, row 1 shows "Target exceeded"; with 999999, "Target not achievable";
  - `NO_CARTON_FITS` copy appears for a 30-inch product;
  - choosing "Custom" and unticking everything shows "Select at least one orientation";
  - the Advanced section shows "Coming in a later release" and stays closed when clicked;
  - Explanation tab contributions equal the selected `score` values to 2 decimals.
- [ ] **Step 2:** Run `npx vitest run src/ui`; expect FAIL.
- [ ] **Step 3:** Implement the components and the `App.tsx` wiring from Task 9.
- [ ] **Step 4:** Re-run; expect PASS. Run `npm run dev` and load the page in Playwright once to confirm the three columns render without horizontal scrolling at 1440 x 900.
- [ ] **Step 5:** Commit: `feat: add workspace inputs, summary, comparison table, and details panels`.

---

### Task 11: Preset and scenario UI

**Files:** Create `src/ui/PresetMenu.tsx`, `PresetDialog.tsx`, `ScenarioDrawer.tsx`, `Notices.tsx` (if not already present); modify `Header.tsx`; tests `PresetMenu.test.tsx`, `ScenarioDrawer.test.tsx`.

**Behaviour:**

- `PresetMenu`: a select labelled "Preset" listing presets plus "No preset". Choosing one calls `replaceInputs(presetToInputs(preset, currentInputs))` and `setActive`. When the active preset no longer matches (`inputsMatchPreset` false) show the badge "Modified" and buttons "Save to preset" and "Save as new". A "Manage" button opens `PresetDialog`.
- `PresetDialog`: lists presets with "Edit" (name and every stored field, validated with the same messages as the inputs panel), "Clone", "Delete" (confirm: "Delete preset “NAME”?"), "Export" (downloads `pallet-presets.json`), and "Import" (file input accepting `.json`; afterwards a notice "Imported N preset(s), skipped M.").
- `ScenarioDrawer`: opened by a header button "Scenarios". "Save current" asks for a name (default "Scenario YYYY-MM-DD HH:mm") and is disabled when there is no ready result. Each row shows name, saved time, total products, and buttons "Load", "Rename", "Duplicate", "Delete". Load calls `replaceInputs(scenario.inputs)` then `results.restore(...)`, and the debounce wiring must not trigger a recalculation for inputs equal to the restored ones.
- `Notices`: stacked dismissible messages from `useNoticesStore`, `role="status"`.

- [ ] **Step 1: Write failing tests:** selecting "Standard GMA 48 × 40 × 72" sets pallet length to "48" and leaves product fields unchanged; editing leeway afterwards shows "Modified" and leaves the stored preset's leeway at 0.5; "Save to preset" updates it and clears the badge; "Save as new" adds a preset; saving a scenario, changing inputs, then "Load" restores inputs, the same layouts, and the saved `selectedIndex`, with the fake runner's call count unchanged by the load; rename and duplicate update the list; delete asks for confirmation.
- [ ] **Step 2:** Run `npx vitest run src/ui`; expect new tests to FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add preset and scenario management UI`.

---

### Task 12: 3D workspace

**Files:** Create all `src/scene/` files; modify `App.tsx` to mount `PalletScene` in the scene slot; tests `transforms.test.ts`, `cameraFit.test.ts`.

**Consumes:** `cartonPlacements`, `allProductPlacements`, `productsInCarton`, `layoutMetrics`, scene and results stores.

**Produces:**

```ts
// transforms.ts
export function toScenePosition(b: PlacedBox, i: Inputs): [number, number, number]; // box centre in scene frame
export function toSceneScale(b: PlacedBox): [number, number, number];               // [dx, dz, dy]
export function instanceMatrices(boxes: PlacedBox[], i: Inputs, shrink?: number): Float32Array; // 16 per box
export function loadBounds(l: Layout | null, i: Inputs): { min: [number, number, number]; max: [number, number, number] }; // includes the pallet
// cameraFit.ts
export function perspectiveFit(bounds, fovDeg: number, aspect: number): { position: [number, number, number]; target: [number, number, number] };
export function orthoFit(bounds, view: 'top' | 'side', aspect: number, margin?: number):
  { position: [number, number, number]; up: [number, number, number]; left: number; right: number; top: number; bottom: number; near: number; far: number };
// CaptureBridge.tsx registers on the scene store:
captureViews: null | (() => { current: string; top: string; side: string }); // PNG data URLs
```

**Decisions:**

- `<Canvas gl={{ preserveDrawingBuffer: true }} dpr={[1, 2]} frameloop="demand">`; call `invalidate()` on store changes. If WebGL context creation fails, render "3D view is unavailable in this browser. All numbers above remain accurate."
- Pallet: three stringers along the length (each 3.5 wide, 3.5 tall) under seven top deck boards across the width (each 1.5 tall), total height exactly 5; footprint exactly `pallet.length x pallet.width` (not the overhang footprint). Colour `#b08a5a`, roughness 0.9. Clicking it selects `{ kind: 'pallet' }`.
- Envelope: box of usable footprint x usable height sitting on the pallet top, `#3b82f6`, opacity 0.2, `depthWrite: false`, plus edge lines. Not clickable.
- Cartons: one `InstancedMesh` with per-instance colour alternating `#d9a066` and `#c68642` by `layerIndex`; edges drawn with one `LineSegments` built from the placements. Instances shrink by 0.02 so faces do not z-fight. When products are shown, carton opacity is 0.25. Wireframe toggle sets `wireframe` on carton and product materials.
- Products: one `InstancedMesh`, colour `#2f6f8f`, shrink 0.02, rendered only when `showProducts` and (`totalProducts <= PRODUCT_RENDER_THRESHOLD` or `forceProducts`). Above the threshold the toolbar shows "Products hidden: this layout has N boxes." with a "Show anyway" button that sets `forceProducts`.
- Picking uses `instanceId`: carton click -> `{ kind: 'carton', cartonIndex }`; product click -> cartonIndex `floor(instanceId / boxesPerCarton)`, productIndex `instanceId % boxesPerCarton`. The selected object gets an outline box in `#f59e0b`.
- Grid: drei `Grid`, 12-inch cells, 60-inch sections, at y = 0.
- Labels (drei `Html`): "Carton L × W × H in" at the first carton and "Product L × W × H in" beside it, shown when `showLabels`.
- Measurements: three dimension lines with end ticks and `Html` labels for the load's overall length, width, and height including the pallet, formatted "50.00 in".
- `CameraRig`: `OrbitControls makeDefault`; `reset` moves to `perspectiveFit(loadBounds)`; `focus` fits the selected object's bounds, or the load if nothing is selected. Initial camera uses the same fit.
- `CaptureBridge`: renders the current camera and reads `gl.domElement.toDataURL('image/png')`; then renders with a temporary `OrthographicCamera` from `orthoFit(bounds, 'top', 3 / 2)` and again with `'side'` (looking along +scene Z at the length x height face), reading the canvas after each; finally re-renders with the user's camera. Aspect for both is 3:2; temporarily resize the renderer to 1800 x 1200 for the two orthographic renders and restore the size afterwards.
- `SceneToolbar`: checkboxes "Products", "Cartons", "Labels", "Envelope", "Grid", "Wireframe", "Measurements"; buttons "Reset view", "Focus selection".

- [ ] **Step 1: Write failing tests:** `toScenePosition({x:0,y:0,z:0,dx:10,dy:20,dz:30}, I40)` equals `[-15, 20, -10]` for a 40 x 40 footprint (x: 5 - 20, y: 15 + 5, z: 10 - 20); `toSceneScale` returns `[10, 30, 20]`; `instanceMatrices` length is `16 * n` and element 12..14 of the first matrix is the scene position; `loadBounds` for case I is min `[-20, 0, -20]`, max `[20, 25, 20]`; `orthoFit(top)` frames the bounds with its `right - left` and `top - bottom` at ratio 1.5 and contains the bounds; `orthoFit(side)` likewise with the height axis vertical; `perspectiveFit` places the camera outside the bounds with the target at the bounds centre.
- [ ] **Step 2:** Run `npx vitest run src/scene`; expect FAIL.
- [ ] **Step 3:** Implement the pure helpers, then the components.
- [ ] **Step 4:** Re-run; expect PASS. Then verify in a real browser: start `npm run dev`, and with a Playwright script at 1440 x 900 take screenshots of (a) defaults, (b) Products on, (c) layout 2 selected, (d) overhang 2. Read the screenshots and confirm: the pallet footprint matches the entered size, cartons sit on the pallet inside the envelope, products are inside cartons, and the scene changes with the layout. Fix what is wrong before committing.
- [ ] **Step 5:** Commit: `feat: add interactive 3D pallet workspace`.

---

### Task 13: Export (JSON, CSV, PNG)

**Files:** Create `src/export/exportData.ts`, `csv.ts`, `png.ts`, `download.ts`, `src/ui/ExportMenu.tsx`; modify `Header.tsx`; tests `exportData.test.ts`, `csv.test.ts`, `png.test.ts`.

**Produces:**

```ts
export interface ExportPayload { exportedAt: string; inputs: Inputs; selectedLayout: RankedLayout;
  analytics: Analytics; comparison: { rank: number; carton: Dims; products: number; cartons: number; layers: number;
    utilizationPct: number; remainingVolume: number; score: number }[] }
export function buildExportPayload(inputs: Inputs, result: OptimizeResult, selectedIndex: number, now: Date): ExportPayload;
export function buildCsv(p: ExportPayload): string;
export function pngLayout(): { width: 2400; height: 1500; current: Rect; top: Rect; side: Rect; caption: Rect };
export function composePng(views: { current: string; top: string; side: string }, p: ExportPayload): Promise<Blob>;
export function downloadBlob(blob: Blob, filename: string): void;
export function exportFilename(ext: 'json' | 'csv' | 'png', now: Date): string; // pallet-layout-YYYYMMDD-HHmmss.ext
```

Rules: JSON is `JSON.stringify(payload, null, 2)` at full precision. CSV uses CRLF, quotes any field containing a comma, quote, or newline, and has two sections separated by a blank line: `Metric,Value` rows (timestamp, every input, carton dimensions, every summary and totals figure, target status) then the comparison table with the same column titles as the on-screen table; numeric values use 2 decimals. PNG canvas 2400 x 1500 on white: `current` at (0, 0, 1500, 1200) drawn "cover"; `top` at (1500, 0, 900, 600) and `side` at (1500, 600, 900, 600) drawn "contain"; panel titles "3D view", "Top view", "Side view"; `caption` at (0, 1200, 2400, 300) with the five production-summary figures, "Load: L × W × H in" (including the pallet), the carton dimensions, and the timestamp. `ExportMenu` offers "JSON", "CSV", "PNG"; all are disabled with the title "Run a calculation first" when no layout is selected; PNG shows the notice "3D view is unavailable, so PNG export is disabled." when `captureViews` is null.

- [ ] **Step 1: Write failing tests:** payload for case I has `comparison.length === result.layouts.length`, `selectedLayout.rank === selectedIndex + 1`, `exportedAt` equal to the passed date's ISO string; `JSON.parse(JSON.stringify(payload))` deep-equals the payload; CSV first line is `Metric,Value`, contains `Total boxes per pallet,32`, contains the comparison header line, uses `\r\n`, and quotes a field containing a comma; `exportFilename('png', new Date('2026-11-10T09:05:03'))` is `pallet-layout-20261110-090503.png`; `pngLayout()` rectangles do not overlap and tile exactly 2400 x 1500.
- [ ] **Step 2:** Run `npx vitest run src/export`; expect FAIL.
- [ ] **Step 3:** Implement. `composePng` is browser-only (uses `Image` and a 2D canvas) and is exercised in Task 14's end-to-end test, not in jsdom.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add JSON, CSV, and three-view PNG export`.

---

### Task 14: End-to-end test, documentation, final verification

**Files:** Create `playwright.config.ts`, `e2e/workspace.spec.ts`, `docs/architecture.md`, `docs/build-and-deploy.md`, `docs/assumptions-and-limitations.md`; rewrite `README.md`.

- [ ] **Step 1:** `playwright.config.ts`: `webServer` runs `npm run build && npm run preview -- --port 4173`, `use.baseURL` `http://localhost:4173`, Chromium only, `trace: 'off'`, viewport 1440 x 900.
- [ ] **Step 2: Write `e2e/workspace.spec.ts`:**
  - enter case I (product 10/10/10, max carton 20/20/10, pallet 40/40/25, leeway 0, wall 0) and expect the "Total boxes per pallet" tile to read 32 and "Cartons per pallet" 8;
  - the table has at least 2 rows; click row 2 and expect it to have `aria-selected="true"`;
  - a `canvas` is visible inside the scene slot;
  - choose Export > PNG, await the download, and assert the file is a PNG whose decoded size is 2400 x 1500;
  - choose Export > JSON and assert the parsed download has `inputs.product.length === 10`;
  - reload the page and expect the product length field to still read "10";
  - type "abc" in pallet Length and expect "Enter a number".
- [ ] **Step 3:** Run `npm run e2e -- --trace off`; expect PASS. Open the downloaded PNG and confirm by eye that all three panels show the load and the caption is legible.
- [ ] **Step 4:** Write the docs. `architecture.md`: the engines, data flow, coordinate frames, how to add a layer generator (Round 2) and a storage backend. `build-and-deploy.md`: Node 22, `npm ci`, each npm script, and Vercel steps (import the GitHub repository, framework preset Vite, build command `npm run build`, output `dist`, no environment variables). `assumptions-and-limitations.md`: spec sections 4 and 16 restated for a warehouse reader, plus the time-budget behaviour. `README.md`: what the tool does, a screenshot-free quick start, and links to the three docs.
- [ ] **Step 5:** Run `npm run format`, then `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e -- --trace off`. Expect every command to exit 0. Walk the spec section by section and confirm each requirement has a passing test or was checked by eye in Tasks 12 and 14; list anything unmet in the final report.
- [ ] **Step 6:** Commit: `docs: add architecture, deployment, and limitations docs; add end-to-end test`, then push.
