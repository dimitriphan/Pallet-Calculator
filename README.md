# Pallet Calculator

Pallet Calculator answers one question: **how many product boxes fit on one pallet, in what carton, and arranged how?**

You enter the size of your product box, the biggest carton you are allowed to use, and the pallet limit. The tool tries every carton size that could work. It shows the five best loads side by side, with a 3D picture of each. The numbers are exact, and results are repeatable: the same inputs give the same answer, except when the search is limited to keep it fast (the tool says so when that happens).

## How to use it

1. Enter the **pallet limitation** (length, width, height). A 5-inch pallet is added for you, so 5 inches are taken off the height.
2. Enter the **product box** size.
3. Enter the **maximum carton** size you can ship.
4. Adjust leeway, wall thickness, overhang and rotation if needed. Leave the desired quantity blank to get the most boxes possible.
5. Read the **production summary** bar at the top. It shows boxes per carton, cartons per layer, layers, cartons per pallet and total boxes per pallet.
6. Click a row in the **layout comparison** table to see that layout in 3D and in the details panel. Use **Export** for JSON, CSV or a PNG picture, and **Presets** and **Scenarios** to save your work.

Results update by themselves about a third of a second after you stop typing.

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
