# Diagram Width Contract — Implementation

## Progress

[#####-] Implemented + verified — awaiting maintainer review before closure.

Decisions applied: D1 = Option B, D2 = all diagram paths, D3 =
`--prose-measure` token (approved 2026-07-12).

## Changes

- `src/layout/tokens.css` — new `--prose-measure: 80ch` token documenting the
  reading measure; the only place the literal remains.
- `src/layout/Layout.astro` — prose caps for `p`, `ul`/`ol`, `blockquote` now
  use `var(--prose-measure)`.
- `src/components/markdown/code/Highlighter.astro` — code shell width now
  `min(100%, var(--prose-measure))`.
- `src/components/markdown/code/DiagramCode.astro`
  - `.diagram-shell` width implements D1-B:
    `min(100%, max(var(--prose-measure), calc(var(--diagram-natural-width, 0px) + var(--space-3) * 2 + 2px)))`
    — prose measure for small diagrams, grows with the diagram's natural
    width plus the surface chrome (2×12px padding + 2×1px border) up to the
    content column. The var defaults to `0px`, so with no JS the shell
    behaves exactly like the old `min(100%, 80ch)`.
  - Static (Kroki) path: `applyStaticDiagramWidth()` reads the loaded
    `<object>` SVG document (same-origin), takes the natural width from a
    non-percentage `width` attribute or the `viewBox`, publishes
    `--diagram-natural-width` on the shell and caps the `<object>` with an
    inline `max-width` so static diagrams also never upscale.
- `src/components/markdown/code/plantuml-render.js` — `fitSvgToWidth()`
  additionally publishes the natural width on the closest `.diagram-shell`.
- `src/components/markdown/code/mermaid-render.js` — new
  `publishNaturalWidth()` re-publishes Mermaid's own inline `max-width`
  (falling back to the `viewBox` width) on the shell after every render,
  including theme re-renders.
- `demo/readme.md` — wide Mermaid fixture (10-participant sequence diagram,
  natural width 2088px) added in the previous session; kept as fixture.
- `demo/plantuml.md` — new wide PlantUML fixture (10-participant sequence
  diagram, natural width 1160px); page now has six diagrams.

## Notes

- The shell var is set per render, so theme-triggered re-renders refresh it;
  values are theme-independent in practice (verified identical).
- Cross-realm caution on the static path: the `<object>` document has its own
  realm, so the SVG root is detected by `tagName`, not `instanceof`.
- Pre-existing TypeScript diagnostics in `DiagramCode.astro` (untyped
  `params` indexing, `is:inline` hint) are unrelated and untouched.
