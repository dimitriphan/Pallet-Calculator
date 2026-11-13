# Pallet Calculator, Round 4: helmet, units, weight, pinwheel, stability, unused space

Date: 2026-11-10
Status: awaiting owner review

## 1. Purpose

The tool is used by its owner and their warehouse staff for real packing
decisions. Round 4 adds six things to the live tool. A correct number still
outranks everything else: no change here may alter an existing answer except
where this document says so (pinwheel layers, weight limit, stability
tie-break).

Round 4 is **stage 1 of 2**. Stage 2, mixed pallets, has its own spec later
(section 11 records what was agreed so stage 1 does not block it).

## 2. Decisions made by the owner

| Topic | Decision |
|---|---|
| Helmet | Every pose wears it, including header mark, favicon and build-sheet picture |
| Weight | Limit and report: weight per product box and a maximum pallet weight; never exceed the limit |
| Stability | Warn, and break ties. Most boxes still wins |
| Units | in, cm, mm. Switching converts every value. Weights follow (lb with in; kg with cm or mm) |
| Mixed pallets | Second stage, own spec |

## 3. Helmet

- A hard hat sits on top of the ring head: a domed shell with a short brim
  one pixel wider than the head on each side.
- Two new mascot-only colours: helmet yellow `#E8B93C`, helmet shade
  `#B98A22`. They follow the existing mascot rules: never used on any
  interface surface, light from the upper left, no outline.
- The stem passes through the top of the shell, so both leaf tips remain
  visible above the helmet in every pose. The eyes and the ring opening are
  not covered.
- Applied to every pose in `tools/mascot/poses.mjs`: header mark, tab icon,
  idle, working (3 frames), concerned, and the print picture's source.
  (Poses: header mark, tab icon, idle, working ×3, concerned, print. There is
  no "pleased" pose.) Sprites are regenerated with `npm run mascot`; generated files stay
  byte-reproducible.
- Sprites may grow taller. On-screen sizes are unchanged (64 px status,
  96 px empty state, header 2× cropped, 0.55 in on the build sheet); crop
  boxes are adjusted so nothing is clipped. The header mark is 24 px wide instead of 20 (the brim
  needs the width), which moves the title 4 px to the right.
- The tab icon must still read at 16 px; if the full helmet does not, the
  icon shows the helmet shell and leaf tips only.
- The owner reviews a contact sheet of the new sprites before merge.

## 4. Units

### 4.1 Behaviour

- A **Units** select in the header, beside Theme: `in`, `cm`, `mm`. Default
  `in`. Stored in `pc.prefs.v1` as `unit`; a missing or unknown value means
  `in`.
- Weight unit is derived: `lb` with `in`, `kg` with `cm` or `mm`.
- Switching converts everything displayed: input fields, unit suffixes, the
  pallet notice, summary tiles, the "What to build" card, comparison table,
  analytics, 3D measurements and labels, presets, scenarios, CSV, PNG labels
  and the PDF build sheet.
- The load never changes when the unit changes. No recalculation is
  triggered by a unit switch, and results are not marked out of date.

### 4.2 How values are kept

- The engine, stores, presets, scenarios and saved data stay in **inches and
  pounds**. Nothing in `src/engine` changes for units.
- The inputs store keeps, for each numeric field, the text the user typed
  **and the unit it was typed in**. A field is converted to inches only when
  parsed. On a unit switch, each field's text is rewritten from its parsed
  inch value; a field that does not parse is left as typed. Text the store
  itself writes (for example a preset loaded) is the exact inch or pound text
  and is rounded only when shown in cm or mm.
- Round-trip rule: switching away and back to the unit a value was typed in
  restores the exact text that was typed, provided the field was not edited
  in between. This prevents drift.
- Display precision: `in` 2 decimals, `cm` 1 decimal, `mm` 0 decimals;
  `lb` 1 decimal, `kg` 1 decimal. Volumes use the cubed unit (in³, cm³,
  cm³ for mm as well, to keep numbers readable) and percentages are
  unit-free.
- Validation limits are defined in inches and shown converted.
- The fixed 5-inch pallet deck and all defaults are converted for display
  (5 in, 12.7 cm, 127 mm).

### 4.3 Saved data

- Presets and scenarios saved before this round are inches and need no
  migration.
- Exports state their unit in headers and column titles.

