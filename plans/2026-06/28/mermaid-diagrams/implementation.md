# Mermaid Diagram Support Implementation

## Progress

[######] Done - implemented and validated; follow-ups noted below.

## Changes

- Added `diagram.default_renderer`, `diagram.renderers`, `diagram.languages`,
  and `diagram.aliases` manifest support while keeping `kroki.server`
  compatibility.
- Added `.mermaid` and `.mmd` to default linked-file and text-compression
  extension lists.
- Updated `scripts/diagrams.js` to resolve supported diagram languages and
  renderer server URLs from config.
- Updated Markdown code and link rendering to detect diagrams from config
  instead of the local Kroki YAML helper.
- Changed unknown highlighter fallback from JavaScript to plain text.
- Made `scripts/diagrams.js` idempotently link existing diagram SVG metadata
  into the latest content version instead of requiring a fresh render.
- Added `scripts/dev.js` and routed `dev`/`start` through collect, diagram
  generation, and then Astro dev startup.
- Ran `scripts/diagrams.js` against the current local DB to generate missing
  Mermaid SVGs for version `CSJIAED`.

## Notes

The generated SVG asset model remains unchanged. `scripts/diagrams.js` still
writes `<asset_uid>.svg` rows and clears stale HTML cache after processing.
