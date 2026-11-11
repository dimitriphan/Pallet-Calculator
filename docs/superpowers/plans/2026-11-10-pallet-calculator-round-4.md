# Pallet Calculator Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a helmet to the mascot, unit switching (in/cm/mm), weight limits and reporting, pinwheel layers, a stability rating with tie-break and interlocking, and an unused-space overlay.

**Architecture:** The engine stays pure TypeScript in inches and pounds; new engine modules (`pinwheel`, `weight`, `stability`, `interlock`, `unusedSpace`) attach optional data to `Layout`. Units are converted only at the display edge through one formatting module, and the inputs store keeps each field's typed text with its exact inch value so switching units never changes the parsed inputs.

**Tech Stack:** React 18, TypeScript strict, Vite 8, Tailwind 3.4, Zustand 5, Zod 4, three / @react-three/fiber / drei, Vitest, Playwright, jsPDF.

**Spec:** `docs/superpowers/specs/2026-11-10-pallet-calculator-round-4-design.md` (binding). Earlier specs in the same folder still bind everything this round does not change.

## Global Constraints

- No existing answer changes except: a pinwheel layer that holds more cartons; a weight limit; the stability tie-break among equal box counts; interlock turning (box count unchanged). Any changed expected value in an existing test must be listed in the task report with the reason.
- With weight inputs blank, unit `in`, and the overlay off, the app behaves as on `main` apart from the three exceptions above and the helmet.
- Engine (`src/engine`, `src/domain`) has no React, DOM or unit conversion for display. Everything in it is inches and pounds.
- Old stored data (inputs draft, presets, scenarios, prefs) must load without error; new fields get defaults through the Zod schemas.
- Optimizer time budget stays 4 s with the 6 s hard limit and `truncated`.
- Harbor rules still hold: tokens only from `src/theme/tokens.ts`, every text pairing ≥ 4.5:1, no rounded corners, shadows or gradients, no opacity-dimmed text, coral for errors only, `src/theme/leftovers.test.ts` and the contrast tests keep passing. Light keeps its colours.
- Fixed 3D colours never change with theme: cartons `#D9A066`/`#C68642`, pallet `#B08A5A`, envelope `#3B82F6`, and now unused space `#EF4444` at 25 % opacity. Exports are always light.
- Mascot-only colours: existing five plus helmet `#E8B93C` and helmet shade `#B98A22`; never on an interface surface.
- Display precision: `in` 2 decimals, `cm` 1, `mm` 0; `lb` and `kg` 1; volumes in in³ for `in` and cm³ for `cm` and `mm`.
- Wording is plain English for warehouse staff. Existing wording, aria attributes, roles and test ids stay unless a task says otherwise.
- By-eye checks are done on the **built** app (`npm run build` + `npx vite preview`), never only the dev server.
- Commits end with exactly:
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01RkaCMRzvox5UYNoH1TUHrG`, and contain no other model identifier. Never commit `.superpowers/` or `dist/`.
- Every task ends green on: `npm run typecheck && npm run lint && npm test && npm run build`.

## Review Focus

1. **A value typed in one unit, then units switched.** Expected: results are not recalculated or marked out of date, and switching back restores the exact typed text. (Task 2 tests.)
2. **Data saved before this round** (a scenario or preset with no weights, stability or pattern fields; prefs with no unit). Expected: loads and displays with defaults. (Tasks 2, 3, 5 tests.)
3. **Weight edge cases:** a maximum below one layer; a maximum with no box weight; zero or negative weights. Expected: a clear message, never a silent wrong layout. (Task 3 tests.)
4. **Pinwheel under existing options:** overhang, "Keep cartons upright", exact boxes per carton, a square carton footprint. Expected: no overlap, nothing outside the usable footprint, never fewer cartons than before. (Task 4 tests.)
5. **Millimetres on a narrow screen:** values such as 1270 and 1828.8 in tiles, the table and input fields at 1100 × 600. Expected: nothing clipped or overlapping, header still one line with the Units select added. (Task 2 by-eye check and Task 7 e2e.)

---

### Task 1: Helmet sprites

**Files:**
- Modify: `tools/mascot/poses.mjs`, `tools/mascot/build.test.ts`
- Modify (only if crops clip): `src/ui/Mascot.tsx` (`HEADER_MARK_BOX`), `src/export/mascotImage.ts`, their tests
- Regenerate: `src/assets/mascot/*.png`, `public/favicon.png` via `npm run mascot`

**Interfaces:**
- Produces: `PALETTE` gains `Y: '#E8B93C'` and `H: '#B98A22'`. No component API changes.

- [ ] **Step 1: Failing tests** in `tools/mascot/build.test.ts`:
  - every exported pose map contains at least 12 `Y` or `H` pixels;
  - in every pose, at least 3 `G` pixels lie on rows above the topmost helmet pixel (leaf tips show above the helmet);
  - both `E` eye pixels are still present in every pose that had them, and the ring opening pixels of IDLE rows 12–14 are unchanged;
  - the helmet's widest row (the brim) is exactly 2 pixels wider than the head's widest row, 1 on each side;
  - `Y`/`H` appear in no pixel below the head's top three rows;
  - the palette guard test accepts exactly seven colours.
- [ ] **Step 2: Run** `npx vitest run tools/mascot` — expect the new tests to fail.
- [ ] **Step 3: Draw the helmet on IDLE** so every derived pose inherits it. Starting shape (adjust single pixels for readability, keep the tested properties): rows 7–9 are the dome, row 10 is the brim, replacing the stem below row 6 and the head's top two rows:

```
row 6   ..............SSG...............   stem emerges from the shell (unchanged)
row 7   .............YYYYYH.............
row 8   ............YYYYYYHH............
row 9   ...........YYYYYYYYHH...........
row 10  ..........HHHHHHHHHHHH..........   brim
row 11  ...........BBBBBBBBBB...........   head continues (unchanged)
```

  Poses that move the head (working lean, concerned tilt) must move the helmet with it. The header mark and tab icon keep the helmet; if the 16 px tab icon is unreadable, draw shell plus leaf tips only (spec section 3).
- [ ] **Step 4: Regenerate** with `npm run mascot`; run the determinism test (generated files equal the maps).
- [ ] **Step 5: Check crops.** Build, preview, and screenshot at 2×: header mark, empty state (96 px), calculating (64 px, all three frames), an error (concerned), favicon, and page 1 of a build sheet PDF. Nothing clipped; layout unshifted compared with `main`. Adjust `HEADER_MARK_BOX` / `mascotImage.ts` crop and their tests only if needed.
- [ ] **Step 6: Contact sheet** for the owner: one PNG showing every pose at 8× on both the Harbor panel colour and white, saved to `.superpowers/preview/round-4/helmet-contact-sheet.png` (not committed).
- [ ] **Step 7: Verify and commit** (`feat: give the mascot a construction helmet`).

---

### Task 2: Units

**Files:**
- Modify: `src/engine/units/units.ts` (+ test), `src/store/prefsStore.ts` (+ test), `src/store/inputsStore.ts` (+ test), `src/domain/types.ts`, `src/domain/schemas.ts`
- Create: `src/ui/format.ts` (+ test), `src/ui/UnitControl.tsx` (+ test), `src/ui/formatGuard.test.ts`
- Modify: `src/ui/Header.tsx`, `NumberField.tsx`, `DimsFieldset.tsx`, `InputsPanel.tsx`, `BasicInputs.tsx`, `AdvancedSection.tsx`, `settingsSummary.ts`, `ProductionSummary.tsx`, `WhatToBuildCard.tsx`, `LayoutComparisonTable.tsx`, `AnalyticsTab.tsx`, `SelectionTab.tsx`, `ExplanationTab.tsx`, `PresetDialog.tsx`, `PresetEditForm.tsx`, `ScenarioDrawer.tsx`, `StatusMessages.tsx`, `emptyMessage.ts`
- Modify: `src/scene/Labels.tsx`, `Measurements.tsx`, `sceneGeometry.ts`
- Modify: `src/export/buildSheet.ts`, `buildSheetPdf.ts`, `csv.ts`, `png.ts`, `exportData.ts` (+ tests)

**Interfaces:**
- Produces, in `src/engine/units/units.ts`:
  - `type Unit = 'in' | 'cm' | 'mm'` (exists); `type WeightUnit = 'lb' | 'kg'`
  - `weightUnitFor(unit: Unit): WeightUnit`
  - `toPounds(value: number, wu: WeightUnit): number`, `fromPounds(lb: number, wu: WeightUnit): number` (1 kg = 2.2046226218 lb)
  - `LENGTH_DECIMALS: Record<Unit, number>` = `{ in: 2, cm: 1, mm: 0 }`; `WEIGHT_DECIMALS = 1`
  - `formatLength(inches: number, unit: Unit = 'in'): string` now uses `LENGTH_DECIMALS[unit]`
  - `formatDims(d: Dims, unit: Unit = 'in'): string`
  - `formatWeight(lb: number, unit: Unit): string` (number only)
  - `formatVolume(cubicInches: number, unit: Unit): string` and `volumeLabel(unit: Unit): 'in³' | 'cm³'`
- Produces, in `src/store/prefsStore.ts`: `unit: Unit`, `setUnit(u: Unit): void`; stored in `pc.prefs.v1`; missing or unknown → `'in'`.
- Produces, in `src/ui/format.ts`: `useUnit(): Unit`; re-exports the formatters; `fmtPct(n: number, decimals?: number): string`; `fmtCount(n: number): string`. This file and `engine/units` are the only places allowed to call `toFixed` for display.
- Produces, in the inputs store:
  - every numeric draft field is displayed in the current unit;
  - `InputsState.unit: Unit`; `setUnit(u: Unit): void`;
  - `parsed` is always inches/pounds and is **deep-equal before and after `setUnit`**.

**The field rule (the part tests cannot guess).** For each length or weight field the store keeps, beside the draft text, an *origin*: `{ text: string; unit: Unit; canonical: number | null }` where `canonical` is the exact inch (or pound) value.
- `setField(path, text)`: origin = `{ text, unit: current, canonical: parse(text) converted to inches }`.
- `replaceInputs`, `applyPreset`, `reset`: origin = `{ text: formatted in current unit, unit: current, canonical: the exact stored inch value }`.
- `parseDraft` uses `origin.canonical` whenever the draft text equals the text the store last wrote for that field; so a value shown as `30.5 cm` that came from 12 in still parses to exactly 12.
- `setUnit(u)`: for each field with a non-null canonical, new text = `origin.text` if `origin.unit === u`, else the canonical formatted in `u`; the origin itself is kept. Fields that do not parse keep their text.
- Counts (`targetQuantity`, `boxesPerCarton`) are not converted.
- The persisted draft stores `unit` and origins so a reload keeps the rule; an old persisted draft without them is read as inches.

- [ ] **Step 1: Failing unit tests** (`units.test.ts`): `formatLength(12, 'cm') === '30.5'`, `formatLength(12, 'mm') === '305'`, `formatLength(12) === '12.00'`, `weightUnitFor('mm') === 'kg'`, `fromPounds(10, 'kg')` ≈ 4.5359, round trip within 1e-9, `formatVolume(1728, 'cm') === '28316.8'`, `volumeLabel('mm') === 'cm³'`.
- [ ] **Step 2: Implement** the units functions; update the old test that expected `formatLength(1, 'cm') === '2.54'` to `'2.5'`.
- [ ] **Step 3: Failing prefs tests:** default `in`; `setUnit('mm')` persists; stored `{"viewMode":"basic","theme":"harbor"}` (no unit) loads as `in`; stored `unit: 'furlong'` loads as `in`.
- [ ] **Step 4: Implement** prefs `unit`.
- [ ] **Step 5: Failing inputs-store tests** (Review Focus 1):
  - type `product.length = '12'` in `in`, `setUnit('cm')` → draft `'30.5'`, `parsed.product.length === 12` exactly, `parsed` deep-equals the value before the switch;
  - `setUnit('in')` again → draft `'12'` (the typed text, not `'12.00'`);
  - type `'30.5'` in `cm` → parsed ≈ 12.00787; switch to `in` → `'12.01'`; back to `cm` → `'30.5'`, parsed unchanged throughout;
  - an unparseable field (`'abc'`) keeps its text across switches;
  - `replaceInputs(DEFAULT_INPUTS)` in `mm` then parse → deep-equals `DEFAULT_INPUTS`;
  - an old persisted draft (no unit, no origins) loads as inches with the same parsed result as on `main`;
  - `targetQuantity` text is untouched by `setUnit`.
- [ ] **Step 6: Implement** the field rule. Keep prefs `unit` and inputs `unit` in step: `UnitControl` calls both; on startup the inputs store's persisted unit wins if the two disagree and prefs is corrected.
- [ ] **Step 7: Failing UI tests:**
  - `UnitControl` renders a select labelled "Units" with options in, cm, mm;
  - switching to cm changes field suffixes to `cm`, the pallet notice to "A 12.7-cm pallet is automatically included…" with the reduction also in cm, tiles/card/table/analytics values to cm with 1 decimal;
  - switching units does not call the optimizer and the "Out of date" badge does not appear (spy on the results store's `request`);
  - validation messages show limits converted.
- [ ] **Step 8: Implement** `format.ts`, `UnitControl`, and thread `unit` through every listed UI, scene and export file. Explanations: `explainRanking` contains no lengths today; confirm, and if any engine-produced sentence contains a length, give that function a `unit: Unit = 'in'` parameter and call it at display time rather than showing the stored string.
- [ ] **Step 9: Guard test** `src/ui/formatGuard.test.ts`: no file under `src/ui`, `src/scene` or `src/export` (tests and `format.ts` excluded) contains `.toFixed(` or the literal suffixes `' in'`, `"in"` used as a unit label outside `format.ts`/`UnitControl.tsx`. Make it pass by routing through `format.ts`.
- [ ] **Step 10: Export tests:** build sheet model, CSV and PNG label text in `cm` carry `cm` in headers and converted values; in `in` the output is byte-identical to `main`'s for the default example.
- [ ] **Step 11: By-eye check on the built app** (Review Focus 5): Harbor and Light, Basic and Full, at 1440 × 900, 1280 × 720 and 1100 × 600, in mm: header on one line with Units added, no clipped tiles, table cells or inputs. Fix layout with class changes only. Save screenshots under `.superpowers/preview/round-4/`.
- [ ] **Step 12: Verify and commit** (`feat: switch units between inches, centimetres and millimetres`).

---

### Task 3: Weight

**Files:**
- Modify: `src/domain/types.ts`, `schemas.ts`, `resultSchemas.ts`, `constants.ts` (+ tests)
- Create: `src/engine/analytics/weight.ts` (+ test)
- Modify: `src/engine/optimize.ts`, `src/engine/packing/stacking.ts`, `src/engine/analytics/analytics.ts`, `src/engine/ranking/rank.ts` (+ tests)
- Modify: `src/store/inputsStore.ts`, `presetsStore.ts`, `src/ui/presetFields.ts`, `PresetEditForm.tsx`
- Create: `src/ui/WeightFields.tsx` (+ test)
- Modify: `src/ui/BasicInputs.tsx`, `InputsPanel.tsx`, `WhatToBuildCard.tsx`, `LayoutComparisonTable.tsx`, `AnalyticsTab.tsx`, `emptyMessage.ts`, `settingsSummary.ts`
- Modify: `src/export/buildSheet.ts`, `buildSheetPdf.ts`, `csv.ts`

**Interfaces:**
- Consumes: Task 2 formatters (`formatWeight`, `weightUnitFor`), the inputs-store field rule (weight fields follow it with pounds as canonical).
- Produces, in `types.ts`:

```ts
export interface WeightInputs {
  productBox: number | null; // lb; null = weight ignored
  maxPallet: number | null;  // lb, whole load including pallet
  emptyCarton: number;       // lb, default 0
  pallet: number;            // lb, default 40
}
// Inputs gains:  weights: WeightInputs
// Layout gains:  weightTrim?: { layersRemoved: number }
// EmptyReason gains: 'OVER_WEIGHT'
// Preset gains:  weights: Omit<WeightInputs, 'productBox'>
```

- Produces, in `weight.ts`:

```ts
export interface LayoutWeight { total: number; perCarton: number; perLayer: number[]; centreOfMassHeight: number }
export function layoutWeight(l: Layout, i: Inputs): LayoutWeight | null; // null when productBox is null
export function trimToWeight(l: Layout, i: Inputs): Layout | null;       // same layout if no limit or already under; null if one layer is over
export function roomForCartons(l: Layout, i: Inputs): number;            // 0 when no limit
```

- `Analytics` gains `weight: (LayoutWeight & { roomForCartons: number; layersRemoved: number; max: number | null }) | null`.

**Rules to implement exactly:**
- Total = `pallet + cartons × (emptyCarton + boxesPerCarton × productBox)`.
- Centre-of-mass height above the floor: pallet mass at `PALLET_HEIGHT / 2`; each layer's mass at `PALLET_HEIGHT + layer.z + layer.height / 2`.
- `trimToWeight` removes layers from the top (last in `layers`) and recomputes `totalCartons`, `totalProducts` and `id`; sets `weightTrim.layersRemoved` when > 0.
- **Trimming happens before any pruning or ranking by total.** In `optimize.ts`, every layout from `buildLayouts` is trimmed before it enters the keep-best set; layouts that become identical after trimming are de-duplicated by `id`. Additionally, for each carton and each layer type, `buildLayouts` must offer the single-type stack so a carton with lighter layers is not lost (it already does; keep that true).
- If every layout trims to null and at least one layout existed, `emptyReason = 'OVER_WEIGHT'`; message: "Nothing fits: one layer is already over the maximum pallet weight."
- Validation (in the schema/parse layer, shown as field messages): product box weight > 0; maximum pallet weight > 0; empty carton ≥ 0; pallet ≥ 0; maximum set with blank box weight → message on the box-weight field "Enter the weight of one product box to use a maximum pallet weight."; maximum ≤ pallet weight → "The maximum must be more than the pallet's own weight."

- [ ] **Step 1: Failing engine tests** (`weight.test.ts`), hand-worked: default example carton (state its boxes per carton from the current default result in the test) with `productBox 2`, `emptyCarton 1`, `pallet 40`: total, perCarton, perLayer and centre-of-mass height computed by hand in comments; `layoutWeight` null when `productBox` null; `trimToWeight` returns the same object when no max; trims to the exact layer where total ≤ max (test max equal to an exact total: stays; one pound under: one more layer removed); returns null when one layer + pallet exceeds max; `roomForCartons` = floor((max − total) / perCarton), 0 without max.
- [ ] **Step 2: Implement** `weight.ts`.
- [ ] **Step 3: Failing optimizer tests:**
  - blank weights → result deep-equals the current result for the default example and two other existing fixtures;
  - with a max, no returned layout exceeds it and the best layout's products ≥ every other trimmed candidate's;
  - **granularity case:** construct inputs where the untrimmed winner trims to fewer boxes than a carton with smaller layers; assert the smaller-layer layout is rank 1 (this fails if trimming runs after pruning);
  - max below one layer → `emptyReason: 'OVER_WEIGHT'`, `layouts: []`;
  - target quantity and exact boxes-per-carton both still work with a max.
- [ ] **Step 4: Implement** in `optimize.ts`; extend `DEFAULT_INPUTS.weights = { productBox: null, maxPallet: null, emptyCarton: 0, pallet: 40 }`; schemas default missing `weights` (Review Focus 2: a stored scenario and a stored preset without `weights` parse).
- [ ] **Step 5: Failing UI tests** (`WeightFields.test.tsx` and existing panels): Basic shows "Weight per product box" and "Maximum pallet weight"; Full adds "Empty carton weight" and "Pallet weight" in a "Weight" group; suffix `lb`, or `kg` in cm/mm; each validation message above; card shows "Total weight", "Weight per carton", and when trimmed "Limited by weight: N layers removed" and "Room for N more cartons by weight" (only when N ≥ 1); table shows a "Weight" column only when a box weight is set; analytics shows weight per layer and centre-of-mass height; nothing weight-related renders when the box weight is blank.
- [ ] **Step 6: Implement** UI, presets (weights without `productBox`), settings summary, build sheet, PDF and CSV lines.
- [ ] **Step 7: By-eye check on the built app**, both themes, Basic and Full: weight-limited load, over-weight message, kg display.
- [ ] **Step 8: Verify and commit** (`feat: add weight limits and weight reporting`).

---

### Task 4: Pinwheel layers

**Files:**
- Create: `src/engine/packing/pinwheel.ts` (+ test), `src/engine/packing/overlap.testSupport.ts`
- Modify: `src/engine/packing/stacking.ts` (`bestLayer`, `toPattern`) (+ test), `src/domain/types.ts`, `resultSchemas.ts`
- Modify: `src/engine/analytics/stack.ts` or `analytics.ts` (pattern name), `src/ui/LayoutComparisonTable.tsx`, `WhatToBuildCard.tsx`, `src/export/buildSheet.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export type LayerPatternKind = 'grid' | 'pinwheel';
// LayerPattern gains: kind?: LayerPatternKind   (absent = 'grid', for stored data)

// pinwheel.ts
export const MAX_PINWHEEL_WORK = 2_000_000;
export interface PinwheelResult { count: number; blocks: Block[]; capped: boolean }
/** Best four-block pinwheel of a×b cartons in a rectX×rectY rectangle, or null if none has 4 non-empty blocks. */
export function pinwheelLayer(rectX: number, rectY: number, a: number, b: number): PinwheelResult | null;