## 5. Weight

### 5.1 Inputs (all optional; Full view, "Weight" group; the first two also in Basic)

| Field | Default | Meaning |
|---|---|---|
| Weight per product box | blank | One product box |
| Maximum pallet weight | blank | Limit on the whole load, pallet included |
| Empty carton weight | 0 | One empty carton |
| Pallet weight | 40 lb | The pallet itself |

- Blank weight per product box means weight is ignored everywhere and the
  tool behaves exactly as today. A maximum without a box weight shows a
  field message asking for the box weight.
- Weights must be positive (carton and pallet weight may be zero).

### 5.2 Rule

- Total weight = pallet + cartons × (empty carton + boxes per carton × box
  weight).
- When a maximum is set, each candidate layout has whole layers removed from
  the top until its total is at or under the maximum. Layouts are then
  ranked by the boxes that remain, with the usual rules.
- If no layer fits under the limit, the layout is discarded. If none
  survive, the "nothing fits" message appears with the reason "Nothing fits:
  one layer is already over the maximum pallet weight." (`OVER_WEIGHT`). When
  the search was stopped early (very small products) and nothing was found, a
  second reason, `WEIGHT_SEARCH_LIMITED`, says the search was limited instead
  of claiming nothing fits.
- The 8000-candidate carton cap is weight-aware: with a limit, it keeps the
  cartons that could carry the most boxes within the weight.
- Whole layers only. After trimming, the tool reports how many more cartons
  the limit would allow: "Room for N more cartons by weight" (N ≥ 1 only),
  on the "What to build" card and the build sheet. It does not place them.
- The target quantity and exact boxes-per-carton features work on the
  trimmed layouts.

### 5.3 Reported

- Total weight, weight per full carton, weight per layer, and centre-of-mass
  height above the floor (pallet deck included, pallet mass at the middle of
  the deck).
- When a layout was trimmed by weight, the table and card say "Limited by
  weight" with the number of layers removed.
- Weight per carton is shown without judgement; lifting limits are the
  owner's call (see section 10).

## 6. Pinwheel layers

- The layer search gains a pinwheel generator: four rectangular blocks of
  identically oriented cartons arranged rotationally around the layer's
  centre, alternating between the two footprint orientations, leaving a
  central gap. Block sizes are searched over all column and row counts that
  fit the usable footprint (overhang rules as today).
- A pinwheel layer is kept only when it holds **more cartons** than the best
  straight-cut layer for the same carton and vertical axis. With equal
  counts the straight-cut layer wins, because it is easier to build.
- Pinwheel blocks never overlap; this is checked by a test-only overlap
  verifier that runs over every generated layer in the test suite.
- The search stays inside the existing time budget (4 s budget, 6 s hard
  limit); pinwheel searches share one work allowance for the whole
  calculation and can stop early, falling back to straight-cut layers.
  Straight-cut layouts are still offered beside pinwheel ones under a weight
  limit.
- A layout containing a pinwheel layer shows a "Pinwheel" badge in the Layers
  cell of the comparison table (there is no pattern column) and a note on the
  card and build sheet. The 3D view and top-view
  picture draw it from the same block list as today.
- With "Keep cartons upright" on, pinwheels still apply (they only turn
  cartons about the vertical axis).

## 7. Stability

### 7.1 Rating

Each layout gets a rating: **Good**, **Fair** or **Poor**, from four checks.
Each check yields none, a caution, or a serious warning.

| Check | Caution | Serious |
|---|---|---|
| Stack height ÷ shorter side of the load's footprint | above 1.5 | above 2.0 |
| Carton height ÷ carton's shorter base side (as stacked) | above 1.5 | above 2.5 |
| Share of a layer's carton base area resting on cartons below | under 90 % for any layer | under 70 % for any layer |
| Interlocking | identical layers stacked in straight columns, 4 or more layers | — |

- Good: no warnings. Fair: cautions only. Poor: any serious warning.
- Warnings are plain sentences, for example "Stack is tall for its base
  (1.8 times its shorter side)". They appear on the card, in the table
  (a rating column; the sentences themselves are on the card in Basic view
  and in the Analytics tab in Full view), and on the build sheet.
- Thresholds live in one constants file with a comment for each, so the
  owner can ask for them to be changed.
- The rating is advice. The documentation says so, and says crush strength
  is not checked.

