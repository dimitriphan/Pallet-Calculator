# Build and deploy

## What you need

- **Node 22** (the runtime that runs the build tools). Check with `node --version`. The project says so in `package.json` (`"engines": { "node": ">=22" }`) and in `.nvmrc`; Vercel reads the `engines` field to pick its Node version, and `nvm use` reads `.nvmrc`.
- The project folder from GitHub: `dimitriphan/pallet-calculator`.

Install the dependencies exactly as locked:

```
npm ci
```

## The npm commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts a local copy with live reload, at http://localhost:5173. |
| `npm run build` | Checks the types, then builds the site into the `dist` folder. |
| `npm run preview` | Serves the built `dist` folder locally. Run `npm run build` first. |
| `npm run typecheck` | Checks the TypeScript types without building. |
| `npm run lint` | Looks for code mistakes with ESLint. |
| `npm run format` | Tidies the code layout with Prettier (it rewrites files). |
| `npm test` | Runs the unit tests (Vitest). |
| `npm run e2e` | Runs the end-to-end browser test (Playwright). It builds the site and starts a preview itself. |

The browser test needs Chromium. If it is not installed, run `npx playwright install chromium` once. If you already have a Chromium elsewhere, set `PW_CHROMIUM_PATH` to its location.

## Deploy on Vercel

The site is plain static files. There is no server and no database.

1. Sign in at vercel.com and choose **Add New > Project**.
2. Import the GitHub repository `dimitriphan/pallet-calculator`.
3. Set **Framework Preset** to **Vite**.
4. Set **Build Command** to `npm run build`.
5. Set **Output Directory** to `dist`.
6. Add no environment variables. The tool needs none.
7. Click **Deploy**. When it finishes, Vercel gives you a web address.

Every push to the connected branch deploys again automatically. The repository's `vercel.json` already holds the same settings.

## Other hosts

Netlify and Azure Static Web Apps work too. Use the same build command (`npm run build`) and the same output directory (`dist`).
