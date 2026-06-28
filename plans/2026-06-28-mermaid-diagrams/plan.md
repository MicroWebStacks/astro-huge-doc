# Mermaid Diagram Support

## Problem

Mermaid code blocks were partially recognized by the diagram generation script,
but linked Mermaid files were not collected by default and diagram renderer
configuration was still tied to a single `kroki.server` field.

## Scope

- Keep Kroki as the default online renderer.
- Add a general `diagram` manifest section for renderer URLs, language routing,
  and extension aliases.
- Support `.mermaid` and `.mmd` linked files.
- Keep the existing pre-rendered SVG asset flow unchanged.
- Improve source fallback when generated SVGs are missing.
- Ensure local `dev` startup runs diagram generation before Astro serves pages.

## Exit Criteria

- Mermaid, PlantUML, and BlockDiag route through configurable diagram renderer
  settings.
- Existing `kroki.server` manifests continue to work.
- Linked `.mermaid` and `.mmd` files can be collected and rendered.
- `npm/pnpm dev` prepares generated diagram SVG assets before starting Astro.
- Focused syntax checks pass for touched JavaScript files.
