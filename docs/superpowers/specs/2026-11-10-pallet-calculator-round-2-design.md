# Pallet Calculator Round 2: Design

Date: 2026-11-10
Status: awaiting review
Builds on: `2026-11-10-pallet-calculator-design.md` (Round 1). Everything in
that spec still holds unless this document changes it.

## 1. Purpose

Round 1 gave the owner a correct optimizer with a full analytical screen.
Round 2 makes the result easy to hand to other people:

- a **Basic mode** that shows staff only the answer and what they need to
  build it,
- a **PDF build sheet** for the team stacking the pallet,
- a **dark mode**,
- a **larger 3D view** that fills the space the screen currently wastes, and
- a **desired boxes per carton** input for products with a fixed case pack.

The only optimizer change in this round is the boxes-per-carton filter in
section 8. Ranking and analytics formulas are unchanged.

Success means:

- A person who has never seen the tool opens it, enters three sizes, and can
  read off the carton to use and how to stack it without meeting a score,
  a utilization figure, or a settings field.
- The build sheet, printed, is enough to build the pallet without the screen.
- Every screen and dialog is legible in both themes; exports always print on
  white.
- The 3D view uses all the height the centre column has.
- Entering a boxes-per-carton number yields only cartons holding exactly that
  many, or a clear statement that none fits and which counts do.

## 2. Scope

### In scope

Basic mode, view-mode and theme preferences, dark theme, 3D view sizing,
PDF build sheet, the desired boxes-per-carton input, and the tests and
documentation for them.

### Not in scope (still deferred)

Advanced optimization (weight, stability, pinwheel and interlocked patterns),
unused-space overlays, unit switching, shareable links, company branding on
exports, a target-quantity field in Basic mode.

## 3. Preferences

A new preferences record is kept per browser.

| Preference | Values | Default |
|---|---|---|
| View mode | `basic`, `full` | `basic` |
| Theme | `system`, `light`, `dark` | `system` |

- Stored in Local Storage under `pc.prefs.v1`, validated on read; an
  unreadable value falls back to the defaults without a notice.
- Storage failures are ignored (the preference simply does not persist).
- Both controls live in the header and take effect immediately.

## 4. Basic mode

### 4.1 Header

App name; preset selector (choose only); Export menu with "Build sheet (PDF)"
and "PNG"; the "Basic | Full" switch; the theme control. Hidden in Basic:
preset "Save to preset", "Save as new", "Manage"; Scenarios; JSON and CSV
export.

### 4.2 Inputs

- Pallet limitation, product box, and maximum carton, each with length,
  width, and height, with the same validation and messages as Full view.
- Desired boxes per carton (section 8), below the three sizes.
- The 5-inch pallet notice and the usable stacking height line.
- A read-only line stating the other settings in effect, built from the
  current valid inputs, for example: "Using 0.50 in leeway, 0.25 in carton
  walls, no overhang, fully rotatable. Change in Full view." It also states a
  target quantity when one is set and "cartons kept upright" when that is on.
- Desired box quantity, leeway, wall thickness, overhang, rotation,
  keep-upright, and the Advanced section are not shown. Their values are unchanged and
  still used.
- If one of those hidden fields is invalid (possible only if it was left
  invalid in Full view), the line reads "A setting in Full view needs fixing
  before results can update." and links to Full view.

### 4.3 Results

- The production summary bar (unchanged).
- The 3D view, with a reduced toolbar: Products, Measurements, Reset view.
  The other toggles keep whatever state they have.
- A "What to build" card in place of the details tabs:
  - **Carton:** outer size, inner size, boxes per carton, how boxes sit
    inside ("1 × 1 × 5 along the box's length × width × height").
  - **Stack, from the bottom:** one line per run of identical layers, for
    example "Layer 1: 10 cartons, product length side up" and "Layers 2–7:
    7 cartons each, product width side up".
  - **Finished load:** length × width × height including the pallet.
