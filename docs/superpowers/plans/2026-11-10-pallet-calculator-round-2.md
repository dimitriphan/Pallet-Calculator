# Pallet Calculator Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desired-boxes-per-carton input, a Basic view for staff, a dark theme, a larger 3D view, and a PDF build sheet to the existing Pallet Calculator.

**Architecture:** One engine change (a boxes-per-carton filter in carton generation and a new empty reason). Everything else is presentation: a persisted preferences store drives view mode and theme; pure helpers turn a layout into stack descriptions and a build-sheet content model; jsPDF, loaded on demand, renders that model.

**Tech Stack:** As Round 1 (React 18.3, TypeScript strict, Vite 8, Tailwind 3.4, Zustand 5, Zod 4, three 0.170 / fiber 8 / drei 9, Vitest 5, Playwright). One new dependency: `jspdf` (latest 3.x or newer that installs cleanly), imported only through a dynamic `import()`.

**Spec:** `docs/superpowers/specs/2026-11-10-pallet-calculator-round-2-design.md` ("the spec"). Round 1's spec `docs/superpowers/specs/2026-11-10-pallet-calculator-design.md` still binds everything this round does not change.

## Global Constraints

- Every Round 1 global constraint still holds: inches at full precision, rounding only in formatters; `fitsCount`/`fitsWithin` for every fit comparison; `src/engine` and `src/domain` free of React, DOM, three, and Zustand; engine coordinate frame converted only in `src/scene/transforms.ts`; deterministic results.
- With "Desired boxes per carton" blank, results are identical to Round 1. The default example must still give 260 boxes in 52 cartons of 13 × 9 × 21 holding 5, in 7 layers.
- All numbers on screen, in the "What to build" card, and in the PDF come from `results.inputs` plus the existing analytics and position functions, never from the live draft.
- New preference defaults: view mode `basic`, theme `system`. Storage key `pc.prefs.v1`.
- Switching view mode or theme never calls the optimizer and never changes inputs, selection, presets, or scenarios.
- PNG and PDF exports are always rendered light, whatever the theme.
- three.js stays in the lazy scene chunk; jsPDF must be in its own lazy chunk; neither may appear in the initial chunk.
- Copy in this plan is verbatim. Existing copy and labels do not change unless a task says so.
- Existing tests keep passing unchanged, except where a task lists an assertion to update.
- Branch `claude/pallet-calculator-round-2`. Commit after every task; push with `git push -u origin claude/pallet-calculator-round-2`. Do not open a pull request.
- Every task ends with `npm run typecheck && npm run lint && npm test` passing.

## Review Focus

1. **Data saved before this round** (presets, scenarios, remembered inputs, exported preset files, none of which contain `boxesPerCarton`): must load with the field blank, not be skipped as invalid. Tests in Task 1.
2. **Awkward boxes-per-carton numbers** (1; a large prime such as 999983; 1000000; a number only reachable in a turned arrangement): must answer quickly and correctly, never hang or silently fall back to another count. Tests in Task 1.
3. **Preferences that are corrupt, missing, or change underneath the app** (hand-edited storage; the computer switching between light and dark while the page is open): defaults apply; the theme follows live. Tests in Task 3.
4. **Short or resized windows** (1280 × 720, or dragging the window smaller): the 3D view keeps its minimum height, the table stays reachable, and the load stays framed. Browser check in Task 5.
5. **Build-sheet extremes** (a job name with emoji or non-Latin characters; a layout with many distinct layer patterns; a 3D view that cannot run): the PDF is still produced, text is not garbled into something misleading, and no pattern block is split across pages. Tests in Tasks 8 and 9.

## File Structure

```
index.html                         + inline theme script
tailwind.config.js                 darkMode: 'class'
src/
  domain/      types.ts schemas.ts resultSchemas.ts constants.ts   (boxesPerCarton, new empty reason)
  engine/
    packing/cartons.ts             exact-count candidate generation
    optimize.ts                    NO_CARTON_WITH_COUNT + nearest counts
    analytics/stack.ts             NEW  layer runs and patterns (pure)
  persistence/keys.ts              + prefs key
  store/       prefsStore.ts NEW; inputsStore.ts presetsStore.ts (new field)
  ui/
    StoreContext.tsx               + prefs
    ViewModeSwitch.tsx ThemeControl.tsx useTheme.ts                 NEW
    settingsSummary.ts SettingsSummary.tsx BasicInputs.tsx
    WhatToBuildCard.tsx StatusMessages.tsx BuildSheetDialog.tsx     NEW
    App/Header/InputsPanel/ExportMenu/LayoutComparisonTable/... (edited)
  export/      buildSheet.ts buildSheetPdf.ts NEW; csv.ts exportData.ts (new field)
  scene/       sceneTheme.ts NEW; PalletScene.tsx CameraRig.tsx CaptureBridge.tsx SceneToolbar.tsx (edited)
e2e/workspace.spec.ts
docs/ README.md
```

The spec's architecture sketch placed the stack helper under `src/ui`; it lives in `src/engine/analytics/stack.ts` so the export code can share it without importing UI.

---

### Task 1: Boxes per carton in the domain and engine

**Files:** Modify `src/domain/types.ts`, `schemas.ts`, `resultSchemas.ts`, `constants.ts`, `src/engine/packing/cartons.ts`, `src/engine/optimize.ts`, `src/store/inputsStore.ts`, `src/store/presetsStore.ts`, `src/ui/presetFields.ts`, `src/data/samplePresets.ts`, and their tests.

