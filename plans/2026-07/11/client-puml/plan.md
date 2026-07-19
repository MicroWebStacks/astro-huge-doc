# Client-Side PlantUML Rendering

## Goal

Move PlantUML from the default Kroki build/runtime path to the official
browser engine, `@plantuml/core`, while preserving the existing diagram UX and
theme. The normal Astro preview and the installed VS Code desktop preview must
render PlantUML without Java, a PlantUML server, or Kroki. BlockDiag and any
language explicitly configured for Kroki remain on Kroki.

The intended default routing is:

```text
Mermaid   -> client
PlantUML  -> client
BlockDiag -> Kroki
```

## Scope

- Add and inspect `@plantuml/core`, including the TeaVM PlantUML engine and
  local `viz-global.js` Graphviz runtime.
- Prove the browser engine with both a sequence diagram and a Graphviz-backed
  class diagram in the normal Astro preview and VS Code desktop preview before
  removing the existing Kroki PlantUML path.
- Add a lazy client runtime that loads only on pages containing PlantUML,
  renders with `renderToString()`, and serializes every render through one
  queue because the upstream engine has shared pending-render state.
- Generalize the existing client-diagram markup and inline-SVG behavior so
  Mermaid and PlantUML share the diagram/code toggle, pan/zoom, full view, and
  source handling where practical.
- Reuse `injectPlantumlTheme()` and the existing PlantUML palette, re-rendering
  from the untouched raw source on `mws:theme-change` with stale-render guards.
- Change the manifest and no-manifest defaults to `plantuml: client`, while
  preserving an explicit `plantuml: kroki` compatibility route.
- Verify both JSON and SQLite collection paths skip client-routed PlantUML,
  including linked `.puml` files, without creating rendered blobs or requiring
  Kroki.
- Once the client path is proven, remove PlantUML-only lazy-light endpoint,
  disk-cache, `<object>` URL-swap, and panzoom state that no longer has another
  consumer.
- Update VS Code setting text and project/extension configuration docs to
  describe Mermaid and PlantUML as client-rendered and Kroki as the BlockDiag
  and explicitly routed fallback.
- Measure the built PlantUML/Viz assets and confirm pages without PlantUML do
  not eagerly import or execute them.

## Milestones

### 1. Package and runtime feasibility

- Install the current stable `@plantuml/core` version resolved by pnpm and
  inspect its actual exports and asset layout rather than assuming paths or
  signatures.
- Serve `viz-global.js` as a local, offline-capable asset and load it once as a
  classic script before dynamically importing the engine.
- Build a minimal spike using `renderToString()` and verify sequence and class
  diagrams in a browser and inside the VS Code desktop preview.
- Determine whether Graphviz WASM needs any CSP change in the real preview;
  add one only if the spike proves it necessary and scope it narrowly.

### 2. Client renderer and shared diagram shell

- Add the guarded PlantUML client runtime with one engine promise, one Viz
  loader promise, and a single failure-tolerant render queue.
- Generalize `DiagramCode.astro` so PlantUML receives raw source and an inline
  output container through the established client-diagram shape.
- Insert rendered SVG inline and preserve the code toggle, responsive display,
  pan/zoom, full view, and supported link behavior.
- Show an in-shell error with the source toggle still usable when client
  rendering fails.

### 3. Routing, collection, and theme behavior

- Set PlantUML's default renderer to `client` in both `manifest.yaml` and
  `config.js`; leave BlockDiag on Kroki.
- Verify `runJson()` and `runSqlite()` skip PlantUML output rendering when it is
  client-routed and retain the explicit Kroki route when configured.
- Reuse the original raw source for every render, inject the current custom
  PlantUML theme once, and serialize theme-triggered renders with per-diagram
  generation guards so stale SVG cannot replace a newer theme.
- Add only a modest in-memory source/theme SVG cache if useful; correctness is
  the priority and persistent browser caching is excluded.

### 4. Compatibility and legacy cleanup

- Verify fenced diagrams, linked `.puml` files, five or more diagrams on one
  page, invalid source, and dark-light-dark switching.