### 7.2 Effect on the answer

- Ranking order becomes: total boxes, then stability rating (Good before
  Fair before Poor), then the existing score. Interlocking and the rating
  run inside ranking, per group of equal box counts.
- **Interlocking at no cost:** when a layout stacks identical layers and
  turning alternate layers by 180° about the load's centre changes where
  the seams fall, alternate layers are turned. Box count is unchanged. The
  build sheet lists which layers are turned, and a turned layer gets its own
  pattern letter and drawing there. If the layer is symmetric
  under that turn, nothing changes and the column caution stands.
- Badges: Good uses the existing success style, Fair the caution style,
  Poor the error style (Harbor: green, sand, coral within the existing
  contrast rules; coral remains at most one element where the spec already
  limits it, so a Poor badge uses coral text on panel, not a coral fill).

## 8. Unused-space overlay

- A checkbox **Unused space** in the 3D toolbar (both views), off by
  default, stored in the scene store for the session.
- When on, the scene shows translucent blocks for:
  - headroom: the full footprint from the top of the stack to the height
    limit;
  - per-layer gaps: the parts of the usable footprint not covered by
    cartons in that layer, as rectangles from a rectangle-difference of
    the layer's blocks.
- Fixed colour `#EF4444` at 25 % opacity with a thin edge line, identical
  in both themes. It joins the list of fixed load colours.
- Gaps narrower than 0.25 in are not drawn.
- The analytics tab already reports unused volume; a line is added
  splitting it into headroom and layer gaps, and the two figures must sum
  to the existing total (tested).
- The PNG export includes the overlay only if it is switched on at export
  time. The PDF build sheet never shows it.

## 9. Architecture notes

- **Engine stays pure and in inches/pounds.** New modules:
  `packing/pinwheel.ts`, `analytics/weight.ts`, `analytics/stability.ts`,
  `analytics/unusedSpace.ts`, `packing/interlock.ts`. `Inputs` gains
  `weights: { productBox, maxPallet, emptyCarton, pallet }` (nullable where
  optional). `Layout` gains optional `pattern`, `turnedLayers`, `weight`
  and `stability` data; result schemas are extended with defaults so stored
  scenarios still load.
- **Units at the edge.** One formatting module (`src/ui/format.ts`, backed
  by `engine/units`) is the only place that converts for display; a test
  forbids raw `toFixed` on lengths in `src/ui` and `src/export`.
- **Stage 2 readiness:** weight belongs to the product, stability checks
  take a list of layers of arbitrary cartons, and the overlay works from
  block lists, so none assume one carton size per pallet.

## 10. Not in this round

- Mixed products on one pallet (withdrawn, see section 11).
- Crush strength, load on bottom cartons.
- Partial top layers chosen automatically.
- A maximum weight per carton.
- Separate unit choices per field.

## 11. Stage 2: mixed pallets (withdrawn)

**Withdrawn by the owner on 2026-11-12.** Mixed pallets are no longer
part of the process; see the Round 5 design. The notes below are kept
only as a record.

Agreed with the owner:

- Each product has its own size, weight and required quantity.
- Each product gets its own carton, chosen within a shared maximum carton
  size that can be overridden per product. A carton holds one product.
- A layer holds one carton size. Heavier and larger-footprint layers go to
  the bottom.
- The tool says whether everything fits on one pallet and, if not, how
  many pallets are needed.

## 12. Testing

- Engine: unit tests for every new module, including hand-worked examples
  for weight totals, centre of mass, each stability threshold on both
  sides, a known pinwheel case that beats straight cuts, and the overlap
  verifier across generated layers. Existing expected answers change only
  where a pinwheel adds cartons; each such change is listed in the plan.
- Units: conversion round-trip tests, the "no recalculation on switch"
  rule, exports in each unit.
- UI: component tests for new inputs, messages and badges, in both views.
- End to end (against the built app): unit switch and back, a weight-limited
  load, a pinwheel load, overlay on and exported, helmet sprites served.
- Contrast and leftovers tests keep passing; new badge pairings are added
  to the token pairing list.
- Final whole-branch review looks at the built app in both themes.

## 13. Build order

1. Helmet sprites.
2. Units.
3. Weight.
4. Pinwheel layers.
5. Stability and interlocking.
6. Unused-space overlay.
7. End-to-end test and documentation.