**Produces:**

```ts
// types.ts
interface Inputs      { /* existing */ boxesPerCarton: number | null }   // null = optimizer chooses
interface InputsDraft { /* existing */ boxesPerCarton: string }          // '' = blank
interface Preset      { /* existing */ boxesPerCarton: number | null }
type EmptyReason = 'NO_CARTON_FITS' | 'CARTON_EXCEEDS_PALLET' | 'NO_CARTON_WITH_COUNT';
interface OptimizeResult { /* existing */ nearestCounts?: { below: number | null; above: number | null } }
// constants.ts: DEFAULT_INPUTS.boxesPerCarton = null
// cartons.ts
export function achievableCounts(i: Inputs): number[]; // distinct boxesPerCarton of the unrestricted candidates, ascending
// inputsStore: setField accepts the path 'boxesPerCarton'
```

**Rules:**

- Draft validation: blank parses to `null`; otherwise the trimmed text must be a whole number `>= 1`; the message for anything else, under the key `boxesPerCarton`, is "Enter a whole number of 1 or more" (non-numeric text gives "Enter a number", as for the target).
- `inputsSchema` and `presetSchema` accept a missing `boxesPerCarton` and produce `null` (a Zod default), so data written by Round 1 still validates. The inputs store's remembered-draft check accepts a draft without the key and fills `''`.
- `presetToInputs`, `presetFieldsOf` / the store's preset-from-inputs, and `inputsMatchPreset` include the field. Sample presets have it `null`.
- `generateCartonCandidatesWithInfo(i)`: when `i.boxesPerCarton` is `N`, enumerate only count triples whose product is `N`: for each `nL` from 1 to the L-axis fit bound with `N % nL === 0`, each `nW` likewise dividing `N / nL`, `nH = N / (nL · nW)`; keep the triple if it passes the existing sorted-fit rule. Apply the existing same-carton merge under Fully Rotatable and the existing sort. The 8000 cap and 500000 stop do not apply on this path and `truncated` is `false`.
- `achievableCounts(i)` runs the unrestricted path (`boxesPerCarton` ignored) and returns the distinct counts.
- `optimize`: when `N` is set and there are no candidates: if `achievableCounts` is empty return `NO_CARTON_FITS`; otherwise `NO_CARTON_WITH_COUNT` with `nearestCounts.below` = the largest achievable count `< N` (or `null`) and `.above` = the smallest `> N` (or `null`). Candidates exist but none places: `CARTON_EXCEEDS_PALLET`, unchanged.
- `resultSchemas`: the new reason and optional `nearestCounts` validate; results saved by Round 1 still validate.

- [ ] **Step 1: Write failing tests.**

```ts
// schemas
expect(parseDraft({ ...d, boxesPerCarton: '' })).toMatchObject({ ok: true, inputs: { boxesPerCarton: null } });
expect(parseDraft({ ...d, boxesPerCarton: ' 6 ' })).toMatchObject({ ok: true, inputs: { boxesPerCarton: 6 } });
for (const bad of ['0', '2.5']) expect(err({ ...d, boxesPerCarton: bad }).boxesPerCarton).toBe('Enter a whole number of 1 or more');
expect(err({ ...d, boxesPerCarton: 'abc' }).boxesPerCarton).toBe('Enter a number');
const { boxesPerCarton: _omit, ...round1Inputs } = DEFAULT_INPUTS;
expect(inputsSchema.parse(round1Inputs).boxesPerCarton).toBeNull();
// a Round 1 preset object and a Round 1 scenario object (fixtures without the field) parse, with boxesPerCarton null
// inputsStore: a remembered Round 1 draft (no boxesPerCarton key) is restored, not replaced by defaults, and reads ''
// presetsStore: importJson of a Round 1 export imports all; presetToInputs copies boxesPerCarton; inputsMatchPreset is false when it differs

// cartons, default inputs (achievable counts are 1,2,3,4,5,6,8,10)
expect(achievableCounts(DEFAULT_INPUTS)).toEqual([1, 2, 3, 4, 5, 6, 8, 10]);
const ten = generateCartonCandidatesWithInfo({ ...DEFAULT_INPUTS, boxesPerCarton: 10 });
expect(ten.truncated).toBe(false);
expect(ten.candidates.map(c => c.counts)).toEqual([{ L: 1, W: 2, H: 5 }]);
expect(generateCartonCandidates({ ...DEFAULT_INPUTS, boxesPerCarton: 6 }).map(c => c.counts)).toEqual([{ L: 1, W: 2, H: 3 }]);
expect(generateCartonCandidates({ ...DEFAULT_INPUTS, boxesPerCarton: 7 })).toEqual([]);
// brute-force agreement: for N in 1..40 on a 2 x 3 x 5 product, leeway 0, wall 0, max carton 20 x 18 x 16, rotation 'upright'
// (no merging), the exact path equals the unrestricted candidates filtered by boxesPerCarton === N (same set of counts)
// tiny product: 0.2 x 0.2 x 0.2 with boxesPerCarton 1000 returns only 1000-box cartons, non-empty, in under 1 s, truncated false
// large numbers return quickly
for (const n of [999983, 1000000]) {
  const t = performance.now(); generateCartonCandidatesWithInfo({ ...DEFAULT_INPUTS, boxesPerCarton: n });
  expect(performance.now() - t).toBeLessThan(500);
}

// optimize
expect(optimize({ ...DEFAULT_INPUTS, boxesPerCarton: null })).toEqual(optimize(DEFAULT_INPUTS)); // and still 260 / 52
const r6 = optimize({ ...DEFAULT_INPUTS, boxesPerCarton: 6 });
expect(r6.layouts.length).toBeGreaterThan(0);
expect(r6.layouts.every(l => l.layout.carton.boxesPerCarton === 6)).toBe(true);
expect(optimize({ ...DEFAULT_INPUTS, boxesPerCarton: 7 }))
  .toMatchObject({ layouts: [], emptyReason: 'NO_CARTON_WITH_COUNT', nearestCounts: { below: 6, above: 8 } });
expect(optimize({ ...DEFAULT_INPUTS, boxesPerCarton: 50 }))
  .toMatchObject({ emptyReason: 'NO_CARTON_WITH_COUNT', nearestCounts: { below: 10, above: null } });
expect(optimize({ ...DEFAULT_INPUTS, product: { length: 30, width: 8, height: 4 }, boxesPerCarton: 2 }))
  .toMatchObject({ emptyReason: 'NO_CARTON_FITS' });
// every r6 layout passes the existing placement invariants (testSupport helpers)
```