// overlap.testSupport.ts
export function cartonRects(blocks: Block[], a: number, b: number): { x: number; y: number; w: number; h: number }[];
export function assertNoOverlapWithin(blocks: Block[], a: number, b: number, rectX: number, rectY: number): void; // throws with the offending pair
```

**Algorithm (not determined by the signature).** Four blocks anchored at the four corners, going round: B1 bottom-left unrotated (`c1` columns of `a`, `r1` rows of `b`), B2 bottom-right rotated (columns of `b`, rows of `a`), B3 top-right unrotated, B4 top-left rotated. Enumerate `c1, r1` (each ≥ 1); for B2 enumerate its row count and take the largest column count that clears B1; for B3 enumerate its row count and take the largest column count that clears B1 and B2; for B4 take the largest row count, then the largest column count that clears B1, B2 and B3 (also try columns first). "Clears" is the axis-aligned rectangle test with `EPS` from `domain/constants`. Count every loop iteration against `MAX_PINWHEEL_WORK`; on hitting it return the best so far with `capped: true`. Skip when `a === b` (a square footprint cannot benefit). Use the same tolerance helpers (`fitsWithin`) as `layerSearch`.

- [ ] **Step 1: Write the overlap verifier and its own tests** (two overlapping blocks throw; touching blocks pass; a block outside the rectangle throws).
- [ ] **Step 2: Failing pinwheel tests:**
  - 5 × 5 rectangle, 3 × 2 cartons: `searchLayer(5, 5, 3, 2).count === 3` and `pinwheelLayer(5, 5, 3, 2)!.count === 4`; verifier passes. (If `searchLayer` returns 4 here, report it and use 7 × 7 with 4 × 3 or another case found by brute force in the test.)
  - a realistic case in inches where the pinwheel wins, found by a small search in the test file over pallets 48 × 40 and 50 × 42 and carton footprints from 8 to 24 in half-inch steps: assert at least one footprint exists where pinwheel count > `searchLayer` count, and pin that footprint and both counts as a named regression case;
  - property test over 300 seeded random rectangles and footprints: verifier passes and `count` equals the number of carton rectangles;
  - square footprint returns null; a rectangle too small for 4 blocks returns null;
  - a huge case (`rectX = rectY = 500`, `a = 3`, `b = 2`) returns within 500 ms with `capped` true or false and a valid layer.
- [ ] **Step 3: Implement** `pinwheel.ts`.
- [ ] **Step 4: Failing integration tests** (`stacking.test.ts`, `optimize.test.ts`): `bestLayer` returns `kind: 'pinwheel'` only when its count is strictly greater than the guillotine count, otherwise the guillotine pattern unchanged (object-equal to before); the cache key still works across vertical axes; with overhang set, all pinwheel cartons lie inside the usable footprint; with "Keep cartons upright" a pinwheel can still be chosen; with exact boxes per carton the pinned regression case still yields a pinwheel; for every existing optimizer fixture, total products ≥ the value on `main` (list any increase in the report; verify each increased layout with the verifier).
- [ ] **Step 5: Implement** in `bestLayer`. Respect `shouldStop`/time budget: do not call `pinwheelLayer` once `shouldStop` is true.
- [ ] **Step 6: UI and export tests, then implementation:** table pattern text shows "Pinwheel" for a layout containing a pinwheel layer; card and build sheet say "Pinwheel layer: build the four blocks around the centre gap as shown in the top view."; stored results without `kind` render as before.
- [ ] **Step 7: By-eye check on the built app:** the pinned realistic case in 3D and in the exported top view; blocks visibly turn around a centre gap, nothing overlaps.
- [ ] **Step 8: Verify and commit** (`feat: use pinwheel layers when they fit more cartons`).

---

### Task 5: Stability rating, tie-break and interlocking

**Files:**
- Create: `src/domain/stabilityThresholds.ts`, `src/engine/analytics/stability.ts` (+ test), `src/engine/packing/interlock.ts` (+ test), `src/ui/StabilityBadge.tsx` (+ test)
- Modify: `src/domain/types.ts`, `resultSchemas.ts`, `src/engine/optimize.ts`, `src/engine/ranking/score.ts`, `rank.ts`, `explain.ts` (+ tests), `src/engine/analytics/analytics.ts`
- Modify: `src/ui/WhatToBuildCard.tsx`, `LayoutComparisonTable.tsx`, `AnalyticsTab.tsx`, `src/export/buildSheet.ts`, `buildSheetPdf.ts`, `csv.ts`, `src/theme/tokens.ts` pairing list only if a new pairing is needed

**Interfaces:**
- Consumes: `cartonRects` logic (move the non-test part into `src/engine/packing/geometry.ts` as `blockCartonRects(blocks, a, b)` if not already there; the test support re-exports it).
- Produces:

```ts
// stabilityThresholds.ts
export const STABILITY = {
  stackHeightRatio:  { caution: 1.5, serious: 2.0 },  // stack height / shorter footprint side
  cartonHeightRatio: { caution: 1.5, serious: 2.5 },  // carton height / its shorter base side
  supportShare:      { caution: 0.9, serious: 0.7 },  // share of a layer's base resting on the layer below
  columnLayers: 4,                                    // identical layers in straight columns
} as const;

