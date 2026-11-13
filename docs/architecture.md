# Architecture

A static React 18 + TypeScript (strict) site built with Vite. There is no backend. The calculation engines are plain TypeScript with no React, three.js or browser code, so they can be tested alone. Files under `src/engine/` and `src/domain/` must keep it that way.

## The engines

| Folder | Job |
| --- | --- |
| `src/domain/` | Types (`types.ts`), constants such as the 5 inch pallet and tolerance (`constants.ts`), and Zod schemas that validate inputs and stored data (`schemas.ts`, `resultSchemas.ts`, and `manualSchemas.ts` for stored manual layouts). |
| `src/engine/units/` | Number formatting and unit conversion (`units.ts`): inches to cm or mm, pounds to kg, at the display precision of each unit. Everything else in the engine stays in inches and pounds. Display code reaches these through `src/ui/format.ts`, the only place outside this folder that rounds numbers or writes a unit suffix (`src/ui/formatGuard.test.ts` is the guard test: it fails on a raw `.toFixed(` outside `format.ts` and on hard-coded unit suffixes in JSX or export text). |
| `src/engine/packing/` | `cartons.ts` finds valid carton candidates (and the 8000 cap). When "Desired boxes per carton" is set, it builds candidates straight from the factorizations of that number, so the cap cannot hide a valid carton. If none fits, `nearestAchievableCounts` works out, exactly and without the cap, the nearest counts below and above that do fit; `optimize.ts` returns them with the empty reason `NO_CARTON_WITH_COUNT`. `rotation.ts` applies the rotation rules. `layerSearch.ts` finds the best guillotine layer on a rectangle. `pinwheel.ts` finds the best four-block pinwheel layer (checked against the same rectangle, with a shared work allowance that `optimize.ts` hands out and a stop flag, so it can end early). It also holds the strict search used by the Layer pattern settings (`strict`: only a true pinwheel, one that no straight line right across the layer misses, tested by `hasThroughCut`), which is complete and bounded by time, not by work. `interlock.ts` turns alternate identical layers half a turn (180°) when that moves the seams and keeps every layer at least 90% supported. `weightLimit.ts` holds the weight-limit rules: whether a limit applies, the most cartons that fit under it, and an upper bound on boxes used to keep the carton cap (8000) weight-aware. `stacking.ts` picks how many layers of each type fit the height and builds layouts. `positions.ts` turns a layout into carton and product positions. `metrics.ts`, `geometry.ts` and `tolerance.ts` hold shared maths. |
| `src/engine/ranking/` | `score.ts` (the 60/25/15 score, and the ranking order: `compareRanked`, or `comparePinwheelFirst` under Prefer pinwheel), `rank.ts` (ordering, top 5, removal of look-alikes; `rankWithMinimum` for a minimum stability), `explain.ts` (the sentence comparing neighbours). |
| `src/engine/manual/` | Layouts built by hand. `carton.ts`: a carton from box counts, a facing and the side that is down (`designCarton` goes through the same `cartonOfCounts` as the search, so sizes cannot differ), and its flags. `layer.ts`: the one layer as a list of cartons, with the placement rules (overlap test, move, turn, first free spot, snapping, overhang). `build.ts`: stacks the layer, trims it to the weight, turns alternate layers, rates it and returns the layout with its flags and whether it is out of date. See "Manual layouts" below. |
| `src/engine/analytics/` | `analytics.ts`: all the numbers shown in the details panel, the summary bar and exports. `weight.ts` (totals, per carton and layer, centre of mass, layers removed, room for more cartons), `stability.ts` (the four checks and the rating, plus two rules for manual layouts only: stack height by free-standing group of the bottom layer, and a fifth check of how much of each bottom carton rests on the pallet; thresholds come from `src/domain/stabilityThresholds.ts`, the one place to change them) and `unusedSpace.ts` (headroom and per-layer gaps by rectangle difference; the 3D overlay reads it). `stack.ts`: groups a layout's layers into patterns and runs of identical layers ("Layers 2-7"). The "What to build" card and the build sheet both use it, so they always agree. |
| `src/engine/optimize.ts` | Ties the above together, applies the 4 second limit, and applies the two settings: the layer pattern while layouts are built, the minimum stability when they are ranked. |

### Pipeline order

