# Pallet Calculator, Round 5: stability minimum and manual layouts

Date: 2026-11-12
Status: draft for owner approval

## 1. Purpose

Two additions for the owner's warehouse work, and one removal:

1. **Minimum stability rating.** Stability stays automatic. The user can
   also set a minimum rating, and layouts below it are left out.
2. **Manual carton layout.** The user can take a calculated result and
   rearrange the cartons of a layer by hand in the 3D view, when they have
   a preferred pattern. The tool stacks it, checks it and reports on it
   like any other result.
3. **Mixed pallets are dropped.** They are no longer part of the process
   and are removed from the plans.

Correct numbers still come first: a manual layout is measured by the same
code as a calculated one, and anything that breaks a limit is said plainly.

## 2. Decisions made by the owner

| Question | Decision |
|---|---|
| Mixed pallets | Dropped from the plan |
| What the manual stability choice controls | A minimum rating: Auto, Fair or better, Good only |
| Nothing meets the minimum | Show the most stable layouts found, flagged as below the minimum |
| What is built by hand | One layer; the tool stacks it |
| Where the carton comes from | A calculated result; carton size and boxes per carton stay as calculated |
| Rule breaks | Overlaps are blocked; overhang, height and weight breaks are allowed and flagged |
| How cartons are moved | Dragged in the 3D view with snapping; turned 90° flat; added and removed with buttons |
| Carton orientation | Flat turns only; cartons stay the way up they were calculated |
| Upper layers | Per layout: all identical, or alternate layers turned half a turn |
| Keeping a manual layout | A full result marked "Manual", stored in the browser, printable as a build sheet |
| Inputs change afterwards | Kept and re-checked; marked out of date when its carton no longer applies |
| Devices | Mouse and touch (tablet). Phones can view, not edit |
| How many, and where | Several named manual layouts; the editor and the minimum are in Full view only |

## 3. Mixed pallets removed

- Section 11 of the Round 4 spec ("Stage 2: mixed pallets") is marked
  withdrawn, with a pointer to this document.
- `docs/assumptions-and-limitations.md`: the "stage 2" mentions are removed
  from the limitations and from "Planned for a later round". The limitation
  itself stays: one product and one carton size per pallet.
- No code changes; nothing was built.

## 4. Minimum stability rating

### 4.1 Control

- Full view, in the inputs panel: **Minimum stability** with three choices:
  **Auto** (default), **Fair or better**, **Good only**.
- It is an input like the others: stored with the inputs, saved in
  scenarios and in presets. Old stored data without it reads as Auto.
- Basic view has no control. If a minimum other than Auto is in force (set
  in Full view or by a preset), Basic view shows one line saying so, so a
  filtered answer is never unexplained.

### 4.2 Rule

- **Auto:** exactly today's behaviour. Ranking is total boxes, then rating,
  then score. A Poor layout is still offered when it carries the most.
- **Fair or better / Good only:** layouts rated below the minimum are left
  out. Among the rest, ranking is unchanged (boxes, rating, score). The
  answer may therefore hold fewer boxes than Auto would give; when it
  does, the top card says how many more boxes Auto would give, so the
  cost of the choice is visible.
- Interlocking (turning alternate layers) is still applied before rating,
  as now, so a layout is judged in its most stable form.
- **Nothing meets the minimum:** the tool says "No layout reaches
  <minimum>. Showing the most stable found." and lists the layouts with
  the best rating found (most boxes first), each marked "Below your
  minimum". This is not an empty result.
- The rating thresholds are not changed by this round.

### 4.3 Engine

- Stability is assessed lazily today, one group of equal box counts at a
  time. With a minimum, ranking walks the groups from the most boxes down,
  assessing each, until it has enough qualifying layouts for the list or
  runs out of layouts or time.
- If the time budget ends that walk early, the result is marked limited
  (`truncated`), as the main search already does.
- `OptimizeResult` gains `belowMinimum?: boolean` (true only in the
  "nothing meets the minimum" case) and `autoBestProducts?: number` (the
  top box count before filtering, when it is higher than the filtered top).

## 5. Manual layouts

### 5.1 What a manual layout is

- It is made from a calculated result. It keeps that result's **carton**
  (outer size, boxes per carton, which side is down). Only where the
  cartons sit on the layer, and how many there are, is the user's.
