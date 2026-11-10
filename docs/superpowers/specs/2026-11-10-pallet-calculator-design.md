# Pallet Calculator: Design (Round 1)

Date: 2026-11-10
Status: awaiting review

## 1. Purpose

A web tool for the owner's own warehouse operations that answers: given a
product box, a maximum carton size, and a pallet limit, how many boxes fit on
one pallet, in what carton, arranged how?

It is used for real packing decisions, so correct numbers come before
everything else. Loads must be buildable by a warehouse team: flat layers made
of clear rectangular blocks.

Success means:

- The reported counts are correct and reproducible (same input, same answer).
- The top 5 layouts are meaningfully different and each one is explained.
- The 3D view shows exactly the load the numbers describe.
- Calculation finishes in under 2 seconds for normal inputs and never freezes
  the page.

## 2. Scope

### Round 1 (this design)

Inputs and validation, the optimizer, top 5 layouts with scoring and
explanations, 3D workspace, analytics, production summary, presets, scenarios,
JSON/CSV/PNG export, tests, and documentation.

### Round 2 (not in this design)

- Advanced Optimization: stability preference, weight per product, pallet
  weight, centre of mass, heavy-on-bottom advice, pinwheel / interlocked /
  hybrid layer patterns.
- PDF summary export.
- Unused-space transparent overlays in 3D.
- Unit switching in the UI (centimetres, millimetres). The unit service exists
  in Round 1; only inches are shown.

In Round 1 the "Advanced Optimization" section is visible, collapsed,
disabled, and labelled as coming later. It has no effect on calculations.

### Out of scope

Backend, accounts, multi-pallet, mixed SKU, truck and container loading. The
architecture leaves room for them; nothing is built for them.

## 3. Technology

React 18, TypeScript (strict), Vite, Tailwind CSS, Zustand, Zod,
React Three Fiber, Three.js, @react-three/drei, Vitest, Playwright (one
end-to-end test), ESLint, Prettier. Static site, deployed on Vercel. No
backend. Persistence in Local Storage.

## 4. Business rules

All dimensions are stored in inches at full floating-point precision. Values
are rounded to 2 decimals only when displayed. Rounded values are never fed
back into calculations. Comparisons that decide whether something fits use a
tolerance of 1e-9 inches to absorb floating-point noise.

### 4.1 Inputs

| Input | Default | Rule |
|---|---|---|
| Pallet limit length, width, height | 50, 42, 72 | each > 0; height > 5 |
| Product box length, width, height | 12, 8, 4 | each > 0 |
| Maximum carton length, width, height | 24, 18, 16 | each > 0 |
| Target quantity | blank | blank, or a whole number >= 1 |
| Box leeway | 0.5 | >= 0 |
| Carton wall thickness | 0.25 | >= 0 |
| Pallet overhang | 0 | >= 0 |
| Product rotation | Fully Rotatable | see 4.5 |
| Keep cartons upright | off | see 4.6 |

Non-numeric text, negative values, and zero dimensions are rejected with a
message beside the field.

### 4.2 Pallet

- The physical pallet is always 5 inches tall and cannot be changed.
- Usable stacking height = entered height - 5.
- The UI shows: "A 5-inch pallet is automatically included. Available stacking
  height has been reduced by 5 inches."
- Usable footprint = (length + overhang) x (width + overhang). Overhang is the
  total added per dimension (a 2 inch overhang turns 50 x 42 into 52 x 44),
  split evenly on both sides, so the load is centred on the pallet. Overhang
  never affects height.
- Available volume = usable footprint x usable height.

### 4.3 Carton sizing

For a box orientation with dimensions (bx, by, bz) and counts (nx, ny, nz):

- Inner size per axis = n x b + leeway. Leeway is added once per carton
  dimension, not per box. Boxes pack tight against each other.
- Outer size per axis = inner size + 2 x wall thickness.
- Boxes per carton = nx x ny x nz.

A carton is valid when its outer dimensions, sorted largest to smallest, are
each no greater than the maximum carton dimensions sorted the same way. A
16 x 24 x 18 carton therefore fits a 24 x 18 x 16 maximum; it is the same
carton turned.

The outer size is what is stacked on the pallet. One carton size is used per
layout. Users never enter carton dimensions.

### 4.4 Carton choice

The optimizer does not simply take the carton with the most boxes. It
evaluates every valid carton on the pallet and prefers whichever puts the most
product on the pallet. The top 5 layouts may use different cartons.

