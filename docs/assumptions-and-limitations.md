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

**Ranking.** Layouts are ordered by total boxes first, then by score, then by fewer cartons. The score is 60% quantity, 25% volume used and 15% space (how few gaps there are inside the load). Quantity is ordered first so that a tidier load can never beat one that carries more boxes. Near-identical layouts (mirror images, or the same carton and arrangement) are shown once. If fewer than five different layouts exist, you see fewer. If nothing fits, the tool says why.

## Basic and Full view

- Basic view hides: leeway, wall thickness, overhang, rotation, keep cartons upright, desired box quantity, the Advanced section, the layout comparison table, scores, utilization figures, the Explanation and Selection tabs, preset saving and managing, scenarios, and the JSON and CSV exports.
- **Hidden settings still apply.** Basic only hides them. It never resets them. A line under the inputs states the ones in effect, for example "Using 0.50 in leeway, 0.25 in carton walls, no overhang, fully rotatable. Change in Full view." If a hidden setting was left invalid in Full view, Basic says so and links to Full view.
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

- **Guillotine layers only.** Each layer is built by straight cuts from edge to edge. Pinwheel (interlocked) layers can sometimes fit one or two more cartons per layer. The tool does not find them.
- **Flat layers.** A load is a stack of flat layers. A carton never straddles two layers.
- **One carton size per layout.** Mixed carton sizes in one load are not supported.
- **Weight limit by whole layers only.** With a weight per product box and a maximum pallet weight, layers are removed from the top until the whole load (pallet included) is at or under the maximum; the tool then reports "Room for N more cartons by weight" but never places a part layer. The maximum is the only weight check: there is no limit per carton, no crush or load-bearing check, and the weight per carton is shown without judgement.
- **Weight is optional.** With the weight per product box blank, weight is ignored everywhere and nothing about it is shown or exported. The empty carton weight defaults to 0 and the pallet to 40 lb. Weights are in pounds with inches and in kilograms with cm or mm. Presets keep the maximum, empty carton and pallet weights; the product box weight stays with the product.
- **No stability or crush checks.** Tipped cartons and tall columns are allowed without any warning. You must judge whether the load is safe.
- **Basic view cannot edit** leeway, walls, overhang, rotation, the target quantity or the empty carton and pallet weights. Use Full view.
- **Layer order.** Layers are ordered with the fullest layer at the bottom, so a narrower layer can sit under a slightly wider one; check overhang between layers when building mixed stacks.

## Search limits

- **4 second limit.** The tool stops searching after 4 seconds. This applies only once at least one layout has been found, so you never get a false "nothing fits". For absurd inputs (for example a product a hundredth of an inch across) a hard 6 second limit stops the search even before a layout is found; the result is then marked as limited, and if no carton count was confirmed nearest the message names none. If the limit is reached, or the number of carton sizes tried was capped (very small boxes), you see "Search was limited to keep it fast; results may not be the best possible." Treat the result as good but possibly not the best.
- **8000 candidate cartons.** For very small products there can be a huge number of possible cartons. Only the 8000 largest-capacity candidates are tried. The result is marked as stopped early. This cap does not apply when you enter "Desired boxes per carton": every arrangement of that exact count is tried. The nearest counts named in the "nothing fits" message are also worked out exactly.
- **Very small cartons or very long pallets.** When the exact layer search would be too slow (for example cartons under roughly 3 inches on a large pallet, or a pallet many times longer than it is wide), the tool uses a simpler search with a single cut per rectangle, and for extremely small cartons only a plain grid. The answer is still a valid, buildable layer, but it may not be the best possible. Ordinary pallets (48 x 40, 50 x 42, 52 x 44) with cartons of 3 inches or more always get the exact search.

## Saved data

- Presets, scenarios, your last inputs, and your view and theme choices are saved **in this browser only**. They are not shared between computers or browsers, and clearing the browser's site data removes them. Use the preset export to keep a copy.
- If saved data cannot be read (for example it was damaged), the tool skips it and shows a notice. Before it ever overwrites such data, it keeps the original text under the same storage name with `.backup` added, for example `pc.presets.v1.backup`. The notice says "It will be backed up before anything is overwritten." (or "They will be backed up before anything is overwritten." when only some saved items were skipped). If that backup copy cannot be written, nothing is overwritten: the change stays on screen only, and the notice says "Could not keep a backup, so your change was not saved. Free up browser storage and try again."
- Presets and scenarios saved in two open tabs are merged: each save or delete is applied to what is stored at that moment, so one tab never wipes out another tab's items, and a deleted item is not brought back by the other tab. Lists in other open tabs update when storage changes.
- If the browser cannot store data, the tool still works but tells you nothing will be saved.

## Exports

- The PNG has three pictures (your 3D view, a top view and a side view) and a caption strip with the numbers. The top and side pictures have no dimension or measurement labels, only the panel titles.
- **Build sheet (PDF).** Available in both views. You may type a job name of up to 80 characters.
  - Page 1: title, job name and date, the five production figures, the carton (outer size, inner size, boxes per carton, how boxes sit inside), the pallet and finished load size, and two pictures (the 3D view and the side view). If the result is out of date, a boxed line says so. If a layout other than layout 1 was selected, a line under the date says "Layout N of M selected. Layout 1 fits X boxes."
  - Next pages: one block per distinct layer pattern with a top-down drawing to scale, and a stacking table from bottom to top. The drawing's edge dimensions are always the pallet's length and width, measured along the solid pallet outline. Each block of cartons is labelled "rows × columns" inside the drawing when it has room (the same values are listed as "Blocks (rows × columns)"). With overhang, a key under the drawing says which outline is which, for example "Solid line: pallet 48.00 × 40.00 in. Dashed line: limit with overhang 50.00 × 42.00 in." A long table continues on further pages. Pages 2 onward carry a running header. Every footer lists the settings used, including "Desired boxes per carton: best fit." when blank or "Desired boxes per carton: N." when set, "Layout N of M" and "Page X of Y".
  - US Letter, portrait, sizes in the unit chosen in the header, English only, no company name or logo. The only picture besides the drawings is the small mascot at the top right of page 1.
  - The pictures and text are always on a white background, whatever the theme.
  - The layer drawings show carton outlines, not individual product boxes.
  - Letters outside the basic Latin alphabet in a job name (for example Chinese or Cyrillic) print as "?".
  - If the 3D view is unavailable, the sheet is made without the two pictures and says "3D pictures unavailable".
- PNG and PDF are always light, whatever the theme. The PNG has no mascot.

## Planned for a later round (not built yet)

- Advanced optimization (stability preference, interlocked layer patterns).
- Transparent overlays showing unused space.
- A target-quantity field in Basic view, company branding on exports, shareable links.

The "Advanced Optimization" section is shown but switched off, and has no effect on any result.