- The user builds **one layer**. Every carton in it has the same height,
  so layers are always flat.
- The tool stacks that layer to as many layers as the height limit allows,
  then removes layers from the top for the maximum pallet weight, exactly
  as for calculated layouts.
- **Upper layers**, chosen per layout: **All the same**, or **Alternate
  layers turned** (every second layer turned half a turn about the centre
  of the usable footprint, as the automatic interlock does). When turning
  would push cartons outside the usable footprint the option still
  applies and the overhang is flagged like any other.
- Several manual layouts can be kept for the same inputs. Each has a name
  (default "Manual 1", "Manual 2", ...; the user can rename it).

### 5.2 The editor

Opened from a result card or table row in Full view: **Edit layout by
hand**. It starts as a copy of that result's bottom layer. The original
result is never changed.

While editing, the 3D view shows the pallet, the usable footprint outline
(pallet plus allowed overhang) and one layer of cartons, with the camera
looking down at an angle and orbit still available. A bar above the view
holds the controls.

- **Move:** drag a carton across the pallet. Dragging a carton never
  orbits the camera; dragging empty space does.
- **Snap:** while dragged, a carton's edges snap to the usable footprint
  edges, the pallet edges and the edges of other cartons when within
  0.5 in. Snapping can be switched off in the bar for free placement.
- **No overlaps:** a carton cannot be dropped overlapping another. While
  it overlaps during a drag it is shown in the error colour, and on
  release it returns to its last valid place.
- **Turn:** select a carton (click or tap), then **Turn 90°**. The turn is
  refused, with a short message, when the turned carton would overlap.
- **Add:** **Add carton** places one in the first free spot found
  (scanning from the front-left corner, in the orientation of the last
  carton touched). If there is no free spot inside the usable footprint,
  the button says so and adds nothing.
- **Remove:** select, then **Remove** (also the Delete key).
- **Fine movement:** arrow keys move the selected carton by 0.25 in (by
  1 in with Shift), so the editor is usable without dragging and exact
  placement is possible.
- **Undo / Redo** for every change in the editing session, and **Reset**
  back to the layer it started from.
- **Live figures** in the bar as the layer changes: cartons in the layer,
  layers, total boxes, total weight (when weights are given), stability
  rating, and any flags from section 5.3.
- **Save** asks for a name and adds the layout to the results.
  **Cancel** discards the session (with a confirmation if anything
  changed). Editing a saved manual layout again saves over it, or
  "Save as new".
- Positions are shown and typed in the current unit; values are stored in
  inches as everywhere else.
- Touch: the same gestures with a finger; controls are at least 44 px.
  The editor is offered at widths of 768 px and above. Below that, saved
  manual layouts can be viewed and printed but not edited, and the button
  says why.

### 5.3 Checks and flags

A manual layout is allowed to break limits other than overlap. Each break
is flagged in the error style on the card, in the table, in the editor
bar and on the build sheet:

| Break | Flag |
|---|---|
| A carton lies outside the usable footprint (pallet plus allowed overhang) | "N cartons overhang the allowed footprint by up to X" |
| The layer is empty | Cannot be saved |
| Even one layer is over the height limit | Cannot arise: the carton came from a result that fits |
| The load is over the maximum weight with one layer | "Over the maximum pallet weight by X" (one layer is kept) |

The stability rating and its warnings are worked out by the existing
checks and shown as for any layout. A manual layout is **not** hidden by
the minimum stability rating: the user built it on purpose. If it rates
below the minimum it is marked "Below your minimum".

### 5.4 In the results

