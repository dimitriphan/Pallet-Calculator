# Pallet Calculator

Calculates efficient pallet placement: how many products fit in cartons on a pallet, and the best
carton layout.

## Stack

React 18, TypeScript (strict), Vite, Tailwind CSS 3, Zustand, Zod, three.js via
`@react-three/fiber` 8 and `@react-three/drei` 9, Vitest, Playwright.

## Scripts

| Script              | Purpose                           |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the Vite dev server         |
| `npm run build`     | Type-check and build to `dist/`   |
| `npm run preview`   | Preview the production build      |
| `npm run typecheck` | Type-check without emitting       |
| `npm run lint`      | Lint with ESLint                  |
| `npm run format`    | Format with Prettier              |
| `npm test`          | Run unit tests (Vitest)           |
| `npm run e2e`       | Run end-to-end tests (Playwright) |
