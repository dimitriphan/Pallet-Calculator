# Assumptions and limitations

This page lists every rule the calculator follows, and what it cannot do. Read it before relying on a result for a real packing decision.

## The rules

**Units and precision.** All sizes are kept in inches inside the tool. The Units menu in the header shows them in inches (2 decimals), centimetres (1 decimal) or millimetres (whole numbers); volumes are in in³, or cm³ for both metric units. Switching units only changes what is shown: the load, the result and saved data never change, and nothing is recalculated. A size you typed comes back exactly as typed when you switch back to the unit you typed it in. The tool keeps full precision inside and rounds only on screen and in exports. A size counts as fitting if it is within 0.000000001 inch of the limit, to absorb computer rounding noise.

**Inputs.** Pallet, product and maximum carton sizes must be above zero. Pallet height must be above 5. Desired quantity is blank or a whole number of at least 1. Leeway, wall thickness and overhang are zero or more. Text, negative numbers and zero sizes are refused with a message next to the field.

**The pallet.**

- The pallet is always 5 inches tall. This cannot be changed.
- Usable stacking height is the height you enter minus 5. A 72 inch limit gives 67 inches.
- Overhang is the total added to each of length and width, split evenly on both sides, so the load is centred. A 2 inch overhang turns 50 x 42 into 52 x 44. Overhang never changes the height.

**Carton size.** For one way of turning the product box, with n boxes along an edge:

- Inner size = n x box size + leeway. Leeway is added once per carton edge, not per box. Boxes sit tight against each other.
- Outer size = inner size + 2 x wall thickness.
- Boxes per carton = boxes along length x width x height.

A carton is allowed when its outer sizes, sorted largest to smallest, are each no bigger than the maximum carton sizes sorted the same way. A 16 x 24 x 18 carton fits a 24 x 18 x 16 maximum, because it is the same carton turned. You never type a carton size. The tool finds it.

**Desired boxes per carton.** Leave it blank and the tool picks the carton. Enter a whole number of 1 or more and only cartons holding exactly that many boxes are tried. Every way of arranging that many boxes is considered (6 boxes can be 1 x 1 x 6, 1 x 2 x 3 and their turns). Among those, the tool still finds the most boxes per pallet. The count is exact: "at least" and "at most" are not offered. It is separate from "Desired box quantity" (the target for the whole pallet); you can set both.

Example with the default inputs: 6 gives 6-box cartons. 7 cannot be built within the maximum carton, so the tool says "No carton holding exactly 7 boxes fits within the maximum carton dimensions. Counts that do fit: 6 and 8." The two counts named are the nearest below and above. When only one side has a count (for example nothing larger fits), the message names that one: "The closest count that fits is X." If a carton of that count fits the maximum but not the pallet, you get the "No layout fits" message instead. If no carton fits at all, you get the "No carton fits" message.

**Which carton wins.** The tool does not just pick the carton with the most boxes inside. It tries every allowed carton on the pallet and favours the one that puts the most product on the pallet. The five layouts may use different cartons.

**Product rotation.** This limits which product edge may point up in the finished load.

- Fully Rotatable: any edge may point up.
- Keep Upright: only the product height may point up.
- No Side Rotation: the height (upright) or the length (stood on end) may point up, never the width.
- Custom: you tick the allowed turns (LWH, LHW, WLH, WHL, HLW, HWL, naming which product edge lies along the carton length, width and height). At least one is required.

A strict product setting also limits how the carton may be turned on the pallet. Keep Upright for the product means cartons are never tipped.

**Carton turning on the pallet.** By default a carton may rest on any face, and different layers may use different faces, within the rotation rule above. With "Keep cartons upright" on, the carton height stays vertical and the carton may only be spun 90 degrees, so every layer has the same height. Inside one layer, cartons may be spun 90 degrees block by block.

**Target quantity.** The tool always finds the maximum. If you enter a target, each layout says Target Met (equal), Target Exceeded (more) or Target Not Achievable (fewer), shows the most that is possible, and shows the cartons and layers needed to reach the target when it can be reached.

**Stability rating.** Every layout is rated Good, Fair or Poor from four checks (a layout placed by hand has two extra rules, below). Each check gives no warning, a caution or a serious warning; a value exactly at a limit gives no warning.

| Check | Caution | Serious |
| --- | --- | --- |
| Stack height (pallet deck not counted) ÷ shorter side of the bottom layer | above 1.5 | above 2.0 |
| Carton height ÷ the carton's shorter base side, as stacked, worst layer | above 1.5 | above 2.5 |
| Share of a layer's carton base resting on cartons of the layer below, worst layer (layers compared as placed, each centred on the pallet) | under 90% | under 70% |
| Four or more identical layers stacked in straight columns | caution | none |

