# Pallet Calculator

Pallet Calculator answers one question: **how many product boxes fit on one pallet, in what carton, and arranged how?**

You enter the size of your product box, the biggest carton you are allowed to use, and the pallet limit. The tool tries every carton size that could work. It shows the five best loads side by side, with a 3D picture of each. The numbers are exact, and results are repeatable: the same inputs give the same answer, except when the search is limited to keep it fast (the tool says so when that happens).

## How to use it

The tool opens in **Basic view**. Basic shows only what you need to build a pallet. Use the **Basic | Full** switch in the header to change views. Your choice is remembered in this browser.

1. Enter the **pallet limitation** (length, width, height). A 5-inch pallet is added for you, so 5 inches are taken off the height.
2. Enter the **product box** size.
3. Enter the **maximum carton** size you can ship.
4. If your product always ships a fixed number per carton, type it in **Desired boxes per carton**. Leave it blank to get the most boxes possible. See "Boxes per carton" below.
5. Read the **production summary** bar at the top. It shows boxes per carton, cartons per layer, layers, cartons per pallet and total boxes per pallet.
6. Read the **What to build** card. It names the carton to use, how the boxes sit inside it, the stack layer by layer, and the finished pallet size.
7. Choose **Export > Build sheet (PDF)** to print instructions for the team (see "Build sheet" below).

Results update by themselves about a third of a second after you stop typing.

### Basic and Full view

Basic hides leeway, wall thickness, overhang, rotation, the desired box quantity, the minimum stability and layer pattern settings, the layout comparison table, scores, the manual editor, presets management and scenarios. The hidden settings are not reset. Whatever they were set to in Full view still applies, and Basic prints them in a short line under the inputs. Switch to **Full** to change them, to compare the five best layouts, to build a layout by hand, or to export JSON and CSV. Switching views never recalculates anything.

In Full view, click a row in the **layout comparison** table to see that layout in 3D and in the details panel. Use **Presets** and **Scenarios** to save your work.

### Theme

The look of the tool is called **Harbor**: deep blues, teal, square corners, and a small pixel-art mascot. The **Theme** control in the header offers two choices: **Harbor** (the default) and **Light**. Pick one and the tool remembers it in this browser. The tool does not follow your computer's light or dark setting. If you saved "Dark" or "System" in an older version, the tool now opens in Harbor.

The typefaces come with the site. Nothing is fetched from another website. The mascot is only decoration. It says nothing and shows no numbers. Exports (the PNG picture and the PDF) are always on a light background, so they print well. The mascot appears in exports only once: on page 1 of the build sheet.

To change a pixel of the mascot, edit `tools/mascot/poses.mjs`, then run `npm run mascot`. This rebuilds the pictures in `src/assets/mascot/`.

### Units

The **Units** control in the header shows every length in inches, centimetres or millimetres (weights follow: pounds with inches, kilograms with centimetres or millimetres). It only changes what you see. Your load, the result and your saved data stay exactly the same, nothing is recalculated, and switching back to the unit you typed in brings back exactly what you typed. On screens narrower than about 1280 pixels the word "Units" (and "Preset", "Theme") is hidden to save room; the controls still work and are still named for screen readers.

### Weight

Type the **weight per product box** and, if you have one, the **maximum pallet weight** (the whole load, pallet included). With a maximum set, the tool removes whole layers from the top until the load is under the limit, and says "Limited by weight" with the number of layers removed. When layers were removed and the maximum still allows more cartons, it says "Room for N more cartons by weight" (nothing is said about room when the height, not the weight, is the limit). That is advice only: the tool never builds a part layer for you. If even one layer is too heavy, it says "Nothing fits: one layer is already over the maximum pallet weight." Leave the box weight blank and weight is ignored everywhere.

### Pinwheel layers

Some products fit better when the cartons in a layer are turned in four blocks around the middle (a pinwheel). The tool tries this as well as straight rows and keeps the pinwheel when it holds more cartons. Such layouts show a **Pinwheel** badge in the comparison table and a note on the "What to build" card, and the simpler straight-row layout of the same carton is still listed below it. If the main search gets very large it stops early, and the tool says so. The extra pinwheel search has a fixed amount of effort to spend: on a very large search it may miss a rarer pinwheel pattern, and no notice is shown for that.