- [ ] **Step 2:** Run `npx vitest run src/domain src/engine src/store`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement. Update every `Inputs`/`Preset` literal the type change breaks (fixtures, `testUtils`, export tests) by adding `boxesPerCarton: null`.
- [ ] **Step 4:** Re-run the three commands in Global Constraints; expect PASS.
- [ ] **Step 5:** Commit: `feat: add an exact boxes-per-carton rule to the optimizer`.

---

### Task 2: Boxes per carton on screen and in exports

**Files:** Modify `src/ui/InputsPanel.tsx`, `LayoutComparisonTable.tsx`, `PresetEditForm.tsx`, `src/export/csv.ts`, and tests; create `src/ui/emptyMessage.ts` (+ test).

**Produces:**

```ts
// emptyMessage.ts
export function emptyMessage(result: OptimizeResult, inputs: Inputs): string | null; // null when layouts exist
```

**Copy:**

- Field label "Desired boxes per carton", placeholder "Blank = best fit", suffix "boxes", in the Packing group directly above "Desired box quantity". The preset edit form gains the same field.
- `NO_CARTON_WITH_COUNT`: "No carton holding exactly N boxes fits within the maximum carton dimensions." then, when both neighbours exist, " Counts that do fit: A and B."; when one exists, " The closest count that fits is A."
- The two existing empty messages are moved into `emptyMessage` unchanged; `LayoutComparisonTable` calls it.
- CSV metrics: a row "Desired boxes per carton" (blank or N) directly after the target-quantity row.