### 4.5 Product rotation

The setting limits which product dimension may point up in the finished
pallet load, not only inside the carton.

| Option | Product dimension allowed to be vertical |
|---|---|
| Fully Rotatable | length, width, or height |
| Keep Upright | height only |
| No Side Rotation | height (upright) or length (stood on end); never width (resting on its long side face) |
| Custom | the user ticks any of the six orientations LWH, LHW, WLH, WHL, HLW, HWL; at least one is required |

The six orientation codes name which product dimension lies along the
carton's length, width, and height, in that order. For Custom, an orientation
is used inside the carton only if ticked, and the carton may be placed on the
pallet only in ways that leave the product in a ticked orientation.

Cartons can always be spun flat on the pallet, so what a ticked orientation
controls in practice is which product dimension is vertical (the third letter
of its code). LWH and WLH, for example, have the same effect.

Consequence: a restrictive product setting also restricts how the carton may
be turned on the pallet. "Keep Upright" for the product means cartons are
never tipped.

### 4.6 Carton turning on the pallet

- Default: a carton may rest on any face, and different layers may use
  different faces, subject to 4.5.
- "Keep cartons upright" on: the carton's height stays vertical. It may only
  be spun 90 degrees. All layers then have the same height.
- Within a layer, cartons may be spun 90 degrees block by block.

### 4.7 Target quantity

The optimizer always maximizes. When a target is entered, each layout reports:

- **Target Met** (total equals target), **Target Exceeded** (total greater),
  or **Target Not Achievable** (total less), and
- the maximum quantity possible, and
- the cartons and layers needed to reach the target (when achievable).

## 5. Optimizer

Pure TypeScript, no React or DOM. Deterministic.

### 5.1 Carton candidates

For each allowed product orientation, enumerate all (nx, ny, nz) >= 1 whose
carton is valid under 4.3. Under Fully Rotatable only, merge candidates that are the same
physical carton (equal outer size and box count with the same count multiset).
Under restricted rotation, mirror cartons are physically different and are not
merged. The top-5 selection also de-duplicates layouts that look identical from
outside (same sorted outer size, boxes per carton, and per-layer height, count
and blocks). Record for each: orientation, counts, inner and outer size,
boxes per carton, carton utilization (product volume / outer carton volume),
and empty volume.

### 5.2 Layer generation (guillotine search)

For a carton and a chosen vertical axis, the carton's footprint is a x b. The
best layer on a W x D rectangle is found recursively:

- A rectangle may be filled with a plain grid of the carton in either flat
  rotation, or
- split by one straight cut (parallel to either edge) into two rectangles,
  each solved the same way.

Cut positions are limited to sums of carton footprint dimensions (the only
positions that can matter), and results are memoized by rectangle size. The
result is the maximum carton count achievable by any guillotine arrangement,
expressed as a list of blocks: origin, rows, columns, flat rotation.

To give the top 5 real variety, the plain single-grid layers (each flat
rotation) are also kept as alternative layers when they differ from the best.

### 5.3 Stacking

Each permitted vertical axis gives a layer type with a height and a best
carton count. An exact unbounded-knapsack calculation over the usable height
picks how many layers of each type maximize cartons. Ties prefer fewer layer
types, then lower total height. Layers are ordered with the highest carton
count at the bottom. Each layer is centred within the usable footprint.

### 5.4 Layout representation

A layout stores: the carton candidate, an ordered list of layers (vertical
axis, height, base elevation, blocks), and totals. Carton and product
positions are derived on demand by a pure function. Every product belongs to a
carton and every carton belongs to a layout; nothing is positioned
independently.

### 5.5 Execution

Packing and ranking run in a web worker. The main thread sends validated
inputs and receives the ranked layouts. A new request supersedes an in-flight
one; stale results are discarded. Input changes are debounced by about 300 ms.

Cartons are evaluated in order of their best possible total, and evaluation
stops after a 4 second budget. If the budget is reached, the result is marked
as truncated and the UI says so. Very small boxes on a large pallet are the
only expected trigger. Candidate generation is capped at 8000 candidates (the
ones holding the most boxes per carton are kept), and the result is marked
truncated when the cap or the enumeration limit is hit. The time limit applies
only after at least one layout has been found, so a slow first carton cannot
produce a false "nothing fits".

## 6. Ranking

### 6.1 Score

Each component is on a 0 to 100 scale.