### Layer pattern

In Full view, under the inputs, **Layer pattern** says how much you want pinwheel layers:

- **Auto** (the default): a pinwheel layer is used only where it holds more cartons than straight rows.
- **Prefer pinwheel**: the number of boxes still comes first. Among layouts with the same number of boxes, pinwheel layouts are listed first. You never get fewer boxes than with Auto.
- **Pinwheel only**: layouts built from straight rows are left out. This can give fewer boxes. When it does, the tool says "Auto would give N more boxes." If there is no pinwheel layout at all, it says so and shows the straight-row layouts instead.

The setting is saved with your inputs, in presets and in scenarios.

### Stability

Every layout is rated **Good**, **Fair** or **Poor** from its shape: how tall the stack is for its base, how tall the cartons are for their base, how well each layer rests on the one below, and whether many identical layers sit in straight columns. The reasons appear in plain words on the card. When two layouts hold the same number of boxes, the steadier one is listed first, and the card may tell you to turn some layers half a turn (180°) so the seams do not line up ("Turn layers 3, 5, 7 half a turn (180°) so they interlock."). The rating is advice about shape only. It does not check crush strength. A tall full-height load on a standard pallet usually rates Fair.

### Minimum stability

The rating is always worked out for you. In Full view, under the inputs, **Minimum stability** lets you also leave out layouts that rate too low:

- **Auto** (the default): the layout with the most boxes comes first, whatever its rating.
- **Fair or better**: layouts rated Poor are left out.
- **Good only**: layouts rated Fair or Poor are left out.

A minimum can give fewer boxes. When it does, the tool says "Auto would give N more boxes." If no layout reaches the minimum, the tool says so and shows the most stable layouts it found, each marked **Below your minimum**. The setting is saved with your inputs, in presets and in scenarios.

### Unused space

Tick **Unused space** in the 3D toolbar to see the empty space in red: the gap above the load and the gaps inside each layer. The PNG export includes it only when the box is ticked. The PDF build sheet never shows it.

### Boxes per carton

Type a whole number, such as 6, and the tool only considers cartons that hold exactly 6 boxes. If no such carton fits inside your maximum carton size, the tool says so and names the nearest counts that do fit, for example "Counts that do fit: 6 and 8."

### Building a layout by hand

When you have your own preferred design, you can set the carton yourself and place the cartons of one layer by hand. The tool stacks that layer, checks it and reports on it like any other layout. This is in Full view, on a screen at least 768 pixels wide. The calculated result you start from is never changed.

There are two ways in:

- **Design my own carton**, above the layout comparison table. It opens the editor at the Carton step, starting from the carton of the best calculated layout.
- **Edit by hand**, on each row of the comparison table (also **Edit layout by hand** in the details panel). It opens the editor at the Pallet layer step with a copy of that layout's bottom layer.

The editor has two steps, **Carton** and **Pallet layer**, shown as tabs in the bar above the 3D view. The bar also holds the **Layout name**, **Undo**, **Redo**, **Save** and **Cancel**. While the editor is open, exports are switched off; save or cancel first.

**The Carton step** shows one carton in 3D, drawn open with its boxes inside. You set:

- **Boxes in the carton**: how many boxes lie along the carton's length, width and height. Use the minus and plus buttons or type a whole number from 1 to 99.
- **Box facing**: which way every box in the carton faces, chosen from small pictures.
- **Carton on the pallet**: whether the carton stands on its base, its side or its end. With "Keep cartons upright" on, it stays on its base.
- **Use a calculated carton**: starts again from one of the cartons the tool found.

The figures beside it (boxes per carton, outer and inner size, carton weight when weights are set, and how well the boxes fill the carton) update as you change things. A carton over your maximum carton size is allowed and flagged. A carton that cannot fit on the pallet, or is taller than the stacking height, cannot go on to the next step.

**The Pallet layer step** shows the pallet, a blue outline of the allowed footprint (the pallet plus the overhang you allow) and one layer of cartons. If you changed the carton, the layer starts as the tool's best layer for it.