- Not shown: the layout comparison table, scores and contributions,
  utilization and volume figures, the Explanation and Selection tabs.
  Clicking objects in the 3D view still highlights them but opens no panel.
  When a "nothing fits" or error message is showing, the "What to build" card
  is hidden. A failed calculation that keeps a previous result marks it out of
  date (summary dimmed, "Out of date" badges) until a calculation succeeds.
- Status messages stay: "Calculating…", the out-of-date notice and badges,
  the two "nothing fits" messages, the limited-search note, and the error
  with Retry. In Basic they appear above the "What to build" card.

### 4.4 Which layout is shown

Basic mode shows the selected layout. A new calculation always selects
layout 1, so normally that is the best answer. If a different layout is
selected (chosen in Full view, or restored from a scenario), Basic shows it
with the note "Showing layout N, chosen in Full view. Layout 1 fits X
boxes." and a "Use layout 1" button.

### 4.5 Switching modes

Switching never recalculates and never changes inputs, the selected layout,
presets, or scenarios. It changes only what is displayed.

## 5. Dark mode

- Tailwind class strategy: a `dark` class on the root element, set from the
  theme preference; `system` follows `prefers-color-scheme` live.
- The class is applied before first paint (inline script in `index.html`
  reading `pc.prefs.v1`) so the page does not flash light.
- Every surface is themed: header, summary bar, inputs, notices, tables,
  tabs, badges, menus, dialogs, drawer, focus rings, and the scene toolbar.
  Text contrast meets WCAG AA in both themes.
- 3D view: background, label and measurement chips follow the theme, and so
  does the measurement line colour. The floor grid section colour is the same
  in both themes. Pallet, carton, product, envelope, and selection colours do not
  change, so a load looks the same in either theme.
- Exports ignore the theme: the PNG panels and the PDF are always rendered
  with the light scene background and dark text on white.

## 6. 3D view sizing

- The centre column becomes a vertical flex layout. The 3D view takes all
  remaining height (minimum 320 px); in Full view the comparison table sits
  below it at its natural height. If the window is too short for both, the
  column scrolls and the 3D view stays at its minimum.
- In Basic mode there is no table, so the 3D view fills the column.
- The camera re-fits when the view's aspect ratio changes by more than 10%,
  so the load stays framed after a resize or a mode switch. A user's manual
  orbit is otherwise preserved.

## 7. PDF build sheet

### 7.1 Export

- "Build sheet (PDF)" in the Export menu, in both modes. Disabled with the
  same title as the other items when there is no layout.
- Choosing it opens a small dialog with an optional "Job name" (up to 80
  characters) and "Save PDF" / "Cancel".
- File name `pallet-build-sheet-YYYYMMDD-HHmmss.pdf`.
- Generated in the browser with jsPDF, loaded on demand so it adds nothing
  to the initial page load. Text is real text; diagrams are vector drawings.
- If the 3D view is unavailable, the sheet is still produced without the two
  pictures and says "3D pictures unavailable". A generation failure shows the
  notice "Build sheet could not be created. Try again." and never throws.

### 7.2 Layout

US Letter, portrait, 0.5 in margins, inches throughout, black text on white.

**Page 1, overview**

1. Title "Pallet build sheet", the job name if given, and the local date and
   time. When the selected layout is not layout 1, a line under the date:
   "Layout N of M selected. Layout 1 fits X boxes."
2. If the result is out of date: a boxed line "Out of date: inputs changed
   after this calculation."
3. The five production-summary figures.
4. "Carton": outer size, inner size, boxes per carton, how boxes sit inside.
5. "Pallet and load": pallet size, overhang if any, finished load length ×
   width × height including the pallet.
6. Two pictures side by side: the 3D view as currently framed and the side
   view, both rendered light.

**Page 2 onward, layer plan**

