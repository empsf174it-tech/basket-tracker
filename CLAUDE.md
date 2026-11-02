# Shooting Form Lab

Read `SPEC.md` before each stage. It is the source of truth for scope, metrics, targets and stages.

## Stack
Vite + React 18 + TypeScript (strict), Tailwind, Zustand, Dexie (IndexedDB), Chart.js,
vite-plugin-pwa, Vitest, ESLint + Prettier. Pose: `@mediapipe/tasks-vision` PoseLandmarker
(lite / full / heavy, GPU with CPU fallback), models and wasm served from `public/mediapipe/`.
Deployed to GitHub Pages by `.github/workflows/deploy.yml` (Vite `base` from `BASE_PATH`).

## Architecture rules
- `src/engine/`: framework-agnostic TypeScript, no React imports. Pure and unit-tested.
- The per-frame loop (camera → pose → smoothing → detector → overlay) runs outside React,
  on refs and a canvas. React gets throttled snapshots (≤ ~10 Hz). Never put per-frame
  landmarks in React state.
- Keep the engine interface small enough to move inference to a Web Worker later.
- `src/ui/` screens and components, `src/store/` Zustand, `src/db/` Dexie schema and repo.
- Do not invent joint-angle targets: joint angles use the personal-baseline mode in SPEC.md.
- No make/miss or ball tracking until Stage 7, and only when the user says go.

## Stage workflow
- Work one stage at a time (SPEC.md → Stages). Commit after each stage, then STOP so the
  user can test on their phone.
- Before committing: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` all clean.

## Commands
`npm run dev` · `npm test` · `npm run lint` · `npm run build` (prepare-assets downloads the models)
