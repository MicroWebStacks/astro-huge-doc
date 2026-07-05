# Mermaid Diagram Support Test Proof

## Commands

- `node --check config.js`
- `node --check scripts/diagrams.js`
- `node --check scripts/dev.js`
- `node --check src/components/markdown/code/highlighter.js`
- `node -e "import('./config.js').then(({config}) => { ... })"`
- `pnpm build`
- `corepack pnpm build`
- `& { $env:ASTRO_TELEMETRY_DISABLED='1'; .\node_modules\.bin\astro.cmd build }`
- Temporary empty-DB smoke test for `node scripts\diagrams.js`
- `node scripts\diagrams.js`
- `Invoke-WebRequest -UseBasicParsing http://localhost:4322/`
- `Invoke-WebRequest -UseBasicParsing http://localhost:4322/assets/7f:..code-1.mermaid.svg`

## Results

- JavaScript syntax checks passed.
- `scripts/dev.js` syntax check passed.
- Config import smoke confirmed `mermaid` routes to `kroki`, `mmd` aliases to
  `mermaid`, and the default renderer server resolves to `https://kroki.io`.
- Bare `pnpm build` could not run because `pnpm` is not on PATH.
- `corepack pnpm build` could not run because Corepack's dependency check tried
  to invoke bare `pnpm install`, which is also not on PATH.
- Direct Astro build passed with telemetry disabled:
  `ASTRO_TELEMETRY_DISABLED=1 node_modules\.bin\astro.cmd build`.
- `scripts\diagrams.js` smoke test passed against a temporary DB with no
  diagram-capable assets, required no Kroki network call, and cleared
  `html_cache`.
- Live diagram generation against `dataset/content.db` created
  `..code-1.mermaid.svg` for version `CSJIAED` and cleared `html_cache`.
- Localhost check confirmed `/` contains `/assets/7f:..code-1.mermaid.svg`.
- Direct asset check confirmed `/assets/7f:..code-1.mermaid.svg` returns
  `200 image/svg+xml`.