- **Quantity efficiency** = layout products / most products among all
  candidates x 100.
- **Volume utilization** = total carton outer volume / available volume x 100.
- **Space efficiency** = total carton outer volume / volume of the load's
  bounding box x 100. Gaps inside the load lower it; clean leftover space above
  or beside the load does not.

Overall score = 0.60 x quantity + 0.25 x utilization + 0.15 x space.

### 6.2 Order

Layouts are sorted by total products (descending), then overall score, then
fewer cartons, then a stable key. Quantity is sorted first because the spec
requires quantity to always beat marginal utilization gains, which a weighted
sum alone cannot guarantee.

### 6.3 Selection of the top 5

Near-duplicates are removed: layouts with the same carton, same layer counts,
and arrangements that are mirror images or rotations of each other. The first
five remaining are returned. Fewer than five are returned when fewer distinct
layouts exist; zero when nothing fits, with a clear message naming the reason
(for example, no carton fits within the maximum, or the carton is larger than
the pallet).

### 6.4 Explanation

Each layout carries its three weighted contributions, its final score, and a
generated sentence comparing it with the next layout, for example: "Layout #1
ranked above Layout #2 because it fits 48 additional units while maintaining
similar utilization." When two layouts tie on quantity, score and carton count,
the sentence is: "Layout #A and Layout #B are equivalent in quantity, score,
and carton count; they differ only in carton size or arrangement."

## 7. Analytics

A pure function of one layout plus the inputs returns:

- **Product:** dimensions, product volume, quantity per carton.
- **Carton:** inner and outer dimensions, carton utilization %, empty volume,
  cartons per pallet.
- **Pallet:** dimensions, usable height, usable footprint, layers, cartons per
  layer (shown as a range when layers differ), total load height (including
  the 5 inch pallet), volume utilization %, remaining height, remaining
  footprint area of the fullest layer.
- **Final:** total products, total cartons, volume used, volume available,
  utilization %, remaining volume, target status.
- **Production summary:** boxes per carton, cartons per layer, layers, cartons
  per pallet, total boxes per pallet.

"Effective dimensions after leeway" from the original spec is reported as the
carton's inner dimensions, since leeway applies per carton.

## 8. User interface

One desktop-first workspace screen.

- **Header:** app name, preset selector, scenarios, export menu.
- **Production summary bar:** always visible.
- **Left, Inputs:** grouped fields from 4.1, the pallet notice, inline
  validation messages, the disabled Advanced Optimization section. Results
  recalculate automatically. While inputs are invalid, the last valid result
  remains, marked as out of date.
- **Centre top, 3D workspace** (section 9).
- **Centre bottom, Layout comparison:** all returned layouts at once with
  layout number, carton size, products, cartons, layers, utilization %,
  remaining volume, overall score. Clicking a row selects it; the 3D scene,
  analytics, summary, and measurements all follow.
- **Right, Details:** tabs for Analytics, Explanation, and Selection.

## 9. 3D workspace

- **Scale:** 1 scene unit = 1 inch. Scene Y is up.
- **Objects:** floor grid; pallet with deck boards and stringers, wood-like
  material, 5 inches tall, footprint equal to the entered pallet length and
  width; limitation envelope at about 20% opacity covering the usable
  footprint and usable height; cartons with outlines; product boxes inside
  cartons in a separate colour.
- **Rendering:** cartons are one InstancedMesh and products another. Layers
  alternate two shades of the carton colour.
- **Scaling rule:** above 5,000 products, products are hidden by default with a
  notice and a switch to show them.
- **Camera:** OrbitControls for rotate, pan, zoom; Reset View; Focus
  Selection.
- **Toggles:** Products, Cartons, Labels, Envelope, Grid, Wireframe,
  Measurements. Showing products makes cartons semi-transparent.
- **Measurements:** dimension lines for overall load length, width, and
  height; product and carton sizes as labels; inches, 2 decimals.
- **Selection:** clicking a product shows its dimensions and coordinates; a
  carton shows dimensions, product count, and utilization; the pallet shows
  overall utilization and load statistics.

## 10. Presets and scenarios

### 10.1 Presets

Fields: id, name, pallet dimensions, maximum carton dimensions, leeway, wall
thickness, overhang, target quantity, product rotation, keep-cartons-upright,
and a reserved advanced-settings object.

Actions: create, edit, clone, delete, export to a JSON file, import from a
JSON file. Selecting a preset immediately fills every matching input. Product
box dimensions are not part of a preset and are left as they are. Editing
inputs afterwards never changes the saved preset; a "modified" marker appears
with "Save to preset" and "Save as new".