A layout placed by hand (a manual layout) is checked more closely, because its cartons can stand apart and off the pallet. These two rules apply to manual layouts only:

- The stack height check is made on each free-standing group of the bottom layer, and the narrowest group decides. Cartons belong to one group when their facing edges are at most 1 inch apart and run alongside each other; cartons that only face at a corner do not. The warning then reads "A free-standing column of the load is tall for its base (3.8 times its shorter side)."
- A fifth check measures how much of each bottom carton's base rests on the pallet itself (not on the allowed overhang around it), for the worst carton: a caution under 90%, a serious warning under 70%. For example "2 cartons in the bottom layer hang off the pallet; the worst rests only 55% on it."

Because of the fifth check, a manual copy of a calculated layout can be rated lower than the original when overhang is allowed and a carton has under 90% of its base on the pallet.

Good means no warnings, Fair cautions only, Poor any serious warning. The warnings are shown as plain sentences, for example "Stack is tall for its base (1.6 times its shorter side)." The limits live in one file (`src/domain/stabilityThresholds.ts`) and can be changed on request. The rating is advice only: crush strength, load on the bottom cartons, wrapping and strapping are not checked.

**Interlocking.** When identical layers sit on each other, every second layer of the run is turned half a turn (180°) about the centre of the pallet, so its seams fall elsewhere, but only when that really moves cartons and every layer still rests at least 90% on the one below. The box count never changes. The card says which layers to turn ("Turn layers 2, 4, 6 half a turn (180°) so they interlock.") and the Analytics tab lists them. The build sheet draws each turned layer already turned, as its own pattern, and says so on page 1 ("Layers 2, 4, 6 are pattern A turned half a turn (shown as pattern B)."); the 3D view shows them turned too. A layer that looks the same turned is left alone, and the straight-columns caution stands.

**Ranking.** Layouts are ordered by total boxes first, then by stability rating (Good, then Fair, then Poor), then by score, then by fewer cartons. The rating only decides between layouts with the same number of boxes. The two settings below change this: a minimum stability leaves layouts out before they are ordered, and Prefer pinwheel puts pinwheel layouts first among layouts with the same number of boxes. The score is 60% quantity, 25% volume used and 15% space (how few gaps there are inside the load). Quantity is ordered first so that a tidier load can never beat one that carries more boxes. Near-identical layouts (mirror images, the same carton and arrangement, or the same stack with every layer turned 90°, such as 2 × 3 and 3 × 2) are shown once. If fewer than five different layouts exist, you see fewer. If nothing fits, the tool says why.

## Minimum stability

The setting is in Full view, under the inputs. It is an input like the others: it is saved with your inputs, in presets and in scenarios, and data saved before it existed reads as Auto. The rating thresholds themselves are not changed by it.

- **Auto** (the default). Nothing is left out. The layout with the most boxes comes first, whatever its rating, so a Poor layout is still offered when it carries the most.
- **Fair or better.** Layouts rated Poor are left out.
- **Good only.** Layouts rated Fair or Poor are left out.

What follows from a minimum:

- **Layouts are rated in their steadiest form.** Interlocking (turning alternate layers) is applied before a layout is rated, as always.
- **The rest are ranked as usual**, as if the layouts left out had never been found: boxes, then rating, then score. Scores are measured against the best layout that is listed.
- **It can give fewer boxes.** When the first layout listed holds fewer boxes than Auto would put first, the tool says "Auto would give N more boxes." This shows above the comparison table in Full view and on the "What to build" card in Basic view, and is written in the CSV ("Result notes") and on page 1 of the build sheet ("Compared with Auto").
- **Nothing meets the minimum.** The result is not empty. The tool says "No layout reaches Good. Showing the most stable found." (or "Fair") and lists the layouts with the best rating it found, most boxes first, each marked "Below your minimum".
- **A limited search says less.** With a minimum, the tool has to rate layouts further down the list until it has enough to show. That work stops at the 4 second limit, but it is always given at least half a second, even after a search that used the whole 4 seconds. If it is stopped early the result is marked as limited, and the message becomes "No layout reaching Good was found before the search was stopped. Showing the most stable found."
- **Your own layouts are never hidden by it.** A layout you built by hand that rates under the minimum stays listed and is marked "Below your minimum".

## Layer pattern

The setting is in Full view, under the inputs, and is saved like the minimum stability. Data saved before it existed reads as Auto.