1. One block per distinct layer pattern, in bottom-to-top order of first
   use: a heading ("Pattern A: layers 2–7"), a top-down drawing to scale
   showing the pallet outline, the usable footprint when there is overhang,
   and every carton as an outlined rectangle; beside it, cartons in the
   layer, carton footprint as placed, layer height, and which product side
   faces up. Rotated blocks are visibly distinguishable by their proportions
   and each block is labelled "rows × columns" inside the drawing when it has
   room (the fact reads "Blocks (rows × columns)"). The edge dimensions are the
   pallet's length and width, along the solid pallet outline. With overhang, a
   key under the drawing reads "Solid line: pallet L × W in. Dashed line: limit
   with overhang L' × W' in."
2. A "Stacking order" table, bottom to top: layer number, pattern letter,
   cartons, layer height, height to the top of that layer including the
   pallet.
3. Patterns flow onto further pages as needed; a pattern block is never
   split across pages. A long stacking table continues on further pages, and
   pages 2 onward carry a running header. The overhang row reads "2.00 in
   total, 1.00 in each side".

**Every page footer:** the settings used (leeway, wall thickness, overhang,
rotation, keep-upright), "Layout N of M" and "Page X of Y".

### 7.3 Content model

The sheet's content is produced by a pure function of the selected layout,
the inputs it was computed from, its analytics, the job name, the stale
flag, and a date. Rendering to PDF is a separate step. All numbers come from
the existing analytics and position functions, so the sheet cannot disagree
with the screen.

Two layers share a pattern when they have the same vertical axis and the
same blocks.

## 8. Desired boxes per carton

### 8.1 Input

- A new optional input "Desired boxes per carton", placeholder "Blank = best
  fit", suffix "boxes". Shown in both modes: in Full view in the Packing
  group above "Desired box quantity"; in Basic mode below the three sizes.
- Blank (the default) means the optimizer chooses, exactly as in Round 1.
- Otherwise it must be a whole number of 1 or more; the message for anything
  else is "Enter a whole number of 1 or more".
- It is independent of "Desired box quantity" (the per-pallet target); both
  may be set.

### 8.2 Optimizer rule

When a number N is set, only cartons holding exactly N boxes are candidates.
Every arrangement of N is considered (for N = 6: 1 × 1 × 6, 1 × 2 × 3, and
their turns), subject to the maximum carton dimensions, leeway, walls, and
rotation rules as before. Among those, the optimizer still maximizes boxes
per pallet and returns up to five layouts.

Candidates are produced from the factorizations of N directly, so the
8000-candidate cap in the Round 1 spec cannot hide a valid carton of N.

Scores are computed as before; quantity efficiency is relative to the best
layout among the cartons considered.

### 8.3 When no carton of N fits

- If no arrangement of N boxes fits within the maximum carton dimensions,
  the result is empty with a new reason and the message: "No carton holding
  exactly N boxes fits within the maximum carton dimensions." followed by
  "Counts that do fit: A and B." naming the nearest achievable count below N
  and the nearest above N (only one is named if only one exists; the
  sentence is omitted if no carton fits at all, in which case the existing
  "No carton fits" message is shown instead). The nearest counts are computed
  exactly and are not limited by the 8000-candidate cap.
- If a carton of N fits the maximum but cannot be placed on the pallet, the
  existing "No layout fits" message is shown.

### 8.4 Where it appears

- The production summary's "Boxes per carton" equals N whenever a result
  exists.
- The Basic-mode settings line does not repeat it (the field is visible).
- Presets store it; presets saved before this change load with it blank.
- Scenarios, the inputs remembered between visits, and imported preset files
  saved before this change load with it blank.