- Inspect existing content and representative fixtures for local/remote
  `!include` usage and optional standard-library/sprite dependencies. Record
  any remaining client limitations and keep `plantuml: kroki` as the escape
  hatch; do not claim untested compatibility.
- After client rendering is proven in VS Code for both sequence and
  Graphviz-backed diagrams, remove the PlantUML-specific Kroki lazy-light
  endpoint, cache, data attributes, URL swapping, and `<object>` path without
  disturbing generic Kroki or BlockDiag behavior.

### 5. Documentation and release proof

- Update `readme.md`, `packages/vscode-extension/README.md`, `.env.example`,
  manifest/config documentation, and the Kroki setting description.
- Run the smallest focused checks during implementation, then `pnpm build` and
  the relevant JSON/SQLite collection validation.
- Record runtime, browser, installed VS Code preview, bundle-size, and no-Kroki
  evidence in `test.md` when implementation occurs.

## Dependencies and Decisions

- `@plantuml/core` is the required renderer. Java, `plantuml.jar`, CheerpJ,
  server wrappers, partial TypeScript renderers, and the PlantUML MCP server
  are not implementation alternatives for this packet.
- `viz-global.js` must be shipped locally; the default preview must remain
  self-contained and offline-capable.
- All PlantUML renders must be serialized. Parallel rendering with
  `Promise.all()` is outside the supported design.
- The existing `src/libs/diagram-render.js` theme helpers remain the palette
  source of truth. A second browser-only palette must not be introduced.
- The current Kroki PlantUML path stays intact until the browser spike passes
  for a sequence and Graphviz-backed class diagram in the VS Code desktop
  preview.
- BlockDiag and generic `renderKrokiDiagram()` support remain in place.

## Risks

- Graphviz-backed diagrams depend on Viz.js WASM and may expose a VS Code
  iframe/webview or CSP constraint that sequence diagrams do not.
- The upstream browser engine's shared state can cross-wire or lose concurrent
  renders unless every initial and theme-triggered render uses the same queue.
- Theme changes can race queued work; raw-source preservation and per-diagram
  generation guards are required.
- Browser rendering cannot automatically read arbitrary workspace files.
  Local `!include` may require later collect-time expansion, while remote
  includes also raise offline and security concerns.
- Optional sprite/standard-library bundles may not ship with the npm package.
  Compatibility must be described from actual tests rather than assumed.
- The PlantUML and Viz payloads are large; accidental eager imports would
  regress all documentation pages and the packaged extension.
- Removing the existing lazy-light path too early would eliminate the working
  fallback before the client renderer is proven.

## Non-Goals

- Moving BlockDiag away from Kroki.
- Embedding or downloading Java, bundling `plantuml.jar`, or launching a JVM.
- PNG/PDF PlantUML export.
- Persistent cache infrastructure such as IndexedDB, service workers, or a
  server-side client-render cache.
- An automatic client-to-Kroki fallback mode (`plantuml: auto`).
- Guaranteed compatibility with every optional sprite library or include
  form.
- macOS/Linux release claims without practical verification on those systems.

## Exit Criteria

- PlantUML defaults to the client renderer and renders in normal Astro and the
  VS Code desktop preview without Java, Kroki, or another PlantUML server.
- A Graphviz-backed class diagram and component diagram render successfully,
  not only sequence diagrams.
- At least five diagrams on one page render in stable order without missing or
  cross-wired SVG output.
- Dark-light-dark switching re-renders from raw source with one theme header,
  rejects stale results, and preserves pan/zoom and full view.
- The diagram/code toggle, visible error state, and linked `.puml` rendering
  work through the client path.
- Pages without PlantUML neither execute nor eagerly import the PlantUML/Viz
  runtime; asset sizes are measured and recorded.
- JSON and SQLite collection do not call Kroki or create rendered PlantUML
  blobs for client-routed content.
- BlockDiag remains on Kroki and users can explicitly route PlantUML back to
  Kroki for compatibility.
- PlantUML-only lazy-light endpoint/cache/URL-swap behavior is removed after
  the replacement is proven.
- Project and VS Code documentation accurately describe the renderer split
  and any verified include or sprite limitations.
- Implementation and verification evidence is recorded in
  `implementation.md` and `test.md` when the work is performed.
