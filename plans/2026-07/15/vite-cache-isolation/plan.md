# Plan: Isolate Vite Cache Directories Per Astro Subcommand

## Problem

While the maintainer had `pnpm dev` open on the PlantUML demo page,
`pnpm build` ran in parallel during unrelated verification work and rewrote
the shared default Vite dependency cache (`node_modules/.vite`), which both
`astro dev` and `astro build` use unless configured otherwise. The dev
server's in-memory optimizer state still pointed at an on-demand chunk
(`@plantuml/core`, dynamically imported only when a diagram renders) that no
longer existed on disk after the build; the next request for it hung and
returned 504. No PlantUML/rendering code was at fault.

## Fix

`astro.config.shared.mjs` now sets `vite.cacheDir` to
`node_modules/.vite-<dev|build|preview>` based on `process.argv[2]` (the
Astro subcommand), applied uniformly to every config entry point
(`astro.config.mjs`, `astro.config.static.mjs`). A live dev/preview server and
a build can no longer share mutable optimizer state.

## Exit criteria

- A dev server and a build run concurrently against the same checkout
  without corrupting each other's Vite dependency cache.
- The exact reproducing sequence (dev server up, PlantUML page open, a build
  runs) no longer breaks PlantUML rendering.
- Durable rule captured in `specification/run-modes/spec.md`.
