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

Basic hides leeway, wall thickness, overhang, rotation, the desired box quantity, the layout comparison table, scores, presets management and scenarios. The hidden settings are not reset. Whatever they were set to in Full view still applies, and Basic prints them in a short line under the inputs. Switch to **Full** to change them, to compare the five best layouts, or to export JSON and CSV. Switching views never recalculates anything.

In Full view, click a row in the **layout comparison** table to see that layout in 3D and in the details panel. Use **Presets** and **Scenarios** to save your work.

### Theme

The look of the tool is called **Harbor**: deep blues, teal, square corners, and a small pixel-art mascot. The **Theme** control in the header offers two choices: **Harbor** (the default) and **Light**. Pick one and the tool remembers it in this browser. The tool does not follow your computer's light or dark setting. If you saved "Dark" or "System" in an older version, the tool now opens in Harbor.

The typefaces come with the site. Nothing is fetched from another website. The mascot is only decoration. It says nothing and shows no numbers. Exports (the PNG picture and the PDF) are always on a light background, so they print well. The mascot appears in exports only once: on page 1 of the build sheet.

To change a pixel of the mascot, edit `tools/mascot/poses.mjs`, then run `npm run mascot`. This rebuilds the pictures in `src/assets/mascot/`.

### Boxes per carton

Type a whole number, such as 6, and the tool only considers cartons that hold exactly 6 boxes. If no such carton fits inside your maximum carton size, the tool says so and names the nearest counts that do fit, for example "Counts that do fit: 6 and 8."

### Build sheet

**Export > Build sheet (PDF)** asks for an optional job name, then saves a PDF on US Letter paper. Page 1 is an overview with the numbers, the carton and two pictures. The following pages show each layer pattern from above, with a stacking table. Every page footer lists the settings used.

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
