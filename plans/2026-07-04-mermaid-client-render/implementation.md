## Progress

[######] Done - implemented and validated; follow-ups noted below.

## Files changed

- `package.json`, `pnpm-lock.yaml`
- `config.js`, `manifest.yaml`, `compose.yaml`, `.env.example`
- `scripts/diagrams.js`
- `src/components/markdown/code/DiagramCode.astro`
- `src/components/markdown/code/mermaid-render.js`
- `src/layout/ThemeToggle.astro`
- `src/components/panzoom/panzoom.astro`
- `src/components/panzoom/panzoommodal.astro`
- `src/components/panzoom/lib_panzoommodal.js`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/README.md`

## Implementation facts

- Mermaid now routes through `client` in both manifest defaults and the no-manifest fallback config.
- `scripts/diagrams.js` skips any diagram language whose resolved renderer is `client`, so Mermaid no longer POSTs to Kroki or emits generated SVG assets.
- `DiagramCode.astro` now treats client-rendered diagrams as first-class diagram blocks instead of falling back to plain code when no SVG asset exists.
- Added `src/components/markdown/code/mermaid-render.js`, which dynamically imports `mermaid`, renders from an inert `<template>`, uses `securityLevel: 'strict'`, shows inline render errors, and re-renders on `mws:theme-change`.
- Theme re-sync is event-driven via `ThemeToggle.astro` dispatching `mws:theme-change` after applying the resolved theme.
- Fullscreen pan/zoom parity for Mermaid is included. `panzoommodal.astro` and `lib_panzoommodal.js` now accept a source selector so the modal can clone an already-rendered inline `<svg>`, not only an `<object>`/`<img>` URL asset.
- Local Docker compose now runs only the Kroki container needed for PlantUML/BlockDiag.
- VS Code extension docs/settings now describe Kroki as PlantUML/BlockDiag-only; Mermaid is documented as client-rendered.

## Open point resolutions

- `OP-001`: resolved by removing the `kroki-mermaid` sidecar and `KROKI_MERMAID_HOST` wiring from `compose.yaml`.
- `OP-002`: resolved by adding `mermaid` as a normal workspace dependency; the rebuilt lockfile resolved it to `11.16.0`.
- `OP-003`: resolved by measuring the lite-profile client build. The main Mermaid core chunk built to `621.85 kB` minified / `149.08 kB` gzip.
- `OP-004`: resolved toward inclusion. Mermaid now uses the existing fullscreen modal flow through the new inline-SVG source-selector path.

## Deviations and follow-ups

- `pnpm` required a lockfile rebuild because the previous lockfile failed the active supply-chain policy on the `xlsx` tarball entry. The rebuilt `pnpm-lock.yaml` is therefore part of this change.
- The reinstall created an untracked root `.pnpm-store/` directory in this workspace. I left it untouched rather than silently deleting workspace state.
- I updated the extension-facing docs/config files in scope. The root `readme.md` still reflects the older Kroki wording and should be aligned in a follow-up if you want the broader docs pass completed in the same packet.