- **Auto** (the default). A pinwheel layer is used only where it holds more cartons than straight cuts; straight cuts win a tie.
- **Prefer pinwheel.** Every layout Auto builds is still built, so the answer never holds fewer boxes than Auto's. In addition, where a pinwheel holds at least as many cartons as the straight-cut layer, the pinwheel layout is built too (Auto would keep it only if it held more). Among layouts with the same number of boxes, a layout with a pinwheel layer is listed before one without; then the rating, the score and the carton count decide as usual.
- **Pinwheel only.** Only layouts built from pinwheel layers are listed. For each carton the tool keeps the pinwheel holding the most cartons, even where straight cuts would hold more, so the answer can hold fewer boxes; the tool then says "Auto would give N more boxes." With a maximum pallet weight, a pinwheel with fewer cartons is looked for when the fullest one would be too heavy for even one layer.

**What counts as a pinwheel under these two settings.** Four blocks of cartons, one in each corner of the layer, the blocks in opposite corners laid the same way and the other two turned 90°, and, with the blocks pushed together, **no straight line right across the layer, lengthways or crossways, that misses every carton**. A layer that such a line divides is two groups of cartons side by side, which straight cuts build just as well, so it does not count. A carton with a square footprint has no pinwheel.

**The exception.** A pinwheel that Auto itself chooses, because it holds more cartons than any straight-cut layer, is kept exactly as Auto lays it under every setting. It is not tested against the rule above, and a straight line may divide a strip of it from the rest.

**Fallback messages under Pinwheel only.** When no pinwheel layout can be listed, the layouts Auto gives are shown instead, with one of these:

- "No pinwheel layout exists for these sizes. Showing straight-cut layouts."
- "No pinwheel layout fits under the maximum weight. Showing straight-cut layouts." Pinwheel layouts exist, or may exist in a carton too heavy to load, but none is under the maximum pallet weight.
- "No pinwheel layout was found before the search was stopped. Showing straight-cut layouts." The search was limited, so the tool cannot say that none exists.

**Order of the two settings.** The layer pattern is applied first and the minimum stability after it, to the layouts the layer pattern left. "Auto would give N more boxes" always compares with both settings on Auto.

**When a result is marked limited.** Under Prefer pinwheel and Pinwheel only the tool runs pinwheel searches that Auto does not run. Together they may take up to half of the 4 second limit (2 seconds). If one of them is cut short, or not run because that time is spent, a pinwheel may have been missed and the result is marked "Search was limited to keep it fast; results may not be the best possible." Under Auto nothing changes: its own pinwheel searches keep their fixed work allowance and are not marked (see Limitations).

## Layouts built by hand (manual layouts)

A manual layout is a carton you set and one layer you placed. The tool does the rest with the same code that measures calculated layouts, so the numbers cannot differ in kind.

**What you build.**

- **The carton.** You choose how many boxes lie along the carton's length, width and height (whole numbers from 1 to 99 each), which way the boxes face (all boxes in a carton face the same way; up to six facings, fewer when two sides of the box are equal), and whether the carton stands on its base, its side or its end. The carton's sizes then come from the usual rule (leeway once per edge, walls twice). You cannot type a carton size. The rotation setting limits only the tool's own search: a facing you choose that it would not allow is kept, with a note on the layout. "Keep cartons upright" is respected: the carton then stays on its base.
- **One layer.** You place the cartons of one layer. Every carton in it is the same carton standing the same way up, so the layer is flat.
- **Flat turns only.** In the layer a carton can be turned 90° flat. It cannot be tipped on to another side there; the side that is down is one choice for the whole layout, made at the Carton step.
- **Upper layers.** The tool stacks your layer as many times as the stacking height allows. With "All the same" every layer is your layer. With "Alternate layers turned" every second layer is your layer turned half a turn (180°) about the centre of the allowed footprint, as the automatic interlock does. If the turn leaves every carton where it was, nothing is turned, and the choice is reported as "Alternate layers turned (no effect: the layer is the same after a half turn)" in the editor, the Explanation tab, the CSV and the build sheet. A layer with cartons overhanging has as many overhanging when turned, by the same distance.
- **Weight.** With a maximum pallet weight, whole layers are removed from the top exactly as for calculated layouts. If even one layer is over the maximum, one layer is kept and the excess is flagged.

**Copying a calculated layout.** "Edit by hand" copies the carton and the bottom layer of the layout, carton by carton, where they stand on the pallet. When every layer of the layout repeats its bottom layer (as it is or turned), the copy holds the same boxes and weight. When the layout **mixes layer patterns**, the copy is a stack of its bottom layer only, because a manual layout has one pattern. That can hold fewer boxes. The editor says so on both steps. With the default inputs the best layout holds 260 boxes and its copy 250: "This result mixes layer patterns. Editing by hand starts from its bottom layer: 250 boxes instead of 260."