- [ ] **Step 1: Write failing tests:** `emptyMessage` for the three reasons including "…exactly 7 boxes… Counts that do fit: 6 and 8." and "…exactly 50 boxes… The closest count that fits is 10."; typing 6 into the new field changes the "Boxes per carton" tile to 6; typing 7 shows the message and no table rows; typing "x" shows "Enter a number"; the CSV contains `Desired boxes per carton,6`; the JSON export's `inputs.boxesPerCarton` is 6; saving a preset from inputs with 6 then choosing it elsewhere restores 6.
- [ ] **Step 2:** Run `npx vitest run src/ui src/export`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add the desired boxes-per-carton field, message, and export rows`.

---

### Task 3: Preferences, view-mode switch, theme control

**Files:** Create `src/store/prefsStore.ts`, `src/ui/ViewModeSwitch.tsx`, `ThemeControl.tsx`, `useTheme.ts` and tests; modify `src/persistence/keys.ts`, `src/ui/StoreContext.tsx`, `Header.tsx`, `testUtils.tsx`, `src/App.tsx`, `index.html`, `tailwind.config.js`.

**Produces:**

```ts
// keys.ts: STORAGE_KEYS.prefs = 'pc.prefs.v1'
// prefsStore.ts
export type ViewMode = 'basic' | 'full';
export type ThemePref = 'system' | 'light' | 'dark';
export interface PrefsState { viewMode: ViewMode; theme: ThemePref; setViewMode(m: ViewMode): void; setTheme(t: ThemePref): void }
export function createPrefsStore(storage?: Storage | null, initial?: Partial<Pick<PrefsState, 'viewMode' | 'theme'>>): StoreApi<PrefsState>;
export const usePrefsStore: /* default instance over localStorage */;
export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark';
// StoreContext: AppStores.prefs?; export function usePrefs<T>(selector: (s: PrefsState) => T): T
// useTheme.ts
export function useTheme(): 'light' | 'dark'; // applies/removes class "dark" on document.documentElement; follows matchMedia live when pref is 'system'
```

**Rules:**

- Stored value is JSON `{ "viewMode": …, "theme": … }`. Unreadable, wrong-shaped, or partly valid data: each invalid part falls back to its default (`basic`, `system`), with no notice. Read and write failures are swallowed. `initial` overrides stored values (tests only).
- `testUtils.makeStores` creates its prefs store with `initial: { viewMode: 'full', theme: 'light' }`, so every existing UI test keeps exercising Full view unchanged.
- `ViewModeSwitch`: `role="radiogroup"` labelled "View" with two `role="radio"` buttons "Basic" and "Full"; arrow keys move between them.
- `ThemeControl`: a `<select>` labelled "Theme" with options "System", "Light", "Dark".
- Both sit at the right end of the header, after the existing controls. In this task the view-mode switch only stores the preference; the screen does not change yet (Task 7).
- `tailwind.config.js`: `darkMode: 'class'`. `index.html` gets a small inline script in `<head>` that reads `pc.prefs.v1` inside try/catch and adds class `dark` to `<html>` when the theme is `dark`, or `system` with `matchMedia('(prefers-color-scheme: dark)')` matching. `App` calls `useTheme()` once.

- [ ] **Step 1: Write failing tests:** defaults are `basic` / `system`; changes persist across store instances; `"{bad"`, `{"viewMode":"wide","theme":"dark"}` (gives `basic` + `dark`), and a throwing `getItem`/`setItem` all leave a working store; `resolveTheme` truth table; with a stubbed `matchMedia`, `useTheme` adds `dark` for pref `dark`, removes it for `light`, follows a dispatched media-query change when `system`, and stops following after switching to `light`; the header shows both controls and choosing "Dark" sets the class; choosing "Basic" stores `basic` and does not call the fake optimizer runner again.
- [ ] **Step 2:** Run `npx vitest run src/store src/ui`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS. `npm run build` passes.
- [ ] **Step 5:** Commit: `feat: add view-mode and theme preferences with header controls`.

---

### Task 4: Dark theme

**Files:** Create `src/scene/sceneTheme.ts` (+ test); modify every component under `src/ui/` and `src/scene/` that sets a colour, `src/index.css`, `src/scene/CaptureBridge.tsx`.

**Produces:**

```ts
// sceneTheme.ts
export interface SceneTheme { background: string; gridCell: string; gridSection: string; chipBg: string; chipText: string }
export function sceneTheme(theme: 'light' | 'dark'): SceneTheme;
export const LIGHT_BACKGROUND = '#f3f4f6';
```

**Decisions:**

- Palette (Tailwind names): page `bg-gray-100` / `dark:bg-gray-950`; panels and dialogs `bg-white` / `dark:bg-gray-900`; raised rows and inputs `dark:bg-gray-800`; borders `gray-200` / `dark:border-gray-700`; text `gray-900` / `dark:text-gray-100`; secondary text `gray-600` / `dark:text-gray-300`; accent `blue-600` / `dark:text-blue-400` (and matching borders, rings, selected-row tint `dark:bg-blue-950`); the pallet notice `amber-50` + `amber-900` / `dark:bg-amber-950` + `dark:text-amber-200`; error text `red-700` / `dark:text-red-400`; badges get equivalent pairs. Native controls: set `color-scheme: light` on `:root` and `color-scheme: dark` on `.dark` in `index.css`.
- Body text and controls must reach 4.5:1 contrast in both themes.
- Scene: light theme keeps today's colours exactly (`background` `#f3f4f6`). Dark: `background` `#111827`, `gridCell` `#4b5563`, `gridSection` `#9ca3af`, label and measurement chips dark-on-light in light theme and light-on-dark in dark. Pallet, carton, product, envelope, and selection colours are untouched.
- Exports stay light: `CaptureBridge` sets the scene background to `LIGHT_BACKGROUND` for all three captures and restores it in its existing `finally`. The dark grid colours above are mid-greys chosen to stay visible on the light background.

- [ ] **Step 1: Write failing tests:** `sceneTheme('light').background === '#f3f4f6'`; dark values as above; the two themes differ in every field.
- [ ] **Step 2:** Run `npx vitest run src/scene/sceneTheme.test.ts`; expect FAIL. Implement the helper; expect PASS.
- [ ] **Step 3:** Add the `dark:` variants across the UI and wire `sceneTheme(useTheme())` into the scene.
- [ ] **Step 4:** Verify in a real browser at 1440 × 900 with Playwright (dev server; add the swiftshader launch args if WebGL fails). For each theme capture and READ: the workspace; the preset dialog; the scenario drawer; the Export menu open; an invalid field with its error and the "Out of date" badges; Measurements and Labels on. Then export a PNG while in dark theme and READ it: all three panels must have the light background. Fix anything illegible, unstyled, or light-on-light / dark-on-dark, and re-shoot.
- [ ] **Step 5:** Run the three Global Constraints commands and `npm run e2e -- --trace off`; expect PASS. Commit: `feat: add a dark theme`.

---

### Task 5: Larger 3D view

**Files:** Modify `src/App.tsx`, `src/scene/CameraRig.tsx`, `src/ui/LayoutComparisonTable.tsx` (wrapper classes only); create `src/scene/aspect.ts` (+ test).

**Produces:**

```ts
// aspect.ts
export function aspectChanged(previous: number, next: number, tolerance?: number): boolean; // |next / previous - 1| > tolerance (default 0.1); false if either is not finite and positive
```

**Decisions:**

- The centre column (`<main>`) becomes `flex min-h-0 flex-col gap-4 overflow-y-auto p-4`. The scene slot drops its fixed `h-[420px]` for `min-h-[320px] flex-1`; the comparison table's wrapper is `shrink-0`.
- `CameraRig` remembers the canvas aspect ratio from the last fit and re-fits to the current bounds when `aspectChanged` is true. It does not re-fit on smaller changes, so a user's orbit survives ordinary resizing.