// types.ts
export type StabilityRating = 'good' | 'fair' | 'poor';
export type StabilityCheck = 'stackHeight' | 'cartonHeight' | 'support' | 'columns';
export interface StabilityWarning { check: StabilityCheck; level: 'caution' | 'serious'; value: number; layer?: number }
export interface Stability { rating: StabilityRating; warnings: StabilityWarning[] }
// Layout gains: stability?: Stability
// Layer gains:  turned?: boolean

// stability.ts
export function assessStability(l: Layout, i: Inputs): Stability;
export function describeWarning(w: StabilityWarning): string;
export function supportShare(upper: Layer, lower: Layer, l: Layout): number; // 0..1

// interlock.ts
export function interlockLayers(l: Layout, i: Inputs): Layout; // same totals; may set turned on layers
```

**Rules to implement exactly:**
- Stack height = sum of layer heights (pallet deck excluded). Footprint = bounding extent of the bottom layer; ratio uses its shorter side.
- Carton height ratio is evaluated per layer (cartons may stand on different axes); the worst layer is reported with its number.
- Support share of layer k (k ≥ 1) = area of (layer k carton rectangles ∩ union of layer k−1 carton rectangles) ÷ area of layer k carton rectangles. Cartons within a layer never overlap, so the intersection is a sum over rectangle pairs. Worst layer reported.
- Columns: a caution when `STABILITY.columnLayers` or more consecutive layers have identical carton rectangle sets.
- Thresholds are strict: a ratio exactly 1.5 gives no warning; support exactly 0.9 gives no warning.
- Rating: no warnings → good; cautions only → fair; any serious → poor.
- `describeWarning` sentences: "Stack is tall for its base (1.8 times its shorter side)."; "Cartons in layer 3 stand on a narrow face (2.6 times taller than their shorter side)."; "Layer 4 is only 82% supported by the layer below."; "Layers are stacked in straight columns with no interlocking."
- `interlockLayers`: for each run of consecutive identical layers, turn every second layer 180° about the centre of the usable footprint (`x' = X − x − w`, `y' = Y − y − h` per block, block order re-sorted) **only if** the turned layer's rectangle set differs from the original **and** every affected support share stays ≥ `STABILITY.supportShare.caution`. Turned layers get `turned: true` and their blocks are stored already turned, so the scene, pictures and positions need no change. `id` is recomputed.
- Pipeline in `optimize.ts`: build → weight trim (Task 3) → interlock → assess stability → rank.
- Ranking in `compareRanked`: total products descending; then rating good < fair < poor; then the existing score comparison unchanged. `explainRanking` gains a sentence for the new case: "…because it has a better stability rating (Good vs Fair) at the same quantity."

- [ ] **Step 1: Failing stability tests:** for each of the four checks, a constructed layout just under, exactly at, and just over each threshold (exactly-at gives no warning); rating combinations; `supportShare` for an identical layer (1), a layer shifted by half a carton (hand-computed), and a smaller layer centred on a larger one (1); mixed vertical axes; `describeWarning` exact strings.
- [ ] **Step 2: Implement** thresholds and `stability.ts`.
- [ ] **Step 3: Failing interlock tests:** a two-block asymmetric layer stacked 6 high → layers 2, 4, 6 turned, totals unchanged, verifier passes for every layer, all cartons inside the usable footprint, columns caution gone; a symmetric single grid centred or flush such that turning leaves the set identical → nothing turned and columns caution stands; a case where turning would drop support below 0.9 → nothing turned; a pinwheel stack → turned layers still valid.
- [ ] **Step 4: Implement** `interlock.ts`.
- [ ] **Step 5: Failing ranking tests:** two layouts with equal products, lower score but better rating wins; more products always wins regardless of rating; equal products and rating → existing order preserved (existing rank tests still pass unchanged or their changes are listed in the report); explanation sentence; stored scenario without `stability` or `turned` loads (Review Focus 2).
- [ ] **Step 6: Implement** pipeline and ranking.
- [ ] **Step 7: Failing UI tests, then implementation:** `StabilityBadge` shows "Stability: Good/Fair/Poor" using the existing success, caution and error badge styles (Poor = coral text on panel, never a coral fill); the table has a "Stability" column; the card lists warning sentences under the badge in Basic and Full; the Analytics tab lists every check with its value; the build sheet prints the rating, the warnings, and "Turn these layers half a turn (180°): 2, 4, 6" when layers are turned; CSV gains stability columns. Layouts with no stability data render no badge.
- [ ] **Step 8: Contrast:** if a new text/background pairing is used, add it to the pairing list in `src/theme/tokens.ts` and confirm the pairing test passes.
- [ ] **Step 9: By-eye check on the built app**, both themes: Good, Fair and Poor examples, a turned stack in 3D (alternate layers visibly offset), build sheet PDF.
- [ ] **Step 10: Verify and commit** (`feat: rate stability, prefer stable layouts on ties, interlock layers`).

---

### Task 6: Unused-space overlay

**Files:**
- Create: `src/engine/analytics/unusedSpace.ts` (+ test), `src/scene/UnusedSpace.tsx`
- Modify: `src/engine/analytics/analytics.ts`, `src/store/sceneStore.ts` (+ test), `src/scene/SceneToolbar.tsx` (+ test), `PalletScene.tsx`, `sceneTheme.ts` (+ test), `captureVisibility.ts` if needed, `src/ui/AnalyticsTab.tsx`

**Interfaces:**
- Produces:

```ts
// unusedSpace.ts
export interface SpaceBox { x: number; y: number; z: number; dx: number; dy: number; dz: number } // inches, pallet-deck origin as cartonPlacements uses
export interface UnusedSpace { headroom: SpaceBox | null; gaps: SpaceBox[]; headroomVolume: number; gapVolume: number }
export const MIN_GAP = 0.25;
export function unusedSpace(l: Layout, i: Inputs): UnusedSpace;
// sceneStore ToggleKey gains 'unusedSpace' (default false)
// sceneTheme gains fixed: unusedSpace: '#EF4444', unusedSpaceOpacity: 0.25
// Analytics.totals gains: headroomVolume: number; layerGapVolume: number
```

**Rules to implement exactly:**
- The reference volume is the one `Analytics.totals.volumeAvailable` already uses; `headroomVolume + layerGapVolume` must equal `totals.remainingVolume` within 1e-6 for every fixture. Read `computeAnalytics` first and match its definition of the available footprint and height; if its definition makes that identity impossible, stop and report rather than redefine the existing total.
- Headroom: the available footprint from the top of the stack to the available height; null when under `MIN_GAP` tall.
- Layer gaps: for each layer, the available footprint minus the layer's carton rectangles, decomposed into non-overlapping rectangles (coordinate-compress on all rectangle edges, mark covered cells, merge free cells along x then along y). Rectangles with a side under `MIN_GAP` are not returned as boxes but **are** counted in `gapVolume`.
- `UnusedSpace.tsx` draws each box as a mesh with a transparent `#EF4444` material at 0.25 opacity, `depthWrite: false`, plus thin edge lines; it is not selectable and ignores pointer events. It shows in perspective and in the top/side captures when the toggle is on. Its colour does not go through the theme and is unchanged in light captures.