**What is blocked.** These are refused, and nothing changes:

- **Overlap.** Two cartons may touch but never overlap. A carton dragged on to another is shown in the error colour and, on release, goes back to where it was. A typed position that would overlap is refused.
- **A turn that would overlap**, wherever the turned carton is put ("Cannot turn: it would overlap another carton"). The tool tries the turned carton with each of its corners kept in place, then with its centre kept.
- **A turn that would create an overhang.** A carton inside the allowed footprint is not turned into a place outside it ("No room to turn this carton here. Move it first."). A carton that already overhangs may be turned and still overhang.
- **Adding a carton with no room.** "Add carton" only uses a free place wholly inside the allowed footprint. It looks from the front-left corner, first with the carton lying the way of the last carton you touched, then the other way. If there is none, it says so and adds nothing. It finds a place whenever one exists.
- **A carton that cannot fit.** A carton whose base fits inside the allowed footprint neither way round, or that is taller than the stacking height, cannot go on to the Pallet layer step and cannot be saved. The Carton step says why.
- **An empty layer** cannot be saved.
- **A carton wholly off the pallet.** However a carton is moved (dragged, by the arrow keys, by a typed position), part of it must stay over the allowed footprint. A move that would leave none of it there, or only touching the edge, is refused: "Keep the carton at least partly on the pallet." A layout stored earlier with a carton wholly off still loads, flagged as overhang; that carton can be moved anywhere that is not further off.
- **Letting go outside the view.** A dragged carton released outside the 3D view goes back to where it was: "Drop the carton inside the view."

**What is allowed and flagged.** Each of these is shown in the error style in the editor, in "Your layouts", on the "What to build" card and on the build sheet:

- **Overhang:** "2 cartons overhang the allowed footprint by up to 1.50 in". Cartons may be dragged, nudged or typed to a place outside the allowed footprint (the pallet plus the overhang you allow).
- **Over the maximum carton size:** "Carton is over the maximum carton size by 1.00 in (longest side)". The carton's sides, longest first, are compared with the maximum carton's sides, longest first, as in the search.
- **Over the maximum weight:** "Over the maximum pallet weight by 35.0 lb (one layer is kept)".

**Placing.** Snapping moves a dragged carton so that its edge lies exactly on an edge of the allowed footprint, the pallet or another carton when it is within 0.5 inch of it; each direction snaps on its own, and it can be switched off. The arrow keys move the selected carton 0.25 inch, or 1 inch with Shift, always in inches whatever unit is shown, and without snapping. A typed position is taken exactly as typed. Undo keeps the last 200 changes of an editing session.

**Positions are kept relative to the pallet.** Each carton's place is stored as its distance from the back-left corner of the pallet itself, not of the allowed footprint. The position fields and the carton list show the distance from the pallet's left edge and from its front edge. A carton flush with the pallet's edge reads 0 whatever overhang is allowed, and a negative distance means it hangs over that edge. Changing the allowed overhang therefore leaves every carton where it is on the pallet, and only the overhang flag changes. Changing the pallet size keeps every carton's distance from that corner.

**Re-check or out of date.** A saved layout depends on the inputs in two different ways:

- **Re-checked.** A change to the pallet size, the overhang, the height, the maximum carton size, the weights or the minimum stability keeps the layout. Its layers, totals, flags and rating are worked out again at once, without waiting for the search. A unit switch changes only what is shown.
- **Out of date.** A layout's carton depends on the product size, the wall thickness and the leeway. When one of them changes so that the carton would no longer have the size it was made with, the layout is marked "Out of date". It is never deleted and never shown as current: it is listed greyed, with the product it was made for, and is shown and exported as it was made (with the old product, wall thickness and leeway, on the current pallet). Nothing is checked against inputs that no longer apply: its rating, its stability warnings, its flags, the "Carton volume outside the allowed footprint" row and its comparison with the best calculated layout are not shown in "Your layouts", on the "What to build" card, in the Analytics tab or in the Explanation tab, and no export gives them. Where a rating or flags would stand, the Analytics tab, the CSV and the build sheet say "Not checked: this layout is out of date"; in JSON the `flags` list is empty and the layout has no `stability`. It is never marked "Below your minimum", on screen or in an export. It cannot be edited. **Rebuild** opens the editor on the best calculated layout and saves over it under the same name; **Discard** removes it. Changing the inputs back makes it current again.

While an input is invalid, your layouts stay as they were under the last valid inputs.

