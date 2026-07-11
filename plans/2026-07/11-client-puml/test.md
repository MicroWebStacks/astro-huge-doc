# Client-Side PlantUML Rendering - Validation

## Passed

### Package contract

- Installed `@plantuml/core` 1.2026.6.
- Package inspection confirmed:
  - ESM exports `render` and `renderToString`;
  - `renderToString.length === 4`;
  - `viz-global.js` is the required classic-script side effect;
  - optional large sprite libraries are not bundled.

### Theme and routing checks

- Focused Node check confirmed dark and light renders are each derived from the
  untouched raw source and receive exactly one theme header.
- Focused config check returned:

```text
plantuml=client, puml=plantuml, blockdiag=kroki
```

### JSON collection path

Commands:

```text
corepack pnpm@10.22.0 collect
corepack pnpm@10.22.0 diagrams
```

The JSON dataset discovered five fenced PlantUML blocks plus the linked
`.puml` fixture. `pnpm diagrams` reported all six as `Skipping
client-rendered diagram ... (plantuml)`, with no PlantUML Kroki render or SVG
blob generation.

### SQLite collection path

Commands were run with `DOCS_BACKEND=sqlite`, `DOCS_PROFILE=full`, and dotenv
override disabled for the process. Existing BlockDiag blobs stayed on Kroki,
while every fenced and linked PlantUML asset was reported as client-rendered
and skipped.

### Production build and emitted assets

Command:

```text
corepack pnpm@10.22.0 build
```

Result: passed.

Measured assets:

| Asset | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| PlantUML engine chunk | 6,400,893 | 1,422,303 |
| Viz/Graphviz classic script | 1,445,436 | 600,625 |

Built-output inspection confirmed:

- the loader references the local hashed Viz asset;
- the PlantUML engine remains behind `import()`;
- a page without diagrams contains no PlantUML/Viz runtime reference;
- the PlantUML page contains shared client markup and raw source payloads;
- the PlantUML page has no `<object>`, `light-svg`, or `data-theme-lazy` path.

### Other checks

- `packages/vscode-extension/package.json` parses as valid JSON.
- `git diff --check` passed.
- `corepack pnpm@10.22.0 check:plans` passed before closure.

## Not Verified in This Session

- The shared in-app browser reported no available browser targets, so actual
  SVG output, five-diagram queue behavior, dark-light-dark switching, invalid
  syntax presentation, pan/zoom, and full-view interaction were not visually
  exercised.
- The installed VS Code desktop preview was not interactively exercised.
- macOS and Linux runtime behavior was not tested.
- A disposable Node-only renderer probe reached the real PlantUML sequence
  engine but could not complete because the official browser build expects a
  DOM. It was removed and is not counted as runtime proof.

These are explicit post-implementation validation gaps; no browser or VS Code
runtime success is claimed here.
