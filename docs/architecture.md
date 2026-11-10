# Architecture

A static React 18 + TypeScript (strict) site built with Vite. There is no backend. The calculation engines are plain TypeScript with no React, three.js or browser code, so they can be tested alone. Files under `src/engine/` and `src/domain/` must keep it that way.

## The engines

| Folder | Job |
| --- | --- |
| `src/domain/` | Types (`types.ts`), constants such as the 5 inch pallet and tolerance (`constants.ts`), and Zod schemas that validate inputs and stored data (`schemas.ts`, `resultSchemas.ts`). |
| `src/engine/units/` | Number formatting and unit conversion (`units.ts`). Rounding happens only here, for display. |
| `src/engine/packing/` | `cartons.ts` finds valid carton candidates (and the 8000 cap). `rotation.ts` applies the rotation rules. `layerSearch.ts` finds the best guillotine layer on a rectangle. `stacking.ts` picks how many layers of each type fit the height and builds layouts. `positions.ts` turns a layout into carton and product positions. `metrics.ts`, `geometry.ts` and `tolerance.ts` hold shared maths. |
| `src/engine/ranking/` | `score.ts` (the 60/25/15 score), `rank.ts` (ordering, top 5, removal of look-alikes), `explain.ts` (the sentence comparing neighbours). |
| `src/engine/analytics/` | `analytics.ts`: all the numbers shown in the details panel, the summary bar and exports. |
| `src/engine/optimize.ts` | Ties the above together and applies the 4 second limit. |

Every product belongs to a carton, and every carton belongs to a layout. Positions are worked out on demand from the layout, never stored separately.

## Data flow

```
inputs store -> validation (Zod) -> worker -> ranking -> results store -> screen and 3D
```

1. `src/store/inputsStore.ts` holds what the user typed as text and parses it with the Zod schema. Errors show beside the field.
2. `src/ui/useAutoOptimize.ts` waits 300 ms after the last edit, then asks the results store for a calculation.
3. `src/worker/optimizerClient.ts` sends the validated inputs to `optimizer.worker.ts`, a web worker, so the page never freezes. A newer request replaces an older one, and late answers are discarded.
4. The worker runs `optimize.ts` (packing, then ranking) and returns the ranked layouts.
5. `src/store/resultsStore.ts` keeps the result and the selected row. The comparison table, summary bar, details tabs and 3D scene all read from it.

While inputs are invalid, the last good result stays on screen, marked out of date. A worker failure shows an error banner with Retry.

## Two coordinate frames

- **Engine frame:** x along the pallet length, y along the pallet width, z up. The origin is the minimum corner of the usable footprint. z = 0 is the top surface of the pallet.
- **three.js frame:** 1 unit = 1 inch, Y up. Only `src/scene/transforms.ts` converts between them: scene X = x - usableLength/2, scene Z = y - usableWidth/2, scene Y = z + 5.

Keep all conversion in that one file.

## Presets, scenarios and storage

- `src/persistence/repository.ts` defines a small `Repository` interface (`list`, `save`, `remove`) and a memory version used when browser storage is unavailable.
- `src/persistence/localStorageRepository.ts` is the Local Storage version. Each key holds `{ version: 1, items }`. Keys are in `keys.ts`: `pc.presets.v1`, `pc.scenarios.v1`, `pc.inputs.v1`.
- Everything read back is checked with Zod. Bad entries are skipped and a notice is shown ("... It will be backed up before anything is overwritten."). Before overwriting unreadable data, the raw text is copied to `<key>.backup`; if that copy cannot be written, the key is not overwritten and the change stays in memory.
- Every save or delete re-reads the key and applies the change to what is stored, so two tabs keep each other's items. The presets and scenarios stores also refresh on the window `storage` event.
- `src/store/presetsStore.ts` and `scenariosStore.ts` use a repository; sample presets come from `src/data/samplePresets.ts`.

### Adding a storage backend

Write an object that implements `Repository<T>` (for example one that calls a REST API), validate what it returns with the same Zod schemas, and pass it where the stores are created instead of the Local Storage one. The stores do not know which backend they use.

## Adding a layer pattern generator (Round 2)

Layers are built in `src/engine/packing/stacking.ts` (`bestLayer`, `plainLayers`, `buildLayouts`). A layer is a list of blocks (origin, rows, columns, flat rotation). To add a pattern such as pinwheel:

1. Write a function with the same shape as `searchLayer` in `layerSearch.ts`: given a rectangle and a carton footprint, return blocks and a carton count.
2. Call it from `bestLayer` and keep whichever result holds more cartons.
3. Extend the block type in `src/domain/types.ts` and its schema if the pattern needs a new kind of block.
4. `positions.ts` turns blocks into positions. Teach it any new block kind.
5. Add tests: no overlaps, everything inside the envelope, and a hand-counted example.

## Tests

- Unit tests sit next to the code as `*.test.ts` / `*.test.tsx` and run with `npm test` (Vitest). They cover engines, stores, persistence, export and UI components.
- `src/engine/packing/testSupport.ts` holds shared helpers such as brute-force checks.
- The end-to-end test is `e2e/workspace.spec.ts` (Playwright, `npm run e2e`). It enters a worked example, checks the numbers, selects a row, exports PNG, JSON and CSV, reloads, checks a validation message, and fails on any console error.
