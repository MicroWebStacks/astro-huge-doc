# Changelog

## 0.0.21 - 2026-07-18

- Fixed a crash where a single document with malformed YAML front matter
  (e.g. an invalid alias) could abort collection or blank the whole preview.
  The offending document is now skipped and every other page still renders
  (engine 0.0.15).

## 0.0.20 - 2026-07-17

- PlantUML code blocks now get real syntax highlighting in the code view
  (toolbar "Show code" toggle and standalone blocks): comments, `@startuml`
  tags, preprocessor directives, keywords, arrows, strings, stereotypes, and
  color literals are colored in both light and dark themes via a dedicated
  grammar, matching what Mermaid blocks already had (engine 0.0.14).
- The outline menu now marks sections that contain an image with a small
  picture icon, alongside the existing table/code/diagram indicators
  (engine 0.0.14).
- Fixed a small vertical layout shift when hovering an image: the
  open-full-view button now always reserves its space and only fades in,
  instead of pushing the image down on hover.

## 0.0.19 - 2026-07-16

- Fixed unreadable text in PlantUML diagrams that use explicit element colors
  (e.g. `rectangle Foo #LightBlue`): element text now picks black or white
  automatically against the box it sits on, in both light and dark themes,
  instead of always using the theme ink. Colored notes and class/object
  members are covered too, and more deployment elements (storage, artifact,
  file, stack, hexagon, person) are themed on the Kroki server path
  (engine 0.0.13).
- Preview startup no longer times out on large cold workspaces: readiness is
  probed on a cheap endpoint instead of waiting for the first full page
  render, the progress notification reports elapsed wait time, and the first
  page warms up in the background — past a short grace period the preview
  opens and displays as soon as the page is ready.

## 0.0.18 - 2026-07-15

- New: a preview diagnostics panel, opened from a new ⓘ icon in the app bar.
  Shows engine version and commit, which server mode is running, workspace
  and docs paths, file/page counts, how many pages the lazy cache has parsed
  so far, live-reload/navigation endpoint health, and — per page — which
  diagrams render locally versus through a Kroki server (engine 0.0.12).
- Live-reload polling now only starts when something can actually signal a
  change, instead of polling on a fixed interval regardless.

## 0.0.17 - 2026-07-13

- Large documentation folders now open without waiting for a full-site
  collection. The bundled lite engine builds a filename-only tree first, then
  parses and caches a page only when it is requested (engine 0.0.11).
- The Pages rail now loads the current top-level section after the article is
  visible, keeping initial navigation focused and responsive on large trees.
- Preview startup, page parsing, and navigation timings are logged locally in
  the extension output channel; no telemetry is sent.

## 0.0.16 - 2026-07-12

- Diagram panels no longer hard-cap at 80 characters: wide Mermaid, PlantUML,
  and Kroki diagrams now grow the panel up to the content column while never
  upscaling a diagram past its natural size (engine 0.0.9).
- Mermaid and PlantUML client rendering now share a single dispatcher, so an
  unsupported diagram language surfaces a visible error instead of silently
  staying blank.
- Fixed the table-of-contents losing manually expanded/collapsed branches
  when navigating to a heading outside them.

## 0.0.15 - 2026-07-11

- Fixed a cross-window upgrade race where a VS Code window still running an
  older extension could remove the newer bundled engine while another window
  was extracting it. Engine cleanup now removes only strictly older versions,
  never newer ones, and extraction uses a protected temporary location that
  can complete even during an in-place Marketplace update.
- Failed activation directories are removed immediately, while abandoned
  activation artifacts older than one hour are reclaimed automatically on a
  later successful startup (engine 0.0.8, unchanged).

## 0.0.14 - 2026-07-11

- PlantUML now renders client-side by default, so Mermaid and PlantUML diagrams
  work without Java, Docker, or an external Kroki service. PlantUML can still
  be routed to Kroki from the manifest when server-side rendering is needed.
- Refined the preview layout and navigation controls, including the initial
  viewport, sidebar behavior, app bar, links, headings, and table-of-contents
  interactions (engine 0.0.8).
- Added focused local diagnostics for corporate endpoint or filesystem-policy
  failures during bundled-engine activation.

## 0.0.13 - 2026-07-10

- The bundled offline engine now ships inside the VSIX as a single
  authenticated package (a manifest plus one packed archive) instead of
  tens of thousands of loose files. Packaging and installation are both
  much faster, and antivirus/indexer overhead from scanning huge file
  counts on Windows is gone. No change to what the engine does or which
  version is bundled (engine 0.0.7, unchanged).

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
