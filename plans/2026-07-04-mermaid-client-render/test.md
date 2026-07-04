## Validation

### JavaScript syntax checks

- Command: `node --check scripts\diagrams.js`
  Expected: the renderer-routing changes parse cleanly.
  Actual: passed.

- Command: `node --check src\components\markdown\code\mermaid-render.js`
  Expected: the new client Mermaid renderer parses cleanly.
  Actual: passed.

- Command: `node --check src\components\panzoom\lib_panzoommodal.js`
  Expected: the modal source-selector extension parses cleanly.
  Actual: passed.

### Lite-profile Astro build

- Command: `$env:DOCS_PROFILE='lite'; $env:DOCS_BACKEND='json'; $env:ASTRO_TELEMETRY_DISABLED='1'; node_modules\.bin\astro.cmd build`
  Expected: the lite build compiles without requiring Kroki for Mermaid and emits the client Mermaid bundle.
  Actual: passed when run outside the sandbox after the dependency reinstall.

### Bundle-size checkpoint

- Observed client chunk: `dist/client/_astro/mermaid.core.CY6ngZvF.js`
- Size: `621.85 kB` minified, `149.08 kB` gzip
- Notes: Vite emitted the standard chunk-size warning for large chunks. Mermaid still split additional diagram-specific chunks beyond the core file.

## Environment notes

- `corepack pnpm install --config.confirmModulesPurge=false` had to be run after `pnpm clean --lockfile` because the prior lockfile failed the active supply-chain policy (`xlsx` integrity metadata missing).
- The sandboxed build hit `EPERM` reading `node_modules\...\astro.js`; rerunning the Astro build outside the sandbox succeeded.
- Native build scripts remained ignored by pnpm (`better-sqlite3`, `sharp`, `esbuild` variants), so this proof is the lite/json build path only.
