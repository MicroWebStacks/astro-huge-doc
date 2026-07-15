# Implementation: Isolate Vite Cache Directories Per Astro Subcommand

[######] Done - cacheDir keyed by Astro subcommand; verified against the exact reproducing sequence.

## Change

- `astro.config.shared.mjs`: `viteCacheDir()` reads `process.argv[2]` (the
  Astro subcommand: `dev`, `build`, or `preview`) and returns
  `node_modules/.vite-<dev|build|preview>`; wired in as `vite.cacheDir` in
  `baseAstroConfig()`, so every config entry point (`astro.config.mjs`,
  `astro.config.static.mjs`) picks it up automatically.
- Deleted the now-orphaned shared `node_modules/.vite` (pure build cache,
  safe to remove; regenerates on demand).

## Root cause

A live `pnpm dev` server (open on the PlantUML demo page) and a `pnpm build`
run in another terminal shared the default Vite dependency-optimization
cache. The build rewrote it mid-air; the dev server's in-memory optimizer
state still pointed at an on-demand chunk (`@plantuml/core`, pulled in only
when a diagram actually renders, via `plantuml-render.js`'s dynamic import)
that the build had removed from disk. The next request for that chunk hung
and returned 504. No rendering code was at fault.

## Verification

- Fresh `node scripts/dev.js` on an empty cache created `node_modules/.vite-dev`.
- Headless Chromium (`playwright`) against `/plantuml`: 8 diagrams rendered
  as SVG, 0 failed panels, 0 console/page errors.
- Ran `pnpm build` while that dev server stayed up: it created a separate
  `node_modules/.vite-build`; the dev server's `/plantuml` still answered 200.
- Re-ran the same headless check against the still-live dev server after the
  concurrent build: identical clean result (8 SVGs, 0 errors) — the exact
  previously-breaking sequence no longer breaks anything.
- `pnpm test`: 26/26 pass.

## Follow-up

The maintainer's own separate `pnpm dev` terminal (the one that hit the
original error, PID predating this fix) still needs a manual restart to pick
up the new cache-dir config — the fix cannot retroactively repair a running
process's already-initialized Vite state.