- [ ] **Step 1: Write failing tests:** `aspectChanged(1.5, 1.6) === false`; `(1.5, 1.7) === true`; `(1.5, 1.3) === true`; `(0, 1.5) === false`; `(NaN, 1) === false`.
- [ ] **Step 2:** Run `npx vitest run src/scene/aspect.test.ts`; expect FAIL. Implement; expect PASS.
- [ ] **Step 3:** Apply the layout and camera changes.
- [ ] **Step 4:** Verify in a real browser. At 1440 × 900 and 1920 × 1080: READ a screenshot and measure with `boundingBox()` that the scene slot's bottom edge is within 20 px of the table's top edge, the table's bottom is within 20 px of the column's bottom, and the scene slot is taller than 420 px. At 1280 × 720 and 1100 × 600: the scene slot is at least 320 px tall, the page itself does not scroll, and the table can be scrolled into view inside the centre column. Resize 1440 × 900 → 900 × 900 and READ a screenshot: the whole load is still inside the canvas.
- [ ] **Step 5:** Run the Global Constraints commands and the e2e suite; expect PASS. Commit: `feat: let the 3D view fill the centre column`.

---

### Task 6: Stack and settings descriptions

**Files:** Create `src/engine/analytics/stack.ts`, `src/ui/settingsSummary.ts` and tests.

**Produces:**

```ts
// stack.ts
export interface StackRun { from: number; to: number; cartonsPerLayer: number; vertical: ProductAxis; height: number; pattern: string }
export interface StackPattern { letter: string; layerNumbers: number[]; layerIndex: number; cartonsPerLayer: number; vertical: ProductAxis; height: number }
export function stackPatterns(l: Layout): StackPattern[];   // distinct patterns in order of first use; letters 'A', 'B', …
export function stackRuns(l: Layout): StackRun[];           // consecutive layers sharing a pattern, bottom to top; layer numbers start at 1
export function describeRun(r: StackRun): string;
export function describeLayerList(layerNumbers: number[]): string; // [1] -> 'layer 1'; [2,3,4,5,6,7] -> 'layers 2–7'; [1,3,4] -> 'layers 1, 3–4'
// settingsSummary.ts
export function settingsSummary(i: Inputs): string;
```

**Rules:**

- Two layers share a pattern when they have the same `vertical` and deep-equal `blocks`. `layerIndex` is the index of the first layer using the pattern.
- `describeRun`: one layer → "Layer 1: 10 cartons, product length side up"; several → "Layers 2–7: 7 cartons each, product width side up" (en dash; "1 carton" singular; axis words length, width, height).
- `settingsSummary`: "Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable." Parts, in order: leeway; walls; "no overhang" or "2.00 in overhang"; rotation phrase ("fully rotatable", "product kept upright", "no side rotation", "custom orientations (LWH, WLH)"); then, only when applicable, ", cartons kept upright" and ", target 500 boxes". It never mentions boxes per carton. Numbers use `formatNumber`.

- [ ] **Step 1: Write failing tests:** for `optimize(DEFAULT_INPUTS).layouts[0].layout`: `stackRuns` described as exactly `["Layer 1: 10 cartons, product length side up", "Layers 2–7: 7 cartons each, product width side up"]`; `stackPatterns` gives letters A and B with `layerNumbers` `[1]` and `[2,3,4,5,6,7]`; a single-pattern layout gives one run "Layers 1–N: …"; a hand-built A, B, A layout gives three runs and two patterns with A's `layerNumbers` `[1, 3]`; `describeLayerList` cases above; `settingsSummary` for the default inputs (sentence above) and for overhang 2 + upright + keep-upright + target 500 + boxesPerCarton 6: "Using 0.50 in leeway, 0.25 in carton walls, 2.00 in overhang, product kept upright, cartons kept upright, target 500 boxes."
- [ ] **Step 2:** Run `npx vitest run src/engine/analytics src/ui/settingsSummary.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: describe a layout's stack and the settings in effect`.

---

### Task 7: Basic mode

**Files:** Create `src/ui/BasicInputs.tsx`, `SettingsSummary.tsx`, `WhatToBuildCard.tsx`, `StatusMessages.tsx` and tests (`BasicMode.test.tsx`); modify `src/App.tsx`, `Header.tsx`, `PresetMenu.tsx`, `ExportMenu.tsx`, `LayoutComparisonTable.tsx`, `src/scene/SceneToolbar.tsx`.

**Consumes:** `usePrefs`, `settingsSummary`, `stackRuns`/`describeRun`, `emptyMessage`, `useSelectedAnalytics`, `describeBoxCounts`, `cartonDisplayDims`.

**Decisions:**