**Stability of a manual layout.** It is rated by the four usual checks plus the two extra rules in "Stability rating" above: the stack height is judged on the narrowest free-standing group of the bottom layer (cartons count as one group when their facing edges are at most 1 inch apart), and each bottom carton must rest at least 90% on the pallet itself to avoid a caution (70% to avoid a serious warning). **A hand copy can therefore rate lower than the layout it was copied from**, for example when overhang is allowed and a bottom carton has under 90% of its base on the pallet. Nothing else about the copy differs.

**In the results.** Manual layouts are listed under "Your layouts", above the calculated ones. They are not ranked against calculated layouts and have no rank, score or ranking explanation. Each says how its boxes compare with the best calculated layout, when there is a current one to compare with. Several can be kept for the same inputs. Default names are "Manual 1", "Manual 2" and so on; a duplicate is named "... (copy)". Names are unique: on save, save as new, rename, duplicate and a scenario load, a name another layout has gets " (2)", " (3)" and so on added, and a notice says which name was given.

**Volume outside the footprint.** "Volume used" and the utilization count only the carton volume inside the allowed footprint and stacking height. When some is outside, the row "Carton volume outside the allowed footprint" gives it on the Analytics tab, in the CSV and on the build sheet (in JSON, `volumeOutsideEnvelope`). If a carton also stands above the stacking height, the row is titled "... or above the stacking height".

**How a carton's size is written.** A layout that stands its cartons one way up is written as stacked: length × width × height, the longer side of the base first. A manual layout always stands its cartons one way, so the editor (which labels its sizes "as stacked") and every screen and export of a manual layout use this. A calculated layout whose layers stand the carton different ways up has no single height: its three sizes are written longest first, as before. The hand copy of such a layout can therefore read differently from its row in the comparison table (with the default inputs, 21 × 13 × 9 in the table and 21 × 9 × 13 as stacked in the editor); it is the same carton.

**Where the editor works.**

- **Full view and 768 pixels.** The editor is offered in Full view on a window at least 768 pixels wide. Below that, and in Basic view, saved layouts can be selected, viewed and printed but not edited, and the buttons say why. If the window is narrowed or the view switched while a layout is being edited, the work is kept and covered until the window is wide enough or Full view is chosen again.
- **One at a time, on a current result.** A layout cannot be opened from a calculated result while a calculation is running, has failed, or an input is invalid.
- **Exports are switched off while editing.** Save or cancel first.
- **The results are put away while editing.** The editor fills the height of the window, with its tools and view in sight without scrolling at 768 pixels of height and above; "Your layouts" and the comparison table come back when it closes. The layer view cannot be turned to look from under the pallet.
- **Leaving with unsaved work.** The browser asks before the page is closed or reloaded while the editor holds unsaved changes.
- **Two tabs.** If the saved layout being edited was changed in another tab since the editor opened, Save does nothing and says "This layout was changed in another tab." "Save as new" keeps both; "Overwrite" saves this tab's version in its place. If it was deleted there, Save says "This layout was deleted in another tab. Save it again?" and offers "Save again" or "Not now".
- **The inputs can change while you edit.** The layout being edited is checked again as they change. If the carton changes size or can no longer go on the pallet, the editor goes back to the Carton step and says so.
- Mouse and touch both work; the editor's controls are at least 44 pixels across for fingers.

**Storage.** Manual layouts are saved in this browser only, under `pc.manualLayouts.v1`, like presets. There are no share links, so a layout reaches someone else only as a build sheet or another export. A scenario saved while manual layouts exist carries a copy of all of them. **Loading a scenario adds its layouts and never deletes or changes yours:** one you already have unchanged is skipped (a rename alone is not a change), and one whose carton, layer or upper layers have changed since the scenario was saved is added beside yours as a copy named "... (from scenario)". A layout stored before positions were kept relative to the pallet is converted when first loaded; if that cannot be written to storage, it is said once and the converted layout is used for the session. Loading a scenario while the editor is open asks first and closes the editor.

**What is not checked or not possible.**

- **Crush strength** and the load on the bottom cartons are not checked, for manual layouts as for calculated ones.
- **There is no weight limit per carton.** The maximum pallet weight is the only weight check.
- **No part layers.** Every layer is your whole layer. The tool does not add a few cartons on top.
- **One pattern per layout.** Every layer is the same layer, turned or not. A different pattern for each layer cannot be built by hand.
- **One carton, one product.** Mixed carton sizes, boxes facing different ways inside one carton, and several products on one pallet are not supported. Several products on one pallet are not planned.
- Whether a turned upper layer rests well on the one below is only judged by the stability rating; nothing stops you saving a layout that rates Poor.

## Basic and Full view

