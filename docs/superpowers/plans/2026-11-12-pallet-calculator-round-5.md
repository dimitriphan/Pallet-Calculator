# Round 5 implementation plan

Spec: `docs/superpowers/specs/2026-11-12-pallet-calculator-round-5-design.md`
(the spec is the authority; this plan says how and in what order).
Branch: `claude/pallet-calculator-round-5`.

## Rules for every task

- Test first: write the failing test, then the code. Engine code is pure
  TypeScript in inches and pounds, no React or three.js.
- Before finishing: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build` all pass. UI tasks also run `npm run e2e -- --trace off`
  and look at the **built** app (`npm run build && npm run preview`) with
  Playwright screenshots at 768, 1100 and 1440 px, light and dark.
- Display rules: all lengths, weights and numbers go through
  `src/ui/format.ts` and `useUnit` (the guard test
  `src/ui/formatGuard.test.ts` enforces it). Colours come from
  `src/theme/tokens.ts`; square corners; coral for errors only; contrast
  at least 4.5:1; exports always light.
- New inputs must load from old stored data (missing field = default) and
  be covered by a test that does so.
- Under the default settings (minimum stability Auto, layer pattern Auto)
  `optimize` must return exactly what it returns on `main` today.
- Commit per task with a conventional message ending in the two trailer
  lines used throughout this repository's recent history; push the branch.
  Never commit `.superpowers/` or `dist/`. Do not open a pull request.
- Report rulings: any place the spec was silent and a choice was made.

## Task 1: Documents (mixed pallets withdrawn)

- Round 4 spec section 11: mark "Withdrawn 2026-11-12, see the Round 5
  design".
- `docs/assumptions-and-limitations.md`: remove the stage 2 mentions (the
  "One carton size per layout" limitation stays; remove "Mixed pallets
  (stage 2)" from the later-round list).

## Task 2: Minimum stability (spec section 4)

- `src/domain/types.ts`: `export type MinStability = 'auto' | 'fair' |
  'good'`; `Inputs.minStability`, `InputsDraft.minStability`,
  `Preset.minStability`; `OptimizeResult.belowMinimum?: boolean`,
  `OptimizeResult.autoBestProducts?: number`. Schemas in
  `src/domain/schemas.ts` and `resultSchemas.ts` default a missing value
  to `'auto'`.
- `src/engine/ranking/rank.ts`: with a minimum, walk groups of equal
  products from the most down, running the existing `prepare` hook
  (interlock + assess) on each, keep layouts whose rating meets the
  minimum, stop when the list is full or `shouldStop` fires (then
  `truncated`). None qualify: return those with the best rating found,
  most products first, `belowMinimum: true`. Set `autoBestProducts` when
  the unfiltered top holds more than the filtered top.
- UI: a `MinStabilityControl` in the Full-view inputs panel (segmented,
  like `UnitControl`); Basic view line when not Auto; card line "Auto
  would give N more boxes"; status message and per-row "Below your
  minimum" mark for the `belowMinimum` case; preset form and summary.
- Tests: each setting; nothing qualifies; old data; Auto identical to
  current output over the fixtures and a random property run.

## Task 3: Layer pattern setting (spec section 5)

- Types: `export type LayerPatternPref = 'auto' | 'preferPinwheel' |
  'pinwheelOnly'`; `Inputs.layerPattern` (+ draft, preset, schemas,
  default `'auto'`); `OptimizeResult.patternFallback?: boolean` (Pinwheel
  only found no pinwheel and the Auto result is shown).
- `src/engine/packing/pinwheel.ts` / `stacking.ts`: the count a pinwheel
  must beat becomes a parameter: Auto = more than straight cuts (today),
  Prefer = at least the straight-cut count, Only = at least 1. Under
  Prefer and Only the straight-cut alternative is still built for Prefer
  (it is listed below) and dropped for Only. A layer counts as pinwheel
  only when its `kind` is `'pinwheel'`.
- Ranking: under Prefer the comparison is products, then pinwheel before
  not, then rating, then score. A layout "is pinwheel" when any layer is.
- Allowance: raise `PINWHEEL_WORK_PER_OPTIMIZE` for Prefer/Only (measure;
  stay inside the 4 s budget on the fixtures and the e2e cases) and set
  `truncated` when it is spent under those settings.
- Only with no pinwheel anywhere: rerun as Auto, `patternFallback: true`.
  `autoBestProducts` is also set here when Auto would give more.
- UI: `LayerPatternControl` beside the minimum stability control; Basic
  line; fallback status message; preset form and summary.
- Tests as spec section 9, including the overlap verifier on every kept
  pinwheel and Auto unchanged.

## Task 4: Manual engine (spec sections 6.1, 6.2a rules, 6.3, 6.6, 7)

New folder `src/engine/manual/`, all pure:

- `carton.ts`: `designCarton(counts, facing, inputs): CartonCandidate`
  through the existing carton-size function; `facingsFor(product)`
  (merged duplicates); `cartonFlags(carton, sideDown, inputs)` giving
  over-maximum (which sides, by how much), cannot-fit-footprint,
  over-height.
- `layer.ts`: a manual layer is a `LayerPattern` with `kind: 'manual'`
  (extend `LayerPatternKind`) and one `cols:1, rows:1` block per carton.
  `fromPattern(pattern)` explodes any pattern into single-carton blocks;
  `canPlace`, `moveCarton`, `turnCarton`, `addCarton` (first free spot,
  scanning front-left, candidate positions from footprint and carton
  edges), `removeCarton`, `snap(position, others, footprint, pallet,
  threshold = 0.5)`. Overlap uses the existing tolerance.
- `build.ts`: `buildManualLayout(spec, inputs): ManualBuild` =
  `{ layout: Layout, flags: ManualFlag[], status: 'current' |
  'outOfDate' }`; stacks to the height limit, trims for weight with the
  existing `trimToWeight` (keeping one layer and flagging when one layer
  is over), turns alternate layers with `turnBlocks` when asked, assesses
  stability with `assessStability`. `ManualLayoutSpec = { id, name,
  carton design (counts, facing, sideDown), cartons: {x, y, rotated}[],
  upperLayers: 'same' | 'alternate', madeFor: the inputs that fix the
  carton (product, wallThickness, leeway) }`. Out of date when a rebuilt
  carton's outer size differs from the stored one.
- `bestLayerFor(carton, sideDown, inputs)`: the existing layer search with
  the layer pattern setting applied.
- Audit and fix code that assumes blocks lie inside the footprint or that
  `kind` is grid or pinwheel (stability support share, unused space,
  bounds, signatures, scene geometry, build sheet drawings); add tests
  with overhanging and negative positions.
- Property tests as spec section 9; in particular a manual copy of a
  calculated layout reports the same products, weight and rating.

## Task 5: Stores and storage (spec 6.4 data, 6.5, 6.6)

- `STORAGE_KEYS.manualLayouts = 'pc.manualLayouts.v1'`, Zod schema,
  repository use as for presets; unreadable entries dropped.
- `manualLayoutsStore`: list, save, saveAsNew, rename, duplicate, delete;
  derived builds recomputed when inputs change (synchronous; this is one
  layout, not a search). Layout ids prefixed `manual:`.
- `Scenario.manualLayouts?` saved and restored.
- `resultsStore` / selection: a manual layout can be the selected layout
  so the scene, analytics and exports read it through the same selector
  (`selectSelected` returns a `RankedLayout`-shaped value with a `manual`
  marker; rank and score are not shown for it).
- `manualEditorStore`: session (carton design, working layer, selection,
  step, snapping on/off, upper-layer choice, undo/redo stacks, dirty),
  actions that call the Task 4 functions.

## Task 6: Editor, carton step (spec 6.2a)

- Entry points: "Edit layout by hand" on card and table row (Full view),
  "Design my own carton" in the results header; hidden under 768 px with
  the explanation.
- Editor shell replacing the scene toolbar while open: step tabs, Save,
  Save as new, Cancel (confirm when dirty), name field.
- Carton step: count steppers, facing buttons with small box pictures,
  side-down choice (disabled with Keep cartons upright), calculated
  carton list, live figures, flags; 3D carton drawn open with boxes
  inside (reuse `Products`/`InstancedBoxes`).
- Moving to the layer step after a carton change loads `bestLayerFor`,
  asking first if the layer was hand-edited.

## Task 7: Editor, pallet layer step (spec 6.2b)

- Scene mode: one layer, footprint outline, drag plane at the layer
  height; pointer events (mouse and touch); orbit suspended while a
  carton is dragged; overlap shown in the error colour; return to last
  valid place on release.
- Bar: Add carton, Turn 90°, Remove, Undo, Redo, Reset, Snapping toggle,
  upper-layer choice, live figures and flags; position fields for the
  selected carton in the current unit; arrow keys 0.25 in (Shift 1 in),
  Delete removes; controls at least 44 px.
- e2e drags with Playwright mouse and touch.

## Task 8: Results, analytics, exports (spec 6.4)

- "Your layouts" group above the calculated results with Manual badge,
  flags, difference from the best calculated result, Below-your-minimum
  and Out-of-date states (Discard / Rebuild), Edit / Rename / Duplicate /
  Delete.
- Analytics tab, unused-space overlay, PDF build sheet (heading "Manual
  layout: <name>", flags listed, manual layer drawn, turned layer
  lettered), PNG, CSV, JSON all work for a selected manual layout.

## Task 9: End to end and documents

- e2e per spec section 9; README and
  `docs/assumptions-and-limitations.md` updated (new settings, editor,
  flags, what is not checked).

## After the tasks

Final whole-branch review, one fix wave, scoped re-review, then the
finishing menu, with the rulings listed for the owner.
