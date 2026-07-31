# Changelog

## 0.0.28 - 2026-07-31

- Gallery lightboxes now have stable, shareable image URLs, and selecting an
  image from a link preview opens that exact image on the full page
  (engine 0.0.24).
- The neighborhood graph is now an interactive physics layout with dragging,
  depth and branch expansion, hover emphasis, fit/reset controls, and direct
  page-opening actions (engine 0.0.24).
- Single-page sections keep the Pages rail closed by default, and `toc: false`
  suppresses the On this page outline (engine 0.0.24).
- Resizing a preview across the mobile breakpoint now rebinds both navigation
  toggles to the visible rail or drawer and restores that mode's saved state
  (engine 0.0.24).
- Fixed spacing around collected inline fragments and frontmatter images whose
  paths contain spaces in lite preview mode (engine 0.0.24).

## 0.0.27 - 2026-07-29

- Removed runtime engine downloads from the extension. Installed builds now
  use only the engine bundled in the VSIX, so preview startup never waits on
  npm registry access; `enginePath` remains as a development override.
- First-use bundled engine activation now logs the local archive size and
  separate read, digest verification, extraction, validation, activation, and
  total timings. Cache hits are logged separately.
- Markdown lists now preserve ordered, unordered, and nested structure, and
  formatted text around links stays inline instead of breaking the paragraph
  into separate blocks (engine 0.0.23).
- Images and SVG text resolve correctly when the workspace path contains
  spaces, bare percent signs, or percent-like character pairs such as `%20`
  (engine 0.0.23).

## 0.0.26 - 2026-07-28

- The preview app bar no longer wraps or scrolls the page sideways in a narrow
  editor pane. Sections that do not fit move into a `More` menu that always
  keeps the current section and Home reachable, and at the narrowest widths the
  bar switches to a compact section selector (engine 0.0.22).
- In a narrow pane the secondary tools - external links, knowledge log,
  explore, graph, runtime information, and preview lock - now sit in a `Tools`
  menu, while Pages, theme, and On this page stay one click away
  (engine 0.0.22).
- Dragging the Pages and On this page dividers now behaves the same on both
  sides: the drag follows the pointer outside the pane, stops selecting text,
  recovers if the pointer is lost, and updates the matching app-bar toggle when
  a drag opens or collapses a rail (engine 0.0.22).
- Fixed the Pages depth buttons shifting sideways as you widened the rail
  (engine 0.0.22).

## 0.0.25 - 2026-07-27

- The extension is dramatically smaller. Its bundled engine no longer carries
  86.8 MB of unrelated documentation images, so the download and the engine copy
  hydrated into VS Code storage on first preview both shrink by roughly a third
  (engine 0.0.21).
- Root-absolute asset links (`/images/x.png`) in your own documents now resolve
  against your workspace's `public/` folder instead of the engine's
  (engine 0.0.21).
- The preview lock moved out of the VS Code editor title bar into the
  preview's own app bar. The toggle now relays through the webview, so it
  responds to clicks and stays in sync with the panel title (engine 0.0.21).
- The Pages rail now labels entries from each document's title instead of its
  filename, respects frontmatter `order`, and uses a denser row layout that
  fits a whole section on screen (engine 0.0.21).
- Preview now renders image galleries, embedded iframes, XLSX workbook tables,
  external `.glb` model viewers, and text-form details directives
  (engine 0.0.21).
- Knowledge documents gained a local neighborhood graph, opened from the
  relations footer (engine 0.0.21).
- Page chrome collapses behind one shared control with sticky state
  (engine 0.0.21).

Version 0.0.24 was packaged with this same feature set but never uploaded; its
bundled engine could not be published. Nothing was released under that number.

## 0.0.23 - 2026-07-23

- Preview now opens the rendered route for the active `.md` file, follows
  supported editor changes, and can be locked from the preview-panel toolbar.
- Fixed the preview lock/unlock action not appearing in the panel title
  toolbar, and stabilized its position with consistently prefixed labels.
- Added preview-local Back and Forward arrows beside the breadcrumb. Their
  per-workspace rendered-route history spans active-editor following and links
  opened inside the preview without entering VS Code's source-editor history.
- Preview servers, panels, watchers, and lifecycle operations are isolated per
  workspace folder, including scoped restarts after configuration changes.
- Closing a preview panel now disposes its workspace preview session.
- Removed the redundant **Markdown Site Preview: Open in Browser** command;
  preview is provided only in the embedded VS Code panel.
- Mobile navigation drawers now close reliably after selecting a destination,
  and starting the background link index no longer fails with HTTP 403
  (engine 0.0.19).

## 0.0.22 - 2026-07-21

- Internal page links now offer a delayed rich preview on hover or keyboard
  focus, with a larger modal view, warm caching, URL state, and click-through
  navigation (engine 0.0.18).
- Added knowledge-document features including stable slug-based routes, typed
  metadata, breadcrumbs, backlinks, sibling navigation, type/tag exploration,
  source diagnostics, and an optional knowledge-log timeline (engine 0.0.18).
- The Pages rail now uses one consistent directory-and-file tree across site
  and extension modes, including directory landing pages (engine 0.0.18).
- The preview builds a bounded background relation index after first render
  and exposes progress, pause, resume, and stop controls (engine 0.0.18).
- Markdown tables now render safe rich links while preserving plain-text
  sorting and export behavior (engine 0.0.18).
- Details panels size naturally around prose and wide unwrapped code, and
  stale cached records are reparsed automatically (engine 0.0.18).

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
  page warms up in the background â€” past a short grace period the preview
  opens and displays as soon as the page is ready.

## 0.0.18 - 2026-07-15

- New: a preview diagnostics panel, opened from a new â“˜ icon in the app bar.
  Shows engine version and commit, which server mode is running, workspace
  and docs paths, file/page counts, how many pages the lazy cache has parsed
  so far, live-reload/navigation endpoint health, and â€” per page â€” which
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

## 0.0.9 â€” 2026-07-04

First release under the new name **Markdown Site Preview**
(marketplace ID `microwebstacks.markdown-site-preview`, previously published
as `microwebstacks.microwebstacks-docs-preview`).

- Pages menu now mirrors the source folder structure in the lite preview
  (engine 0.0.4), matching the full website behavior.
- Outline shows per-section table and diagram markers.
- New browser-window icon, marketplace page with screenshot, and reworked README.
- Command titles renamed to the **Markdown Site Preview:** prefix.

## Earlier versions (as MicroWebStacks Docs Preview)

- **0.0.6** â€” fixed `EBUSY` error on engine cleanup under Windows.
- **0.0.5** â€” dispatcher bypass fix and engine upgrade (engine 0.0.3).
- **0.0.4** â€” first public marketplace release: file tree, outline,
  mermaid/plantuml/blockdiag diagrams via Kroki, sortable tables, Shiki
  syntax highlighting.