- JSON, CSV, and the PDF footer include it ("Desired boxes per carton",
  blank or N; the PDF footer always states it: "Desired boxes per carton: best
  fit." when blank, "Desired boxes per carton: N." when set).
- When only one achievable count exists on either side of N, the "nothing
  fits" message reads "The closest count that fits is X." instead of naming
  two counts.

## 9. Architecture

```
src/
  store/prefsStore.ts          view mode and theme, persisted
  ui/
    ViewModeSwitch.tsx  ThemeControl.tsx  useTheme.ts
    BasicInputs.tsx     SettingsSummary.tsx  WhatToBuildCard.tsx
    BuildSheetDialog.tsx
    settingsSummary.ts         pure: inputs -> sentence
  export/
    buildSheet.ts              pure: content model
    buildSheetPdf.ts           jsPDF rendering (lazy-loaded)
  engine/analytics/stack.ts    pattern grouping and layer runs
  scene/sceneTheme.ts          theme -> scene colours
```

The boxes-per-carton rule lives in `src/engine/packing/cartons.ts` (candidate
generation and `nearestAchievableCounts`) and `src/engine/optimize.ts` (the
new empty reason); `Inputs`, the schemas, presets, and the export
builders gain the field.

`App.tsx` chooses between the Full and Basic arrangements from the view
mode. Existing Full-view components are reused unchanged apart from dark
variants and the centre-column sizing. `stack.ts` (in `src/engine/analytics/`) is shared by
the "What to build" card and the build sheet.

## 10. Error handling

- Corrupt preferences: defaults.
- jsPDF chunk fails to load, or rendering throws: the notice in 7.1; the
  dialog closes; nothing else is affected.
- No layout: PDF and PNG items disabled.
- Hidden invalid setting in Basic mode: the message in 4.2.

## 11. Testing

- **Preferences:** defaults, persistence, corrupt value, storage failure.
- **Pure helpers:** settings sentence for each rotation mode and for target,
  overhang, and keep-upright combinations; stack description for single and
  mixed stacks, including the default winner ("Layer 1: 10 cartons…",
  "Layers 2–7: 7 cartons each…"); build-sheet content for the default winner
  and for a layout with overhang, with every number checked against
  analytics; pattern grouping.
- **Boxes per carton:** validation; with the default example, N = 10 gives
  only 10-box cartons, N = 6 gives only 6-box cartons, N = 7 gives the
  "no carton holding exactly 7" message naming 6 and 8; every factorization
  of N is tried (checked against a brute-force filter of the unrestricted
  candidates on small cases); a product so small that the unrestricted
  candidate cap would apply still finds a carton of N; blank reproduces the
  Round 1 result exactly (260 boxes for the default example); old presets,
  scenarios, and remembered inputs load with the field blank.
- **Basic mode UI:** first render is Basic; hidden things are absent and
  kept things present; the settings line; the non-default-layout note and
  "Use layout 1"; status messages; switching modes does not call the
  optimizer or change selection.
- **Theme:** `system` follows the media query; explicit choices set and
  remove the root class; exports request light rendering.
- **Layout:** the centre column gives the 3D view the remaining height in
  both modes (checked in the browser).
- **End to end:** a fresh visit opens in Basic; switch to Full and back;
  dark mode applies the root class; the PDF downloads, starts with `%PDF`,
  has at least two pages, and its text contains the job name, "Pallet build
  sheet", and the total boxes figure. Existing end-to-end steps switch to
  Full view first.
- **By eye:** screenshots of Basic and Full in both themes at 1440 × 900 and
  1280 × 720; the PDF rendered to images and read page by page.

## 12. Documentation

README and `docs/` are updated for Basic mode, themes, the build sheet, and
boxes per carton;
`docs/assumptions-and-limitations.md` lists what Basic mode hides and that
hidden settings still apply.

## 13. Known limitations (Round 2)

- The build sheet is US Letter, inches, English only, with no company name
  or logo.
- Basic mode cannot edit leeway, walls, overhang, rotation, or target
  quantity.
- Boxes per carton is exact only; "at least" and "at most" are not offered.
- The layer drawings show carton outlines, not individual product boxes.