1. Find carton candidates (`cartons.ts`); with a weight limit the 8000-candidate cap keeps those that could carry the most boxes within the weight.
2. Build layouts: best layer per carton and vertical axis (straight-cut or pinwheel), then stack layers to the height limit (`stacking.ts`).
3. Trim whole layers from the top when a maximum weight applies; drop layouts where not even one layer fits. If nothing survives, the empty reason is `OVER_WEIGHT`, or `WEIGHT_SEARCH_LIMITED` when the search was stopped before that could be proven.
4. Rank (`rank.ts`). Inside ranking, for each group of layouts with equal box counts, interlocking and the stability rating are applied (through a `prepare` hook), and the rating breaks ties before the score. Box counts are never changed by either step.
5. Analytics, the card, exports and the 3D scene read the ranked layouts. A turned layer has its own pattern, so it gets its own drawing on the build sheet.

The two settings fit into these steps as follows.

- **Layer pattern** (step 2). Auto passes no preference and builds exactly what it always built. Prefer pinwheel builds Auto's layouts and, through `preferredPinwheel` in `stacking.ts`, also those with a true pinwheel that holds at least as many cartons as the straight-cut layer; the comparator then puts pinwheel layouts first among equal box counts. Pinwheel only builds Auto's layouts as well (to know what Auto would put first and to have a fallback) and lists a second set built from pinwheel layers alone. A best layer that is already a pinwheel is used as Auto lays it. These further searches share `PINWHEEL_EXTRA_TIME_SHARE` of the time budget (in `pinwheel.ts`); when one is cut short the result is `truncated`. Auto's own searches keep the counted work allowance, so Auto's results do not depend on the machine.
- **Minimum stability** (step 4). `rankWithMinimum` prepares and rates groups of equal box counts from the most boxes down until the list is full, and ranks only the layouts that meet the minimum. The walk stops at the time budget but always gets `MIN_RATING_WALK_MS`; stopped early, the result is `truncated`. During the search, a carton is only skipped as beaten by layouts that meet the minimum.
- **What the result says.** `OptimizeResult` carries `belowMinimum` (nothing met the minimum; the best-rated layouts are listed), `autoBestProducts` (what both settings on Auto would put first, when the first layout listed holds fewer), `patternFallback` (Pinwheel only found nothing to list; Auto's layouts are shown) and `pinwheelOverWeight` (the fallback is due to the maximum weight). `src/ui/resultNotes.ts` turns these into the sentences shown on screen, in the CSV and on the build sheet; the wording is in `src/ui/minStability.ts` and `src/ui/layerPattern.ts`.

Every product belongs to a carton, and every carton belongs to a layout. Positions are worked out on demand from the layout, never stored separately.

## Data flow

```
inputs store -> validation (Zod) -> worker -> ranking -> results store -> screen and 3D
```

1. `src/store/inputsStore.ts` holds what the user typed as text and parses it with the Zod schema. Errors show beside the field. **Units at the edge:** the store keeps, for each numeric field, the typed text and the unit it was typed in (`src/store/unitFields.ts`). It is converted to inches and pounds only when parsed. **Field rule:** on a unit switch a field typed in the new unit gets its exact text back; text the store itself wrote is the exact inch or pound text and is rounded only when shown in cm or mm; a field that does not parse is left as typed. The engine, presets, scenarios and saved results stay in inches and pounds, and a unit switch triggers no calculation.
2. `src/ui/useAutoOptimize.ts` waits 300 ms after the last edit, then asks the results store for a calculation.
3. `src/worker/optimizerClient.ts` sends the validated inputs to `optimizer.worker.ts`, a web worker, so the page never freezes. A newer request cancels the older one: the worker still running it is stopped and a fresh worker takes the new request, so one slow calculation never delays the next. Late answers are discarded, and a cancelled run is never shown as an error.
4. The worker runs `optimize.ts` (packing, then ranking) and returns the ranked layouts.
5. `src/store/resultsStore.ts` keeps the result and the selection: `selectedIndex` for a calculated layout and `selectedManualId` for a manual one (selecting one clears the other). The comparison table reads the result from it. Everything that shows or exports "the selected layout" reads the unified selection described under "Manual layouts".

While inputs are invalid, the last good result stays on screen, marked out of date. A worker failure shows an error banner with Retry.

## Two coordinate frames

- **Engine frame:** x along the pallet length, y along the pallet width, z up. The origin is the minimum corner of the usable footprint. z = 0 is the top surface of the pallet.
- **three.js frame:** 1 unit = 1 inch, Y up. Only `src/scene/transforms.ts` converts between them: scene X = x - usableLength/2, scene Z = y - usableWidth/2, scene Y = z + 5.

Keep all conversion in that one file.

## Manual layouts

A manual layout is stored as what the user chose and nothing that is worked out (`ManualLayoutSpec` in `src/engine/manual/build.ts`): an id, a name, the carton design, the cartons of the one layer, the upper-layer choice, and `madeFor` (the product, wall thickness and leeway it was made under, with the carton's outer size then). `buildManualLayout(spec, inputs)` turns that into an ordinary `Layout` under the current inputs, so the 3D view, analytics, unused space, weight and the build sheet need no second code path.

- **Data model.** The layer is the existing layer type with `kind: 'manual'`: one block of one carton (`cols: 1, rows: 1`) per carton. Positions may be negative or beyond the footprint where a carton overhangs. A manual layout's id is `manual:` plus the spec's id, so it cannot collide with a calculated layout's.
- **Frames.** The layer functions in `layer.ts` work in the frame of the usable footprint (origin at its minimum corner). Stored positions are in the **pallet frame**: measured from the pallet's own minimum corner, marked `frame: 'pallet'` on the spec. `palletToUsable` and `usableToPallet` in `build.ts` convert by half the overhang, so a change of overhang or pallet size leaves the cartons where they are on the pallet.
- **Migration.** Layouts stored before the pallet frame have no `frame` and hold footprint-frame positions. `manualLayoutsStore` rewrites them with `toPalletFrame` the first time it has valid inputs (using the overhang then in force), and `addFromScenario` does the same with the scenario's own overhang. The storage key did not change.
- **Out of date.** `isOutOfDate` rebuilds the carton from the current product, wall thickness and leeway and compares its outer size with `madeFor.outer`. An out-of-date layout is built with the stored product, wall thickness and leeway, so it is shown as it was made; `ManualBuild.inputs` holds the inputs it was really built with, and everything that draws or measures it must use those.
- **Flags.** `ManualFlag` in `build.ts` is the list of broken limits with their numbers; `canSave` says which stop a save. **The wording of every flag is in `src/ui/manualFlags.ts`** (`flagText`, `flagLines`, `cannotSaveText`, `cartonBlockedText`), used by the editor, "Your layouts", the card, the CSV and the build sheet. The refusals of layer actions are worded in `src/ui/editor/layerActions.ts` (`LAYER_MESSAGES`), which also holds the key handling and the nudge steps.
- **Stability.** `stability.ts` applies its two extra rules when the layers are of kind `manual`.

### The two stores

- `src/store/manualLayoutsStore.ts` holds the saved specs (through a `Repository`, key `pc.manualLayouts.v1`) and, for the last valid inputs, an entry per layout: the spec, its `ManualBuild`, and a `ManualRanked` (the shape of a ranked layout, with rank 0, zero scores and a `manual` marker that says not to show them). Builds are quick, so they are redone at once when the inputs or the list change, and an entry keeps its objects while nothing about it changed. It also saves, renames, duplicates, deletes and merges a scenario's layouts (`addFromScenario` only ever adds).
- `src/store/manualEditorStore.ts` holds one editing session: the design, the working layer (kept in the pallet frame, handed out in the footprint frame), the selection, the undo and redo stacks (`HISTORY_LIMIT` steps) and, published as `session`, everything the screen needs under the current inputs (carton, figures, flags, the built layout, whether it can be saved). It contains no geometry rules and no text: it calls the manual engine, and a refused action returns a typed reason (`EditorRefusal`) for the screen to word. It follows the inputs as they change and steps back to the Carton step when the carton no longer fits the layer.
- `src/store/manualStores.ts` joins the two to the inputs and results stores: valid inputs are fed to the layouts store, a saved layout becomes the selected one, and when the selected layout is deleted (here or in another tab) the first calculated layout is selected.

### The unified selection

`src/store/selection.ts` is the one place that answers "which layout is selected". `selectSelectedLayout` returns the selected manual layout when there is one, else the selected calculated layout, as a `SelectedLayout`: the ranked layout, **the inputs it must be drawn and measured with**, and whether it is stale. `selectExportSource` gives the same to the exports; a manual layout goes as a result of that one layout, with its marker. Components use the `useSelectedLayout` hook (`src/ui/useSelectedLayout.ts`). Code that shows a rank, a score or an explanation must test `ranked.manual` first.

### The editor on screen

- `src/ui/editor/` holds the editor: `EditorBar` (step tabs, name, undo, save, cancel), `EditorPanel` with `CartonStep` and `LayerStep` beside the view, `LayerTools`, `CartonList`, `SelectedCarton` and the entry rules (`useEditorEntry.ts`: the 768 px minimum and the reasons a way in is closed). `steps.tsx` lists what each step is made of. `src/ui/YourLayouts.tsx` is the list of saved layouts.
- **A second canvas.** `src/scene/EditorScene.tsx` is the editor's 3D view, with its own `Canvas`, drawn over the normal scene by `PalletScene.tsx`. The normal scene stays mounted underneath, hidden and inert, and still shows the selected layout. Exports are switched off while editing because that hidden view is not the size the capture expects. `EditorLayer.tsx` draws the layer step and handles dragging with pointer events (mouse and touch alike): a press on a carton is captured before the orbit controls see it, the drag runs on a horizontal plane at the height the carton was grabbed, the session's `previewMove` says where it would land, and only the drop changes the session, so one drag is one undo step. `editorGeometry.ts` holds the pure geometry for both steps.
- `App.tsx` swaps the details panel for the editor panel while a session is open, and covers the editor (`EditorBlocked`) when the window is too narrow or the view is Basic.

## Presets, scenarios and storage

- `src/persistence/repository.ts` defines a small `Repository` interface (`list`, `save`, `remove`) and a memory version used when browser storage is unavailable.
- `src/persistence/localStorageRepository.ts` is the Local Storage version. Each key holds `{ version: 1, items }`. Keys are in `keys.ts`: `pc.presets.v1`, `pc.scenarios.v1`, `pc.inputs.v1`, `pc.prefs.v1` and `pc.manualLayouts.v1`.
- Everything read back is checked with Zod. Bad entries are skipped and a notice is shown ("... It will be backed up before anything is overwritten."). Before overwriting unreadable data, the raw text is copied to `<key>.backup`; if that copy cannot be written, the key is not overwritten and the change stays in memory.
- Every save or delete re-reads the key and applies the change to what is stored, so two tabs keep each other's items. The presets and scenarios stores also refresh on the window `storage` event.
- `src/store/presetsStore.ts` and `scenariosStore.ts` use a repository; sample presets come from `src/data/samplePresets.ts`. The manual layouts store uses one too, created with `discardFailed`: a change that could not be written is dropped rather than kept in memory, so the editor can say plainly that nothing was saved.
- The minimum stability and layer pattern are part of the inputs and of a preset's fields; the schemas default both to `auto`, which is how older stored data reads.
- A scenario may carry `manualLayouts` (the specs present when it was saved). They are read with a list schema that drops an unreadable entry on its own, so one damaged layout never loses the scenario.

### Adding a storage backend

Write an object that implements `Repository<T>` (for example one that calls a REST API), validate what it returns with the same Zod schemas, and pass it where the stores are created instead of the Local Storage one. The stores do not know which backend they use.

## Preferences, theme and views

- `src/store/prefsStore.ts` holds the view mode (`basic` or `full`, default `basic`) and the theme (`harbor` or `light`, default `harbor`). It saves to Local Storage under `pc.prefs.v1`, checks what it reads with Zod, and quietly falls back to the defaults if the value is unreadable or storage fails.
- Old saved values are migrated when read: `dark` and `system` become `harbor`, `light` stays `light`, and anything else becomes `harbor`. The storage key stays `pc.prefs.v1`.
- Theme boot script: a small inline script in `index.html` reads `pc.prefs.v1` and sets the `harbor` class on `<html>` before the first paint (unless the saved theme is `light`), so there is no flash of the wrong theme. `src/ui/useTheme.ts` keeps the class in step afterwards. The page does not follow the computer's light or dark setting.
- Colours: `src/theme/tokens.ts` is the single source of the Harbor colours. `tailwind.config.js` reads it and exposes them as `harbor-*` colours. Components use the `dark:` variants, which are pointed at the `harbor` class, so `dark:bg-harbor-panel` means "panel colour in Harbor". The 3D scene colours are in `src/scene/sceneTheme.ts`. Exports ignore the theme and ask for the light scene colours.
- Shared classes in `src/index.css` carry the identity, and components use them instead of restyling: `.heading` (Exo 2 Light capitals), `.bracket` (the top-and-side frame with a corner tick), `.root-divider` (the faint line with one fork between major sections) and `.focus-ticks` (four corner fragments for keyboard focus; `.focus-ticks-within` is for a wrapper around a select or plain input). Ticks sit 2 px inside tabs, menu items and table rows, because their scrolling parents would cut off ticks drawn outside.
- Where the numbers live: stability thresholds in `src/domain/stabilityThresholds.ts`; the weight tolerance and weight-limit rules in `src/engine/packing/weightLimit.ts`; display precision per unit in `src/engine/units/units.ts`; the time limits in `src/engine/optimize.ts` and the pinwheel allowances in `src/engine/packing/pinwheel.ts`; the snap distance (`SNAP_THRESHOLD`) in `src/engine/manual/layer.ts`; the nudge steps in `src/ui/editor/layerActions.ts`; the largest box count (`MAX_COUNT`) in `src/ui/editor/CountStepper.tsx`; the undo limit in `src/store/manualEditorStore.ts`; the editor's minimum width in `src/ui/editor/useEditorEntry.ts`.
- Mascot: `src/ui/Mascot.tsx` shows one pose (`header`, `idle`, `working`, `concerned`) as a hidden image at a whole-number scale. `src/ui/SproutProgress.tsx` is the sprout line shown beside "Calculating". The PNG sprites are in `src/assets/mascot/`. They are generated from the pixel maps in `tools/mascot/poses.mjs` by `npm run mascot` (`tools/mascot/build.mjs`). To change a pixel (the helmet included), edit `poses.mjs` and run `npm run mascot` again; the generated files are byte-for-byte reproducible.
- Fonts: bundled font packages, only the weights in use, imported in the app entry. Nothing is fetched from another site.
- In Harbor the 3D floor grid uses fixed pre-blended colours (`#395265` for cells, `#526A7A` for sections) because the grid component has no opacity setting.
- `App.tsx` picks the Basic or Full arrangement from the view mode. Switching only changes what is drawn. It never calls the optimizer.

## Build sheet (PDF)

- `src/export/buildSheet.ts` is a pure function that turns the selected layout (calculated or manual, as `selectExportSource` gives it), the inputs it came from, its analytics, the job name, the out-of-date flag and a date into a content model (pages, tables, drawings as plain data). For a manual layout the model carries a heading and the flags, and a layer of kind `manual` is drawn carton by carton with no block labels. No drawing happens there, and every number comes from the existing analytics and position functions.
- `src/export/buildSheetPdf.ts` draws that model with jsPDF (US Letter, vector drawings, real text). It is loaded on demand, so jsPDF lives in its own lazy chunk, as three.js does in the scene chunk. Neither is in the initial page load. The dependency `jspdf` needs no change to how the site is built or deployed.
- `src/ui/BuildSheetDialog.tsx` asks for the job name, and `ExportMenu.tsx` starts the export.

## Adding a layer pattern generator (Round 2)

Layers are built in `src/engine/packing/stacking.ts` (`bestLayer`, `plainLayers`, `buildLayouts`). A layer is a list of blocks (origin, rows, columns, flat rotation). To add a pattern like the pinwheel (`pinwheel.ts` is the worked example):

1. Write a function with the same shape as `searchLayer` in `layerSearch.ts`: given a rectangle and a carton footprint, return blocks and a carton count.
2. Call it from `bestLayer` and keep whichever result holds more cartons.
3. Extend the block type in `src/domain/types.ts` and its schema if the pattern needs a new kind of block.
4. `positions.ts` turns blocks into positions. Teach it any new block kind.
5. Add tests: no overlaps, everything inside the envelope, and a hand-counted example.

## Tests

- Unit tests sit next to the code as `*.test.ts` / `*.test.tsx` and run with `npm test` (Vitest). They cover engines, stores, persistence, export and UI components.
- `src/engine/packing/testSupport.ts` holds shared helpers such as brute-force checks.
- The end-to-end tests are in `e2e/` (Playwright, `npm run e2e`). `editor.spec.ts` covers the manual editor (designing a carton, the pallet layer step with the mouse, with a finger and with the keys, the 768 px rule). `manualLayouts.spec.ts` covers a manual layout in the results: the list, selection, exports, re-check and out of date, a scenario and a reload. The rest are in `workspace.spec.ts`, which also has tests for the minimum stability and the layer pattern setting. It has separate tests for: switching units (the field converts, the total is unchanged, no "Out of date", the typed text returns), a weight-limited load (total at or under the maximum), an over-weight maximum (the nothing-fits message), a pinwheel load (the "Pinwheel" badge), a stability rating on the card, the unused-space overlay exported to PNG, the header mascot, and the header fitting one row at 1100 px in millimetres. The main test starts in Basic view (the "What to build" card, the boxes-per-carton field with 6, 7 and blank), saves a build sheet and checks the PDF, checks the default is Harbor, switches to Light and checks it survives a reload, then switches to Full view, enters a worked example, checks the numbers, selects a row, exports PNG, JSON and CSV, reloads, checks a validation message, and fails on any console error. A second test seeds a saved `dark` preference and checks the page opens in Harbor.
- `src/theme/tokens.test.ts` loops over every allowed text pairing in the tokens and checks it against 4.5:1; `src/theme/contrast.test.ts` holds spot checks. `src/theme/leftovers.test.ts` scans the source and fails on `rounded-`, `shadow-` or old dark-theme colour classes. `tools/mascot/build.test.ts` and `src/ui/Mascot.test.tsx` check the sprites (grid, five colours, opaque or transparent pixels) and where each pose appears.
