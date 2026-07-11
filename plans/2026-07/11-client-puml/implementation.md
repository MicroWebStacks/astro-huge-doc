# Client-Side PlantUML Rendering - Implementation

## Progress

[######] Done - Client PlantUML implementation is complete; interactive browser and installed VS Code visual checks remain recorded as validation gaps in `test.md`.

## Changes Made

- Added `@plantuml/core` 1.2026.6 and confirmed its public four-argument
  `renderToString()` API plus local `viz-global.js` classic-script requirement.
- Added browser-safe `src/libs/plantuml-theme.js` as the shared palette and
  theme-injection source for both client rendering and explicit Kroki fallback.
- Added `plantuml-render.js` with:
  - lazy local Viz script loading;
  - lazy dynamic PlantUML engine import;
  - one failure-tolerant serialized render queue;
  - raw-source theme injection and `mws:theme-change` re-rendering;
  - per-diagram generation guards against stale theme results;
  - an in-memory source/theme SVG cache;
  - visible in-shell errors that leave the source toggle usable.
- Generalized `DiagramCode.astro` from Mermaid-specific markup to a shared
  client-diagram shell. Mermaid and PlantUML now use inline SVG with the same
  toolbar, code toggle, pan/zoom source selector, and full-view modal path.
- Changed PlantUML's default renderer to `client` in `config.js` and
  `manifest.yaml`. BlockDiag stays on Kroki; explicit `plantuml: kroki` remains
  supported.
- Removed the PlantUML-only lazy-light endpoint, disk-cache route, `<object>`
  theme URL swapping, and related panzoom props/data attributes.
- Updated the project README, `.env.example`, extension README/setting text,
  demo index, demo PlantUML page, and Kroki compose description for the new
  renderer split and compatibility limitations.
- Expanded the PlantUML demo into a five-diagram serialized-queue fixture
  (sequence, class, activity, component, and database-backed layout) and added
  a linked `.puml` fixture.

## Decisions and Deviations

- The shared PlantUML palette was extracted from `diagram-render.js` rather
  than duplicated in the browser bundle. The Kroki helper re-exports the same
  theme API for compatibility.
- `viz-global.js` is emitted by Vite as a local asset and injected as a classic
  script; it is not loaded from a CDN or treated as an ES module.
- Persistent browser caching and automatic client-to-Kroki fallback were not
  added. An in-memory cache and explicit manifest fallback match the plan.
- No CSP relaxation was added. The built docs page is the iframe content and
  no implementation evidence justified adding `wasm-unsafe-eval` blindly.
- Interactive browser and installed VS Code visual proof could not be executed
  because no shared browser target was available in this session. This is a
  validation gap, not unfinished implementation; details are in `test.md`.

## Follow-Up Risks

- Verify the five-diagram page, dark-light-dark switching, error presentation,
  pan/zoom, and full view in a real browser and installed VS Code preview.
- Confirm sequence, class, and component rendering on Windows in VS Code, then
  add macOS/Linux evidence where practical.
- Client mode still cannot read arbitrary workspace `!include` files, and the
  package omits large optional sprite bundles. Documentation directs affected
  users to explicit Kroki routing.