- `App` renders the same shell (header, summary bar, three columns, notices) in both modes; the left and right columns and the centre contents depend on `viewMode`.
- `StatusMessages` is the existing status line and empty states extracted from `LayoutComparisonTable` (which now renders it), so Basic mode shows identical messages. No copy changes.
- **Basic left column** (`BasicInputs`): heading "Inputs"; the three existing size fieldsets with the pallet notice and usable-height line; the "Desired boxes per carton" field; then `SettingsSummary`.
- `SettingsSummary`: when the draft parses, `settingsSummary(parsed.inputs)` followed by a button "Change in Full view" (sets view mode `full`). When the draft fails only because of fields hidden in Basic (target quantity, leeway, wall thickness, overhang, custom orientations): "A setting in Full view needs fixing before results can update." with a button "Open Full view". When a visible field is invalid, show the sentence built from the last valid inputs (`results.inputs`), or nothing if there are none.
- **Basic centre:** the 3D view only (it fills the column per Task 5).
- **Basic right column:** `StatusMessages`, then `WhatToBuildCard`:
  - heading "What to build";
  - when the selected layout is not rank 1: "Showing layout N, chosen in Full view. Layout 1 fits X boxes." and a button "Use layout 1" (`results.select(0)`);
  - "Carton": "Outer size", "Inner size" (via `cartonDisplayDims` + `formatDims`, suffix " in"), "Boxes per carton", "Boxes inside" = `${describeBoxCounts(counts)} along the box's length × width × height`;
  - "Stack, from the bottom": an ordered list of `describeRun` lines;
  - "Finished load": "L × W × H in (including pallet)" from `analytics.pallet.loadLength`, `loadWidth`, `totalLoadHeight`;
  - with no layout: "Enter the three sizes to see what to build." unless `StatusMessages` is already showing an empty or error message.
- **Basic header:** preset select only (hide "Save to preset", "Save as new", "Manage", the "Modified" badge, and "Scenarios"); the Export menu offers "PNG" only in this task (the build sheet arrives in Task 9); then the view switch and theme control.
- **Basic scene toolbar:** only "Products", "Measurements", and "Reset view". Other toggle states are untouched. Clicking objects still selects and outlines them.
- Full mode is exactly today's screen.

- [ ] **Step 1: Write failing tests** (render with `makeStores` and a prefs store set to `basic`):
  - Basic shows the three fieldsets, "Desired boxes per carton", the settings sentence for the defaults, and the "What to build" card with "Layer 1: 10 cartons, product length side up", "Layers 2–7: 7 cartons each, product width side up", "Boxes inside" containing "1 × 1 × 5", and a finished load of "47.00 × 42.00 × 72.00 in (including pallet)";
  - Basic does not render: the "Layout comparison" table, any text "Score" or "Utilization", the tabs "Analytics"/"Explanation"/"Selection", "Box leeway", "Desired box quantity", "Product rotation", "Scenarios", "Manage", "JSON", "CSV";
  - the summary bar still shows 260;
  - "Change in Full view" switches to Full (the comparison table appears) and the fake runner's call count is unchanged; switching back keeps the same result;
  - select row 2 in Full, switch to Basic: the note reads "Showing layout 2, chosen in Full view. Layout 1 fits 260 boxes."; "Use layout 1" removes it and the card shows layout 1;
  - set leeway to "x" in Full, switch to Basic: "A setting in Full view needs fixing before results can update."; "Open Full view" returns to Full;
  - in Basic, typing "abc" into pallet Length shows "Enter a number", the out-of-date notice, and keeps the card's previous content;
  - in Basic with a 30-inch product, the `NO_CARTON_FITS` message shows and the card shows no carton rows;
  - boxes per carton 7 in Basic shows the "exactly 7 boxes" message;
  - the Basic scene toolbar test (component-level): only the three controls render.
- [ ] **Step 2:** Run `npx vitest run src/ui`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS. Then in a real browser at 1440 × 900 capture and READ Basic in light and dark themes and at 1280 × 720; confirm nothing overlaps, the card is readable, and the 3D view fills the centre.
- [ ] **Step 5:** Commit: `feat: add Basic mode with a what-to-build card`.

---

### Task 8: Build-sheet content model

**Files:** Create `src/export/buildSheet.ts`, `buildSheet.test.ts`.

**Produces:**

```ts
export interface SheetRow { label: string; value: string }
export interface SheetRect { x: number; y: number; dx: number; dy: number }
export interface SheetPattern {
  letter: string; heading: string;            // "Pattern A: layer 1" / "Pattern B: layers 2-7"
  facts: SheetRow[];                           // Cartons in layer; Carton footprint as placed; Layer height; Side facing up; Blocks
  drawing: { footprint: { x: number; y: number }; pallet: SheetRect; cartons: SheetRect[] };
}
export interface BuildSheet {
  title: 'Pallet build sheet'; jobName: string | null; dateText: string; stale: boolean;
  summary: SheetRow[]; carton: SheetRow[]; palletAndLoad: SheetRow[];
  patterns: SheetPattern[];
  stacking: { layer: number; pattern: string; cartons: number; height: string; topHeight: string }[];
  footer: string; layoutLabel: string;
}
export function buildSheetContent(a: { inputs: Inputs; result: OptimizeResult; selectedIndex: number;
  jobName: string; stale: boolean; now: Date }): BuildSheet;
export function buildSheetFilename(now: Date): string; // pallet-build-sheet-YYYYMMDD-HHmmss.pdf
export function pdfSafe(text: string): string;
```

**Rules:**