- Basic view hides: leeway, wall thickness, overhang, rotation, keep cartons upright, desired box quantity, minimum stability, layer pattern, the Advanced section, the manual editor, the layout comparison table, scores, utilization figures, the Explanation and Selection tabs, preset saving and managing, scenarios, and the JSON and CSV exports.
- **Hidden settings still apply.** Basic only hides them. It never resets them. A line under the inputs states the ones in effect, for example "Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable. Change in Full view." A minimum stability or layer pattern other than Auto is named in that line and again on the "What to build" card ("Minimum stability: Good only."), together with "Auto would give N more boxes." when that applies, so a filtered answer is never unexplained. If a hidden setting was left invalid in Full view, Basic says so and links to Full view.
- Basic lists "Your layouts" when there are any. A layout built by hand can be selected, viewed and printed there; editing, renaming, duplicating and deleting are in Full view.
- Basic shows the layout that is selected. If you picked a different layout in Full view, Basic shows that one and says "Showing layout N, chosen in Full view", with a button to go back to layout 1.
- If nothing fits, or an error occurs, Basic shows the message and hides the "What to build" card.
- **A failed calculation marks the previous result out of date.** The error is shown with Retry; the production figures and 3D view keep the last result, dimmed and badged "Out of date" (in both views), until a calculation succeeds.
- Switching views never recalculates and never changes your inputs, selected layout, presets or scenarios.
- The theme (Harbor or Light) only changes how the page looks on screen. It never affects a result.

## Look and themes

- There are two themes only: **Harbor** (the default) and **Light**. There is no System option. The tool no longer follows your computer's light or dark setting.
- Browsers that had "Dark" or "System" saved now open in Harbor. A saved "Light" stays Light.
- The fonts (Exo 2 for headings, Barlow for text and numbers) are bundled with the site. They add roughly 60 kB the first time the page loads, and the tool never asks another website for them. While they load, text shows in a standard system font.
- Exports always stay light, whatever the theme. The PNG, PDF, CSV and JSON files look the same in both themes.
- The mascot is decoration only. It is hidden from screen readers, has no name or caption, and never changes a result. It shows in the header, beside the "What to build" hint, beside "Calculating", beside an error or "nothing fits" message, in the browser tab, and once on page 1 of the build sheet. It never appears in the 3D view, the PNG, or any other page.

## Limitations

- **Calculated layers are straight-cut or pinwheel.** A layer is built either by straight cuts from edge to edge or as a four-block pinwheel, whichever holds more cartons (straight cuts win a tie, being easier to build) unless the Layer pattern setting says otherwise. Other patterns are not tried by the search; a layer of any other shape has to be placed by hand. The pinwheel search shares one fixed work allowance across the whole calculation. When it is spent, the remaining pinwheel searches are skipped and a rarer pinwheel pattern may be missed; this is not marked on the result (marking it would flag many ordinary results). Under Auto, only the main search, when it stops early on time, marks the result as limited; the other Layer pattern settings also mark it when their further pinwheel searches run out of time. When a pinwheel wins, the straight-cut layouts of the same carton are still offered below it, with or without a weight limit, since staff may prefer the simpler build.
- **Flat layers.** A load is a stack of flat layers. A carton never straddles two layers.
- **One carton size per layout.** Mixed carton sizes in one load are not supported. Several products on one pallet are not supported and are not planned.
- **Weight: whole layers only.** With a weight per product box and a maximum pallet weight, layers are removed from the top until the whole load (pallet included) is at or under the maximum. When layers were removed, "Room for N more cartons by weight" is advice: the tool never places a part layer. It is not shown when nothing was removed, because then the height, not the weight, is the limit. Straight-cut layouts are still offered under a weight limit, so a limit never gives fewer boxes than a simple layout would. The maximum is the only weight check: there is no limit per carton, no crush or load-bearing check, and the weight per carton is shown without judgement.
- **Weight is optional.** With the weight per product box blank, weight is ignored everywhere: nothing about it is shown, and the CSV, PDF and PNG are unchanged (the JSON export carries the blank weight fields as they are). The empty carton weight defaults to 0 and the pallet to 40 lb. Weights are in pounds with inches and in kilograms with cm or mm. Presets keep the maximum, empty carton and pallet weights; the product box weight stays with the product.
- **The stability rating is advice, not a safety check.** It looks at shape only, using the thresholds in the "Stability rating" table above (stack height, carton proportions, support from the layer below, straight columns). Crush strength and load-bearing are not checked, and a Poor layout is still offered when it carries the most boxes, unless you set a minimum stability. A full-height load on a standard pallet usually rates Fair, because the stack is more than 1.5 times as tall as its base is wide. You must judge whether the load is safe.
- **Unused-space overlay is a picture.** It shows headroom and per-layer gaps (gaps under 0.25 inch are not drawn). It is not part of any calculation.
- **Very small products can hit the search limit.** With a maximum weight and a very small product, the search may be stopped before it can prove that nothing fits. The tool then says the search was limited rather than that nothing fits.
- **Basic view cannot edit** leeway, walls, overhang, rotation, the target quantity, the minimum stability, the layer pattern, the empty carton and pallet weights, or a layout built by hand. Use Full view.
- **Editing by hand needs 768 pixels.** On a narrower screen, such as a phone, layouts built by hand can be viewed and printed but not edited.
- **Below 1024 pixels the page is one column**: summary, 3D view, your layouts and results, details, inputs, with a "Change inputs" link at the top. The page never scrolls sideways; the comparison table scrolls inside its own box. With a keyboard the inputs still come first in the tab order. A finger on the 3D view turns the view and does not scroll the page; scroll above or below it.
- **Layer order.** Layers are ordered with the fullest layer at the bottom, so a narrower layer can sit under a slightly wider one; check overhang between layers when building mixed stacks.