| To do this          | Mouse or touch                                       | Keyboard                                         |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Select a carton     | Click or tap it (or its number in the carton list)   | `[` and `]` for the previous and next carton     |
| Move it             | Drag it. Dragging empty space turns the view instead | Arrow keys move it 0.25 inch; with Shift, 1 inch |
| Turn it 90° flat    | **Turn 90°**                                         | `R`                                              |
| Remove it           | **Remove**                                           | Delete or Backspace                              |
| Clear the selection | Click or tap empty space                             | Escape                                           |
| Undo, redo          | **Undo**, **Redo**                                   | Ctrl+Z (Cmd+Z on a Mac); Ctrl+Shift+Z or Ctrl+Y  |

The keys work while the 3D view or the carton list has the focus. Other controls:

- **Add carton** puts one more carton in the first free place inside the allowed footprint.
- **Snapping** (on by default): while you drag, a carton's edge within 0.5 inch of an edge of the allowed footprint, the pallet or another carton jumps onto it. Untick it to place cartons freely.
- **From left edge** and **From front edge**: the selected carton's exact position, which you can type.
- **Upper layers**: **All the same**, or **Alternate layers turned** (every second layer is turned half a turn).
- **Reset** puts the layer back as it was when it was loaded. **Top view** and **Reset view** change the camera only.

Cartons can never overlap. A carton dropped on another goes back to where it was. Cartons may hang over the allowed footprint, and the load may be over the maximum weight: the tool allows this and flags it in red. The panel beside the view shows the cartons in the layer, the layers, the total boxes, the total weight, the stability rating and any flags as you work.

**Save** adds the layout to "Your layouts" under its name ("Manual 1", "Manual 2" and so on, unless you type one).

### Your layouts

Layouts you built by hand are listed under **Your layouts**, above the layout comparison table, each with a **Manual** badge. They are not ranked against the calculated layouts and have no score. Each one shows its boxes, cartons, layers and weight, its stability rating, any flags, and how it compares, for example "12 fewer than the best calculated layout".

Click one to see it in 3D, in the details panel and in every export. Each has **Edit**, **Rename**, **Duplicate** and **Delete**. Basic view shows the list too, so a saved layout can be looked at and printed there, but not changed.

When you change the pallet, overhang, height, maximum carton size or weights, your layouts are checked again at once and their numbers and flags updated. When you change the product size, wall thickness or leeway so that a layout's carton is no longer the same size, the layout is marked **Out of date**. It is kept, greyed, and offers **Rebuild** (start again from the best calculated layout, under the same name) or **Discard**.

Your layouts are saved in this browser only.

### Build sheet

**Export > Build sheet (PDF)** asks for an optional job name, then saves a PDF on US Letter paper. Page 1 is an overview with the numbers, the carton and two pictures. The following pages show each layer pattern from above, with a stacking table. Every page footer lists the settings used.

### Exports of a layout built by hand

With one of your layouts selected, every export describes that layout:

- **Build sheet (PDF)**: headed "Manual layout: " and its name. Broken limits are listed in a red-barred box titled "Limits broken". The layer plan draws every carton where you placed it, with "Placed by hand: build as drawn", and a turned layer gets its own pattern letter. The "Upper layers" choice is stated.
- **PNG**: the caption says "Manual layout: " and its name.
- **CSV**: names the layout, lists its flags and the upper-layers choice, and has no score rows and no comparison table.
- **JSON**: the layout's rank, score and explanation are empty (`null`); a `manual` entry holds its name, flags, status and upper-layers choice. The comparison list is empty.

An out-of-date layout is exported as it was made and marked out of date.

## Quick start (run it on your computer)

You need Node 22.

```
npm ci
npm run dev
```

Then open the address shown in the terminal (usually http://localhost:5173).

## More documentation

- [Assumptions and limitations](docs/assumptions-and-limitations.md): the exact rules the tool follows, and what it does not do. Read this before relying on a result.
- [Build and deploy](docs/build-and-deploy.md): the npm commands, and how to put the tool online with Vercel.
- [Architecture](docs/architecture.md): how the code is organised, for the person who will maintain it.
