# Engine changelog

Release notes for the `@microwebstacks/md-render` npm package. The VS Code
extension has a separate changelog at `packages/vscode-extension/CHANGELOG.md`.

## 0.0.23 - 2026-07-29

### Fixed

- Preserved ordered, unordered, and nested Markdown list structure through the
  flat collected-item format so lists render as real `<ol>`, `<ul>`, and `<li>`
  elements instead of flattened paragraphs.
- Kept formatted text fragments beside links inline. Mixed paragraphs no
  longer gain nested paragraph wrappers that visibly split one authored line
  around a link.
- Stopped percent-decoding already-resolved filesystem paths. Images, blobs,
  and SVG text now load when a workspace directory contains spaces, a bare
  percent sign, or percent-like pairs such as `%20`, while percent-encoded
  authored asset targets continue to resolve normally.

## 0.0.22 - 2026-07-28

### Changed

- The app bar now fits one row at every width. Root sections are measured and
  progressively moved into a `More` disclosure that keeps the active section
  and Home reachable; at the narrowest widths the section region collapses to a
  compact active-section selector listing every root. Previously the bar
  wrapped at mid widths, and with many generated root folders the intrinsic
  link widths pushed the right-side controls off-screen.
- Secondary utility controls - external links, knowledge log, explore, graph,
  runtime information, and preview lock - consolidate into a labeled `Tools`
  disclosure below the existing 700px breakpoint. Pages, theme, and On this page
  stay directly reachable. The disclosure moves the original DOM nodes rather
  than copies, so each control keeps its state and event bindings.
- The desktop sidebar resizers are now symmetric and pointer-captured. Both
  sides clamp continuously at 40vw, suppress text selection while dragging,
  clean up on pointer cancellation or window blur, and keep the owning app-bar
  toggle and the persisted open state in sync when a drag opens or collapses a
  menu.

### Fixed

- Fixed the app bar and sidebars being able to widen the document. Navigation,
  the TOC, and the resize handles now have explicit shrink and clip boundaries,
  so no app-bar state produces page-level horizontal scrolling.
- Fixed the Pages wrapper lagging behind its divider during a resize drag. It
  now uses the same non-shrinking flex contract as the TOC wrapper.
- Fixed the Pages depth controls drifting horizontally as the pane widened.
  They are left-anchored with fixed button widths, so narrowing clips the
  trailing `All` control from the right without moving the leading `1`.

## 0.0.21 - 2026-07-27

### Fixed

- `public/` is now workspace-owned rather than engine-owned. Astro's
  `publicDir` resolves against the workspace root instead of the engine
  checkout, and SSR serves the live workspace `public/` directory. Previously
  `md-render build --workspace <docs>` copied the *engine's* static assets into
  the consumer's site and ignored the consumer's own, so root-absolute links
  like `/images/x.png` resolved to the wrong files or none at all.
- The published package no longer contains workspace content. 0.0.20 carried
  86.8 MB of one content set's images twice - once as `public/`, once mirrored
  into `dist/client/` - which npm rejected at publish time. Staging now enforces
  a size budget so extra files fail fast instead of at the registry.

### Added

- Added a local neighborhood graph for knowledge documents, opened from the
  relations footer, with pan and zoom, clickable nodes, and theme-aware
  colors.
- Added an `iframe` directive for embedded content such as video players.
- Added XLSX workbook tables, so a linked spreadsheet renders as a sortable
  Markdown table in both the full and lite profiles.
- Added image galleries, external `.glb` model viewers, and text-form details
  directives to the set of rendered Markdown features.
- Added collapsible page chrome: the app bar, breadcrumb band, and footer
  collapse behind one shared control that remembers its state.
- Added an optional site footer plus favicon and head branding for published
  static sites.
- Added an additive `files:` manifest entry that fetches loose files and
  folders (for example `public/data` and favicons) alongside content.
- Added a preview lock toggle to the app bar.

### Changed