- `pdfSafe`: the PDF uses the built-in Helvetica font (Latin-1). Replace "–" and "—" with "-", curly quotes with straight ones, and any other character above U+00FF with "?". "×" (U+00D7) is kept. Every string in the returned `BuildSheet` has passed through `pdfSafe`.
- `jobName`: trimmed, cut to 80 characters, `null` when empty.
- `dateText`: local "YYYY-MM-DD HH:mm".
- `summary`: the five production-summary tiles with their on-screen labels.
- `carton`: "Outer size", "Inner size", "Boxes per carton", "Boxes inside" (same wording as the Basic card).
- `palletAndLoad`: "Pallet" (L × W in, 5.00 in tall); "Overhang" only when above 0 ("2.00 in in total, 1.00 in each side"); "Usable stacking height"; "Finished load" ("L × W × H in including pallet").
- `patterns` from `stackPatterns`. `drawing.footprint` is the usable footprint; `drawing.pallet` is the pallet rectangle inside it (`x = y = overhang / 2`); `drawing.cartons` are the x/y rectangles of that layer's cartons from `cartonPlacements` (already centred). "Carton footprint as placed" lists the footprint dimensions, noting "(some turned 90°)" when the pattern has both rotated and unrotated blocks. "Side facing up": "Product length", "Product width", or "Product height". "Blocks": each block as "rows × columns", joined with ", ".
- `stacking`: one row per layer, bottom to top; `topHeight` is the height to the top of that layer including the 5-inch pallet.
- `footer`: `settingsSummary(inputs)` plus " Desired boxes per carton: N." when set.
- `layoutLabel`: "Layout N of M".