## Search limits

- **4 second limit.** The tool stops searching after 4 seconds. This applies only once at least one layout has been found, so you never get a false "nothing fits". For absurd inputs (for example a product a hundredth of an inch across) a hard 6 second limit stops the search even before a layout is found; the result is then marked as limited, and if no carton count was confirmed nearest the message names none. If the limit is reached, or the number of carton sizes tried was capped (very small boxes), you see "Search was limited to keep it fast; results may not be the best possible." Treat the result as good but possibly not the best.
- **8000 candidate cartons.** For very small products there can be a huge number of possible cartons. Only the 8000 largest-capacity candidates are tried; with a maximum pallet weight, the 8000 that could carry the most boxes within that weight. If such a limited search finds nothing under the maximum, the message says the search was limited rather than that nothing fits. The result is marked as stopped early. This cap does not apply when you enter "Desired boxes per carton": every arrangement of that exact count is tried. The nearest counts named in the "nothing fits" message are also worked out exactly.
- **Very small cartons or very long pallets.** When the exact layer search would be too slow (for example cartons under roughly 3 inches on a large pallet, or a pallet many times longer than it is wide), the tool uses a simpler search with a single cut per rectangle, and for extremely small cartons only a plain grid. The answer is still a valid, buildable layer, but it may not be the best possible. Ordinary pallets (48 x 40, 50 x 42, 52 x 44) with cartons of 3 inches or more always get the exact search.

## Saved data

- Presets, scenarios, layouts built by hand, your last inputs, and your view and theme choices are saved **in this browser only**. They are not shared between computers or browsers, and clearing the browser's site data removes them. Use the preset export to keep a copy of presets. Layouts built by hand have no export of their own that can be loaded back: a saved scenario carries them within the same browser, and the build sheet is the copy to hand on.
- If saved data cannot be read (for example it was damaged), the tool skips it and shows a notice. Before it ever overwrites such data, it keeps the original text under the same storage name with `.backup` added, for example `pc.presets.v1.backup`. The notice says "It will be backed up before anything is overwritten." (or "They will be backed up before anything is overwritten." when only some saved items were skipped). If that backup copy cannot be written, nothing is overwritten: the change stays on screen only, and the notice says "Could not keep a backup, so your change was not saved. Free up browser storage and try again."
- Presets, scenarios and layouts built by hand saved in two open tabs are merged: each save or delete is applied to what is stored at that moment, so one tab never wipes out another tab's items, and a deleted item is not brought back by the other tab. Lists in other open tabs update when storage changes. If another tab deletes the manual layout you have selected, this tab says so and shows calculated layout 1.
- If a layout built by hand cannot be written (browser storage full or unavailable), the editor says nothing was saved and stays open with your work in it.
- If the browser cannot store data, the tool still works but tells you nothing will be saved.

## Exports

