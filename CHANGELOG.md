# Engine changelog

Release notes for the `@microwebstacks/md-render` npm package. The VS Code
extension has a separate changelog at `packages/vscode-extension/CHANGELOG.md`.

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