- Manual layouts are listed in their own group, **Your layouts**, above
  the calculated results, each with a "Manual" badge. They are not
  ranked against calculated results, but each shows the difference in
  boxes from the best calculated result ("12 fewer than the best
  calculated layout" or "same as the best").
- Selecting one shows it in the 3D view, the Analytics tab, the
  unused-space overlay and all exports (PDF build sheet, PNG, CSV, JSON)
  exactly as a calculated layout. The build sheet's layer plan draws the
  manual layer, and a turned layer gets its own pattern letter as now.
  The build sheet is headed "Manual layout: <name>".
- Each has **Edit**, **Rename**, **Duplicate** and **Delete**.

### 5.5 Storage

- Manual layouts are stored in the browser under a new key
  (`pc.manualLayouts.v1`), each with its name, the carton, the layer's
  carton positions, the upper-layer choice and the inputs it was made
  for. A saved scenario includes the manual layouts present when it was
  saved.
- Share links do not exist in this app yet (they are on the "later" list),
  so "shared" here means the build sheet PDF and the other exports. When
  share links are built, manual layouts are to be included.

### 5.6 When the inputs change

- The carton of a manual layout depends on the product size, the wall
  thickness and the leeway. If none of those change, the layout is
  **kept and re-checked** against the new pallet, overhang, height and
  weight inputs: the layer count, the totals, the flags and the rating
  are recalculated.
- If the product, wall thickness or leeway change so that its carton no
  longer has the same size, the layout is marked **Out of date**. It is
  still listed, greyed, with the inputs it was made for, and offers
  **Discard** or **Rebuild** (opens the editor on the current best
  result). It is never silently deleted and never shown as if it were
  current.
- Changing a weight changes only the weight figures. A unit switch
  changes nothing but the display.

## 6. Architecture notes

- **Data model.** A manual layer reuses the existing layer type with
  `kind: 'manual'`: one block of one carton (`cols: 1, rows: 1`) per
  carton placed, with its position and `rotated`. Everything that already
  works from blocks (3D view, overlap check, stability, unused space,
  weight, build sheet drawings, exports) then works without a second code
  path. Manual positions may be negative or beyond the pallet where they
  overhang; code that assumed otherwise is fixed and tested.
- **Engine, pure and tested first:** `src/engine/manual/` holds building a
  layout from a manual layer (stack, weight trim, turn alternate layers,
  rate), the placement rules (overlap test with the existing tolerance,
  snapping, first free spot) and the flags. No React, no three.js.
- **Store:** a `manualLayoutsStore` (saved layouts, re-check on input
  change) and an editor session store (working layer, selection, undo
  history).
- **Scene:** the editor is a mode of the existing scene: a drag plane at
  the layer's height turns pointer positions into pallet coordinates;
  camera controls are suspended while a carton is dragged. Pointer events
  cover mouse and touch alike.
- **Layout ids:** manual layouts get ids that cannot collide with
  calculated ones.
- Existing rules hold: display-edge units and the format guard, Harbor
  tokens and contrast, coral for errors only, exports always light.

## 7. Not in this round

- Mixed products or mixed carton sizes on one pallet (withdrawn).
- A different pattern for each layer; free placement of every carton;
  part layers.
- Cartons stood on a different side in the editor.
- Entering a carton size by hand.
- Editing on phones.
- Share links.
- Crush strength, a weight limit per carton, changing the rating
  thresholds.

## 8. Testing

- **Minimum stability:** unit tests for each setting, including "nothing
  meets the minimum", the note of what Auto would give, old data reading
  as Auto, and a property test that Auto gives exactly the results of the
  current main branch.
- **Manual engine:** unit and property tests: no accepted placement ever
  overlaps; snapping lands exactly on edges; the first-free-spot search
  finds a spot whenever one of carton size exists on the snap grid; stacked
  totals, weight trim, turned layers and ratings agree with the existing
  functions for a manual copy of a calculated layer (a manual copy of a
  result must report the same boxes, weight and rating as the result).
- **Flags:** overhang and over-weight flags, out-of-date marking for each
  input that should and should not cause it.
- **Storage:** save, reload, rename, duplicate, delete; scenarios carry
  manual layouts; unreadable stored data is dropped without breaking the
  app.
- **End to end, on the built app:** open the editor from a result, drag a
  carton (mouse and touch), fail to overlap, turn, add, remove, undo,
  save, see it under "Your layouts", print its build sheet, change an
  input and see it re-checked and then out of date; set a minimum
  stability and see the list change.
- **By eye on the built app** at 768, 1100 and 1440 px in light and dark,
  as the earlier rounds required.

## 9. Build order

1. Remove mixed pallets from the documents.
2. Minimum stability: engine, then control and messages.
3. Manual engine: layer model, placement rules, building and checking a
   layout.
4. Stores and storage, including re-check and out of date.
5. The editor in the 3D view.
6. Results list, analytics and exports for manual layouts.
7. End-to-end tests and documentation.