- The lite profile now labels navigation from the document `title` rather than
  the filename slug, matching the full profile. Reading the frontmatter head
  keeps startup cost to a single small read per file.
- Frontmatter `order` is now honored consistently across profiles: documents
  the author pinned sort first in ascending order, and unpinned documents
  follow alphabetically instead of jumping ahead as order 0.
- The pages rail is denser - shorter rows, smaller text, and less indent per
  nesting level - so a section and its siblings fit on screen together.

### Fixed

- Fixed internal links dropping the configured `base` prefix, which broke
  navigation on sub-path deployments.
- Fixed static builds baking in the extension-preview surface.

Version 0.0.20 was staged with this same feature set but never published; the
registry rejected it for the packaging defect fixed above. Nothing was released
under that number.

## 0.0.19 - 2026-07-23

### Added

- Added a canonical source-route endpoint for extension previews so active
  Markdown editors can be resolved to their rendered routes.
- Added preview-local Back and Forward controls to the breadcrumb band. The
  controls retain rendered-route history across editor-follow navigation and
  are available on the Home route so forward history remains reachable.

### Changed

- Mobile Pages and On this page drawers now close after navigation, including
  links added by lazy menu loading, and persist their closed state before the
  destination loads.

### Fixed

- Fixed link-index start requests being rejected with HTTP 403 by sending the
  JSON content type required by Astro's origin-check middleware.

## 0.0.18 - 2026-07-21

### Added

- Added rich previews for internal page links, with delayed hover/focus cards,
  a larger modal view, warm iframe caching, URL state, and click-through
  navigation.
- Added knowledge-document identity and relation support: stable slug-based
  routes, typed frontmatter, resolved and unresolved links, backlinks,
  breadcrumbs, sibling navigation, and optional knowledge-log presentation.
- Added full-profile Explore pages for document types and tags, together with
  source diagnostics for malformed frontmatter, duplicate identities, and
  unresolved links.
- Added a bounded background relation index for the lite preview, including
  progress, pause, resume, and stop controls.
- Added safe rich-link rendering in Markdown table cells while retaining
  plain-text sorting and export behavior.

### Changed

- Standardized the Pages navigation across full, static, and lite modes. A
  directory landing page is represented by its directory node, while sibling
  Markdown files remain directly reachable.
- Details blocks now size to the prose column by default and expand only as
  needed for unwrapped overflowing code, up to the available article width.
- Concept metadata, breadcrumbs, and relation controls now use dedicated
  shell surfaces so authored Markdown remains visually distinct.

### Fixed

- Invalidated stale lite page-cache records after directive and table-link
  schema changes, so affected pages are reparsed automatically.
- Fixed collapsed details blocks rendering their code outside the disclosure.
- Fixed internal links inside rich Markdown tables and improved internal-link
  resolution and presentation throughout the rendered site.

## 0.0.17 - 2026-07-18

### Fixed

- Fixed GitHub Pages and other `full` + `json` + `static` builds failing when
  Vite attempted to resolve the absent native `better-sqlite3` package.
- Kept SQLite loading runtime-only and restricted to SQLite-backed deployments;
  JSON/static rendering no longer requires the native dependency to be
  installed.
- Added regression coverage preventing native SQLite imports from becoming
  statically resolvable in the JSON/static configuration graph.

## 0.0.16 - 2026-07-18

### Fixed

- Fixed `ERR_MODULE_NOT_FOUND: Cannot find package 'content-structure'` in
  published `@microwebstacks/md-render` installations.
- The collector now falls back to the engine's bundled
  `_modules/content-structure` package when the private workspace package is
  unavailable through normal Node resolution.
- The GitHub Action materializes the bundled private `content-structure`
  package into its isolated engine installation while keeping
  registry-installed dependencies authoritative.
- Updated `actions/setup-node` from v4 to v5, removing the deprecated Node 20
  action runtime. The renderer itself continues to use the configured Node 22+
  version.