Sample presets ship with the app, including the 50 x 42 x 72 example and a
standard 48 x 40 pallet.

### 10.2 Scenarios

Fields: id, name, timestamp, all inputs, the returned layouts, the selected
layout index, and its analytics.

Actions: save, rename, duplicate, delete, load. Loading restores the saved
result exactly without recalculating.

### 10.3 Persistence

A repository interface with one Local Storage implementation, so a REST
implementation can replace it later. Stored data carries a schema version.
Everything read from storage or from an imported file is validated with Zod; an
invalid entry is skipped with a notice. Before unreadable or partly readable
saved data is overwritten, the raw text is copied to a `<key>.backup` key, and
the notice ends with "It will be backed up before anything is overwritten."
("They will be backed up before anything is overwritten." when only some items
were skipped). If the backup cannot be written, the key is not overwritten and
the notice says "Could not keep a backup, so your change was not saved. Free up
browser storage and try again." Each save or delete is merged into what is
stored at that moment, so two open tabs keep each other's items; lists refresh
when another tab changes storage. Current inputs are remembered between
visits. A storage-full error is reported to the user without losing the
on-screen result.

## 11. Export

All exports describe the selected layout and include input parameters,
dimensions, counts, utilization metrics, and a timestamp.

- **JSON:** inputs, the selected layout with blocks, analytics, and the
  comparison table.
- **CSV:** a metrics section followed by the layout comparison.
- **PNG:** one image with three panels and a caption strip:
  1. the current 3D view as the user has framed it,
  2. a top view (looking straight down, orthographic),
  3. a side view (looking along the pallet width at the length x height face,
     orthographic).
  The top and side panels are rendered off-screen at a fixed framing that fits
  the whole load, and respect the current visibility toggles. The caption strip
  shows the production summary, load dimensions, and timestamp.

## 12. Architecture

Engines are plain modules with no UI dependencies.

```
src/
  domain/        types and Zod schemas
  engine/
    units/       conversion and display formatting
    packing/     carton candidates, layer search, stacking, positions
    ranking/     scoring, ordering, de-duplication, explanations
    analytics/   metrics
  worker/        optimizer web worker and its client
  store/         Zustand stores: inputs, results, scene, presets, scenarios
  persistence/   repository interface and Local Storage implementation
  export/        JSON, CSV, PNG
  scene/         React Three Fiber components
  ui/            panels, forms, tables
  data/          sample presets
docs/            architecture, build and deploy, assumptions and limitations
```

Data flow: inputs store -> Zod validation -> worker (packing, ranking) ->
results store -> selected layout -> scene, analytics, summary.

## 13. Error handling

- Invalid input: message beside the field; no calculation is started.
- Nothing fits: an empty state stating why.
- Worker failure: an error banner with a retry; the last good result remains.
- WebGL unavailable: the 3D panel shows a notice; all numbers still work.
- Corrupt storage or import: the bad entry is skipped with a notice.

## 14. Testing

- **Units and validation:** conversions; each invalid input type rejected.
- **Packing:** leeway and wall arithmetic; no carton exceeds the maximum;
  derived cartons never overlap and never leave the envelope; products stay
  inside their carton; guillotine result equals brute force on small cases;
  hand-calculated examples; rotation and upright rules honoured; determinism.
- **Ranking:** more products always ranks higher; contributions sum to the
  score; ties are stable; duplicates removed.
- **Analytics:** metrics for a known layout.
- **State:** loading a preset fills inputs without altering the preset;
  scenario save and load round-trip; selecting a layout updates derived state.
- **Export:** JSON and CSV content.
- **End to end (Playwright):** load sample data, check the summary, switch
  layouts.

## 15. Delivery

Repository `dimitriphan/pallet-calculator`, feature branch
`claude/pallet-calculator-round-1`. Vercel configuration included.
Documentation: architecture, build instructions, deployment instructions,
sample data, assumptions and limitations.

## 16. Known limitations (Round 1)

- Layers are guillotine arrangements. Pinwheel-style layers, which can
  sometimes fit one or two more cartons per layer, are not found.
- Loads are built from flat layers; cartons never straddle layers.
- No weight, stability, or crush-strength checks. Tipped cartons and
  column-stacked layers are allowed without warning.
- One carton size per layout.
- Inches only in the UI.