- [ ] **Step 1: Write failing tests** for `optimize(DEFAULT_INPUTS)` winner with job name `"  Dock 4 – run №7 🚚  "` and `now = new Date(2026, 10, 10, 9, 5)`:
  - `jobName === 'Dock 4 - run ?7 ?'` (or `'??'` for the emoji's two code units: assert with a regex `/^Dock 4 - run \?7 \?+$/`); `dateText === '2026-11-10 09:05'`;
  - `summary` values `['5', '7-10', '7', '52', '260']`;
  - `patterns.map(p => p.heading)` equals `['Pattern A: layer 1', 'Pattern B: layers 2-7']`;
  - `patterns[0].drawing.cartons.length === 10`, `patterns[1].drawing.cartons.length === 7`; every carton rectangle lies inside the footprint; no two overlap; `drawing.pallet` equals `{ x: 0, y: 0, dx: 50, dy: 42 }`;
  - `stacking.length === 7`; the last row's `topHeight === '72.00 in'`; the cartons column sums to 52;
  - `layoutLabel === 'Layout 1 of 5'`; `footer` starts with "Using 0.50 in leeway";
  - no string anywhere in the sheet contains a character above U+00FF (walk the object).
  With overhang 2: `drawing.footprint` is `{ x: 52, y: 44 }`, `drawing.pallet` is `{ x: 1, y: 1, dx: 50, dy: 42 }`, and `palletAndLoad` has the Overhang row. With `stale: true` the flag is set. `buildSheetFilename(new Date(2026, 10, 10, 9, 5, 3)) === 'pallet-build-sheet-20261110-090503.pdf'`. An 81-character job name is cut to 80; `"   "` gives `null`.
- [ ] **Step 2:** Run `npx vitest run src/export/buildSheet.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit: `feat: add the build-sheet content model`.

---

### Task 9: PDF rendering and export

**Files:** Create `src/export/buildSheetPdf.ts` (+ test), `src/ui/BuildSheetDialog.tsx`; modify `src/ui/ExportMenu.tsx` (+ test), `package.json`.

**Produces:**

```ts
// buildSheetPdf.ts  (the only module that imports jspdf; reached only via dynamic import)
export interface SheetPictures { current: string; side: string } // PNG data URLs
export function planPages(sheet: BuildSheet): { patternsPerPage: string[][]; stackingOnPage: number; totalPages: number }; // pure; page 1 is the overview
export async function renderBuildSheetPdf(sheet: BuildSheet, pictures: SheetPictures | null): Promise<Blob>;
```

**Decisions:**

- `npm install jspdf`. `ExportMenu` loads it with `await import('../export/buildSheetPdf')`.
- jsPDF options: `{ unit: 'in', format: 'letter', orientation: 'portrait', compress: false }` (uncompressed so text can be checked in tests); font Helvetica; margins 0.5 in; black on white.
- Page 1 follows spec 7.2 top to bottom: title (20 pt bold), job name (14 pt) if any, date (10 pt); the boxed out-of-date line when `stale`; the five summary figures in one row of boxes with large numerals; "Carton" and "Pallet and load" as two label/value tables side by side; then the two pictures side by side, each scaled to fit a 3.6 × 3.0 in frame keeping aspect ratio, captioned "3D view" and "Side view". With `pictures === null`: the text "3D pictures unavailable" in place of the frames.
- Layer plan: each pattern block is 3.4 in tall: heading, a drawing area 3.2 × 2.9 in on the left, the facts table on the right. The drawing is scaled uniformly to fit its area with x (pallet length) horizontal: the usable footprint as a dashed rectangle when it differs from the pallet; the pallet as a thick outline; every carton as a thin-outlined, light-grey-filled rectangle; the footprint's length and width written along the bottom and left edges. Two pattern blocks fit per page. The "Stacking order" table follows the last block, moving to a new page if fewer than `0.3 + 0.22 × (rows + 1)` inches remain. `planPages` encodes these rules; a pattern block is never split.
- Footer on every page: `sheet.footer` (8 pt, wrapped to at most two lines) on the left; `"${layoutLabel} - Page X of Y"` on the right.
- `BuildSheetDialog`: a `ModalDialog` titled "Build sheet (PDF)" with a text field "Job name (optional)" (`maxLength={80}`) and buttons "Save PDF" and "Cancel". Enter submits.
- `ExportMenu`: a first item "Build sheet (PDF)" in both modes (Full: Build sheet (PDF), JSON, CSV, PNG; Basic: Build sheet (PDF), PNG). Disabled with the existing "Run a calculation first" title when there is no layout. On "Save PDF": pictures come from `captureViews()` (`{ current, side }`), or `null` when it is unavailable or throws; then `renderBuildSheetPdf`; then `downloadBlob(blob, buildSheetFilename(now))`. Any failure (including the dynamic import) pushes the notice "Build sheet could not be created. Try again." and closes the dialog without throwing.

- [ ] **Step 1: Write failing tests.**
  - `planPages`: the default winner (2 patterns, 7 layers) gives `totalPages === 2` with both patterns and the stacking table on page 2; a hand-built sheet with 5 patterns and 40 stacking rows gives patterns `[[A,B],[C,D],[E]]` across pages 2–4, the table placed without exceeding the page, and a consistent `totalPages`.
  - `renderBuildSheetPdf(sheet, null)` for the default winner (runs in Vitest's jsdom): the blob's text starts with `%PDF`; contains `Pallet build sheet`, the job name, `260`, `Pattern B: layers 2-7`, `3D pictures unavailable`, and `Page 2 of 2`; the count of `/Type /Page` objects (excluding `/Pages`) is 2.
  - `ExportMenu` (with `../export/buildSheetPdf` and `downloadBlob` mocked): the item opens the dialog; "Save PDF" with job name "Dock 4" calls the renderer with a sheet whose `jobName` is "Dock 4" and downloads a file matching `/^pallet-build-sheet-\d{8}-\d{6}\.pdf$/`; "Cancel" downloads nothing; a rejecting renderer pushes the failure notice and closes the dialog; with `captureViews` null the renderer receives `null` pictures; in Basic mode the menu lists exactly "Build sheet (PDF)" and "PNG"; with no layout the item is disabled.
- [ ] **Step 2:** Run `npx vitest run src/export src/ui/ExportMenu.test.tsx`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS. `npm run build`: confirm from the output that jsPDF is in its own chunk and absent from the initial chunk.
- [ ] **Step 5:** Verify the real document. With the dev server and Playwright, export the build sheet for (a) the default inputs with job name "Dock 4 - Tuesday run", (b) overhang 2 with boxes per carton 6, (c) the default inputs after typing "abc" into pallet Length (out of date), and (d) in dark theme. Convert each with `pdftoppm -r 80 -png` and READ every page. Confirm: nothing overlaps or runs off the page; pictures are light in all four, including (d); layer drawings are to scale with the right carton counts (10 and 7 for the default) and the dashed usable footprint in (b); the stacking table's last row reads 72.00 in for the default; the out-of-date box appears in (c); footers and page numbers are present. Fix and re-export until clean.
- [ ] **Step 6:** Commit: `feat: export a PDF build sheet`.

---

### Task 10: End-to-end test, documentation, final verification

**Files:** Modify `e2e/workspace.spec.ts`, `README.md`, `docs/architecture.md`, `docs/assumptions-and-limitations.md`, `docs/build-and-deploy.md` (only if scripts changed).

- [ ] **Step 1: Update the e2e test.**
  - A fresh visit shows the "What to build" heading and no "Layout comparison" table; the total-boxes tile reads 260.
  - Type 6 into "Desired boxes per carton": the "Boxes per carton" tile reads 6. Type 7: the "exactly 7 boxes" message appears. Clear it: 260 returns.
  - Choose Export > "Build sheet (PDF)", enter the job name "E2E run", save; read the download: it starts with `%PDF`, contains "Pallet build sheet", "E2E run", and "260", and has at least 2 pages.
  - Choose theme "Dark": `<html>` has class `dark`. Reload: it still has it and the page is still in Basic. Choose "Light".
  - Click "Full" in the View switch: the comparison table appears. The existing steps (case I entry, row switch, PNG/JSON/CSV exports, reload persistence, validation message) then run unchanged in Full view.
  - Still no console or page errors across the whole test.
- [ ] **Step 2:** Run `npm run e2e -- --trace off`; expect PASS.
- [ ] **Step 3: Documentation**, in plain English for the owner. README: Basic and Full views, the theme control, boxes per carton, the build sheet; update the "how to use it" steps to start from Basic. `docs/assumptions-and-limitations.md`: the boxes-per-carton rule with the worked example (7 → "6 and 8 fit"); what Basic hides and that hidden settings still apply; build-sheet limits from spec section 13; exports always light. `docs/architecture.md`: the preferences store, `stack.ts`, the build-sheet content model and renderer, the lazy jsPDF chunk, where theme colours live.
- [ ] **Step 4: Final verification.** `npm run format` on files changed in this task only; then `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e -- --trace off`, all exit 0. Walk the Round 2 spec section by section (3 through 13) and record for each requirement the test or by-eye check that covers it; list anything unmet in the report.
- [ ] **Step 5:** Commit: `docs: document Round 2 and extend the end-to-end test`, then push.
