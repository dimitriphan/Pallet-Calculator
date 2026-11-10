# Assumptions and limitations

This page lists every rule the calculator follows, and what it cannot do. Read it before relying on a result for a real packing decision.

## The rules

**Units and precision.** All sizes are in inches. The tool keeps full precision inside and rounds to 2 decimals only on screen. A size counts as fitting if it is within 0.000000001 inch of the limit, to absorb computer rounding noise.

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

## Limitations

- **Guillotine layers only.** Each layer is built by straight cuts from edge to edge. Pinwheel (interlocked) layers can sometimes fit one or two more cartons per layer. The tool does not find them.
- **Flat layers.** A load is a stack of flat layers. A carton never straddles two layers.
- **One carton size per layout.** Mixed carton sizes in one load are not supported.
- **No weight, stability or crush checks.** Tipped cartons and tall columns are allowed without any warning. You must judge whether the load is safe.
- **Inches only.**

## Search limits

- **4 second limit.** The tool stops searching after 4 seconds. This applies only once at least one layout has been found, so you never get a false "nothing fits". If the limit is reached you see "Search stopped at the time limit; results may not be the best possible." Treat the result as good but possibly not the best.
- **8000 candidate cartons.** For very small products there can be a huge number of possible cartons. Only the 8000 largest-capacity candidates are tried. The result is marked as stopped early.
- **Very small cartons.** When a carton is smaller than roughly 2 inches on a full-size pallet, the exact layer search would be too slow. The tool then uses a simpler search with a single cut per rectangle. The answer is still a valid, buildable layer, but it may not be the best possible.

## Saved data

- Presets, scenarios and your last inputs are saved **in this browser only**. They are not shared between computers or browsers, and clearing the browser's site data removes them. Use the preset export to keep a copy.
- If saved data cannot be read (for example it was damaged), the tool skips it and shows a notice. Before it ever overwrites such data, it keeps the original text under the same storage name with `.backup` added, for example `pc.presets.v1.backup`. The notice says "A backup copy was kept."
- If the browser cannot store data, the tool still works but tells you nothing will be saved.

## Exports

- The PNG has three pictures (your 3D view, a top view and a side view) and a caption strip with the numbers. The top and side pictures have no text labels on the load itself.

## Planned for Round 2 (not built yet)

- Advanced optimization (stability preference, weights, centre of mass, interlocked layer patterns).
- PDF export.
- Transparent overlays showing unused space.
- Switching units (centimetres, millimetres).

The "Advanced Optimization" section is shown but switched off, and has no effect on any result.