- [ ] **Step 1: Failing engine tests:** single full grid with a strip free on one side → one gap box per layer with hand-computed size; pinwheel layer → centre gap box present; gaps never overlap cartons or each other (reuse the verifier's rectangle test); the volume identity above for the default example, the pinned pinwheel case and a weight-trimmed layout; a 0.1 in sliver is not returned as a box but is in `gapVolume`; no headroom box when the stack reaches the limit.
- [ ] **Step 2: Implement** `unusedSpace.ts` and the analytics fields.
- [ ] **Step 3: Failing UI tests:** toolbar has a checkbox labelled "Unused space", unchecked by default, in Basic and Full; toggling flips `sceneStore` `unusedSpace`; `resetForLayout` leaves it as set; the Analytics tab shows "Headroom above the load" and "Gaps beside cartons" volumes in the current unit; `sceneTheme` test pins `#EF4444` and 0.25 for both themes.
- [ ] **Step 4: Implement** the store key, toolbar checkbox (same focus-tick wrapper as its neighbours), `UnusedSpace.tsx`, analytics rows.
- [ ] **Step 5: By-eye check on the built app**, both themes: overlay on for the default example and the pinwheel case; cartons remain readable through it; PNG export with the overlay on shows it in all three views and with it off shows none; exports stay light.
- [ ] **Step 6: Verify and commit** (`feat: show unused space in the 3D view`).

---

### Task 7: End-to-end test and documentation

**Files:**
- Modify: `e2e/workspace.spec.ts`
- Modify: `README.md`, `docs/assumptions-and-limitations.md`, `docs/architecture.md`
- Modify: the Round 4 spec, only to correct facts that changed during the build

- [ ] **Step 1: e2e steps** (run against the built app as today; retrying assertions, no fixed sleeps):
  - Units: select mm; the product length field shows `305` and the "Total boxes per pallet" tile is unchanged; the "Out of date" badge never appears; select in; the field shows the originally typed text.
  - At 1100 × 600 in Full, in mm, both themes: the header check from the existing step still passes.
  - Weight: enter box weight and a maximum that forces trimming; the card shows "Limited by weight" and the total weight is at or under the maximum (parse the number).
  - Over-weight: a maximum below one layer shows the nothing-fits message with the weight reason.
  - Pinwheel: enter the pinned realistic case; the table shows "Pinwheel".
  - Stability: a badge with one of Good/Fair/Poor is visible on the card.
  - Overlay: tick "Unused space"; export PNG; the download succeeds with no console errors.
  - Mascot: the header image still loads (naturalWidth > 0) and is aria-hidden.
- [ ] **Step 2: Docs.** README: units, weight, pinwheel, stability, overlay, in plain English. Assumptions and limitations: remove the "guillotine layers only" and "no weight, stability" limitations and replace them with what is and is not checked now (whole-layer trimming, advice-only stability, no crush strength, no per-carton weight limit, thresholds table); state that stage 2 (mixed pallets) is not built. Architecture: the new engine modules, the pipeline order, the units-at-the-edge rule and the field rule, the guard test, where thresholds live, how to regenerate the mascot.
- [ ] **Step 3: Full verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e -- --trace off`.
- [ ] **Step 4: Commit** (`docs: document Round 4 and extend the end-to-end test`).
