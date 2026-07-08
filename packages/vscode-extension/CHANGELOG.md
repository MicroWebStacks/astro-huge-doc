# Changelog

## 0.0.12 - 2026-07-08

- No system Node.js or npm required anymore: the extension now runs its
  scripts on VS Code's own bundled runtime, falling back to a
  `MICROWEBSTACKS_NODE_PATH` override or a system Node only if that runtime
  can't be used.
- The VSIX now bundles a self-contained lite/json engine payload, so the
  first preview works fully offline or behind a corporate proxy; the npm
  registry is now only a fallback/explicit path (engine 0.0.7).
- Inline and block math (`$...$` / `$$...$$`) now renders with KaTeX.
- Fixed the PlantUML/BlockDiag "expand full view" button doing nothing on
  some pages.
- `microwebstacks.preview.docsRoot` now defaults to the manifest's
  `render.folder` when set, falling back to `output.content`.

## 0.0.11 - 2026-07-04

- Mermaid now renders client-side in the browser and no longer depends on
  Kroki, while PlantUML and BlockDiag continue using Kroki (engine 0.0.6).
- Mermaid diagrams now follow light/dark theme changes and support the full
  view modal in the preview.

## 0.0.10 - 2026-07-04

- Skip unreadable workspace folders while building the source tree, so preview
  startup no longer aborts on locked or permission-restricted cache
  directories (engine 0.0.5).

## 0.0.9 — 2026-07-04

First release under the new name **Markdown Site Preview**
(marketplace ID `microwebstacks.markdown-site-preview`, previously published
as `microwebstacks.microwebstacks-docs-preview`).

- Pages menu now mirrors the source folder structure in the lite preview
  (engine 0.0.4), matching the full website behavior.
- Outline shows per-section table and diagram markers.
- New browser-window icon, marketplace page with screenshot, and reworked README.
- Command titles renamed to the **Markdown Site Preview:** prefix.

## Earlier versions (as MicroWebStacks Docs Preview)

- **0.0.6** — fixed `EBUSY` error on engine cleanup under Windows.
- **0.0.5** — dispatcher bypass fix and engine upgrade (engine 0.0.3).
- **0.0.4** — first public marketplace release: file tree, outline,
  mermaid/plantuml/blockdiag diagrams via Kroki, sortable tables, Shiki
  syntax highlighting.