- The side view (PNG and build sheet) is seen from the front of the pallet, the edge at the bottom of the top view and the layer plans, so left and right agree in all of them.
- The PNG has three pictures (your 3D view, a top view and a side view) and a caption strip with the numbers. When the layout has a weight or a stability rating, one caption line gives them, for example "498.1 kg · Limited by weight: 1 layer removed · Stability: Good". The top and side pictures have no dimension or measurement labels, only the panel titles.
- **Build sheet (PDF).** Available in both views. You may type a job name of up to 80 characters.
  - Page 1: title, job name and date, the five production figures, the carton (outer size, inner size, boxes per carton, how boxes sit inside), the pallet and finished load size, the stability rating with each warning and which layers are drawn turned half a turn ("Layers 3, 5, 7 are pattern B turned half a turn (shown as pattern C)."), and two pictures (the 3D view and the side view). If the result is out of date, a boxed line says so. If a layout other than layout 1 was selected, a line under the date says "Layout N of M selected. Layout 1 fits X boxes."
  - Next pages: one block per distinct layer pattern with a top-down drawing to scale (a layer turned half a turn is its own pattern, noted "Pattern B turned half a turn (180°)."), and a stacking table from bottom to top. The drawing's edge dimensions are always the pallet's length and width, measured along the solid pallet outline. Each block of cartons is labelled "rows × columns" inside the drawing when it has room (the same values are listed as "Blocks (rows × columns)"). With overhang, a key under the drawing says which outline is which, for example "Solid line: pallet 48.00 × 40.00 in. Dashed line: limit with overhang 50.00 × 42.00 in." A long table continues on further pages. Pages 2 onward carry a running header. Every footer lists the settings used, including "Desired boxes per carton: best fit." when blank or "Desired boxes per carton: N." when set, "Layout N of M" and "Page X of Y".
  - US Letter, portrait, sizes in the unit chosen in the header, English only, no company name or logo. The only picture besides the drawings is the small mascot at the top right of page 1.
  - The pictures and text are always on a white background, whatever the theme.
  - The layer drawings show carton outlines, not individual product boxes.
  - Letters outside the basic Latin alphabet in a job name (for example Chinese or Cyrillic) print as "?".
  - If the 3D view is unavailable, the sheet is made without the two pictures and says "3D pictures unavailable".
  - The two pictures shrink to fit above the footer when page 1 has many rows; when even small pictures would not fit, they move to the top of page 2 and the layer plan follows.
- The CSV comparison table has a Pattern column ("Pinwheel" or blank, as the table's badge) when any listed layout has a pinwheel layer.
- **A layout built by hand.** When one of your layouts is selected, every export describes it and nothing of a ranking is written.
  - Build sheet: the heading under the title is "Manual layout: " and its name, and the footer says the same in place of "Layout N of M". Broken limits are listed in a box titled "Limits broken"; the note about a facing the rotation setting would not allow is listed without that title. Page 1 states the "Upper layers" choice. Each pattern is drawn carton by carton as placed, with "Arrangement: Placed by hand: build as drawn" in place of the block list; cartons outside the allowed footprint are drawn where they stand and the drawing grows to hold them. A turned layer is its own pattern, as for calculated layouts.
  - PNG: the last caption line begins "Manual layout: " and its name.
  - CSV: "Selected layout" reads "Manual: " and its name; the rows "Manual layout flags" and "Upper layers" are added; the score rows and the comparison table are left out. The stability rows add "Least share of a bottom carton resting on the pallet", and the stack height row is titled for the narrowest free-standing group when the bottom layer stands in more than one.
  - JSON: `rank`, `score` and `explanation` of the selected layout are `null`, `manual` holds the name, flags, status, upper-layers choice and the inputs the carton was made for, and `comparison` is empty.
  - A layout rating under the minimum stability is marked "Below your minimum" in the CSV ("Stability mark") and on the build sheet, as on screen.
  - An out-of-date layout is exported as it was made. The status says "Out of date: the product size, wall thickness or leeway changed after this layout was made", the CSV adds the product, wall thickness and leeway it was made for, and the build sheet carries a boxed line with the same. It is not marked "Below your minimum", as on screen.
- **Minimum stability and layer pattern.** The CSV has the rows "Minimum stability", "Layer pattern" and "Result notes" (the sentences shown on screen, such as "Auto would give 12 more boxes."), and marks every rating "(Below your minimum)" when nothing reached the minimum. The build sheet footer names a setting that is not Auto, and page 1 carries the same sentences in the rows "Minimum stability", "Layer pattern" and "Compared with Auto".
- **No export while editing.** The Export menu is switched off while the manual editor is open.
- PNG and PDF are always light, whatever the theme. The PNG has no mascot. The PNG shows the unused-space overlay only when "Unused space" is ticked at export time; the PDF build sheet never shows it.

## Planned for a later round (not built yet)

- Advanced optimization (weighting the score towards stability).
- A target-quantity field in Basic view, company branding on exports.
- Shareable links. When they are built they are to carry layouts built by hand as well.

Not built and with no round set for them: a different pattern for each layer and part layers in the manual editor, typing a carton's outer size directly, editing by hand on phones, a weight limit per carton, and a crush strength check. Several products on one pallet were considered and withdrawn; they are not planned.

The "Advanced Optimization" section is shown but switched off, and has no effect on any result.
