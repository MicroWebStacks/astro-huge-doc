# Implementation log

[####--] Stages 1+2 implemented (identity, schema, salvage, relations, reading UI); Stage 3 (explore pages, authored nav) and Stage 4 (graph) remain.

## 2026-07-19

- Started Stage 1: full collection now uses slugified path segments for identity; frontmatter `slug` remains the only identity override and `title` is display-only.
- Added the `type`, `description`, and `resource` document columns; `timestamp` is mapped to the existing `date` column. Malformed YAML now retains document bodies while recovering parseable leading fields where possible.
- Added demo fixtures for generic and typed frontmatter, link classification, and `index.md`/`readme.md` landing priority. `manifest.yaml` already renders `demo/`, so no configuration switch was required.
- Recorded focused validation and the current local package-link limitation in `test.md`.

## 2026-07-19 (continued — Stages 1+2 completed)

Correction to the earlier note: `manifest.yaml` points `render.folder` at `content/`, not `demo/`; validation instead ran collects/builds against `demo/` via `MICROWEBSTACKS_DOCS_ROOT=demo` (see test.md).

### Stage 1 completion

- **Landing priority (TP-2, DD-2/OP-6)** — `get_url_type` in [collect.js](../../../../packages/content-structure/src/collect.js) now picks exactly one landing file per directory from the ordered list `index.md` > `readme.md` > `same-name-as-parent.md` (case-insensitive, one cached readdir per directory). The lite walk in [structure-db-lazy.js](../../../../src/libs/structure-db-lazy.js) mirrors it via the shared `pickLandingName` rule computed from each directory's listing.
- **Duplicate identity guard (OP-4)** — full collect ([index.js](../../../../packages/content-structure/index.js)) warns and ignores any document whose url is already claimed; the lite walk does the same (its previous `-2` rename suffix is removed per the ruling).
- **TP-15 config** — `collect.relations_cache_mb` (default 10) added to [config.js](../../../../config.js); it is the only new knob. No `okf.enabled`, no identity toggle.

### Stage 2

- **Link resolution pass (TP-5, DD-3/OP-1)** — new [relations.js](../../../../packages/content-structure/src/relations.js) runs after collection and classifies every recorded link: `resolved` / `asset` / `public` (root-absolute checks content root first, `public/` only as existence fallback) / `external` / `unresolved`. Case-sensitive matching with URL-decoding only; anchor-only links are skipped. Best-effort fallbacks: extension-less targets try `<target>.md`, directory targets resolve to the directory's landing document.
- **Relations storage (TP-6, DD-5)** — new `relations` table in [catalog.yaml](../../../../packages/content-structure/catalog.yaml) (`version_id, source_sid, target_sid, target_raw, fragment, link_text, source_heading, status, external`). Sqlite writer inserts rows into the table; JSON writer exports a `relations` array in `content.json`. Lite keeps a strictly in-memory store built incrementally from visited pages, capped (lossy eviction, cap from `relations_cache_mb`).
- **Backlink queries (TP-7)** — `getOutgoing(sid)` / `getBacklinks(sid)` / `resolveLink(docSid, rawUrl)` on all three backends and the dispatcher. Sqlite gates on table existence; JSON tolerates older datasets; lazy answers from visited pages only (RK-2).
- **Link rendering (TP-8)** — [Link.astro](../../../../src/components/markdown/Link.astro): resolved concept links navigate to the target route (fragment preserved) with class `concept`; unresolved links render as non-navigating, dashed-underlined text with a `?` marker and title tooltip; external links keep the arrow and gain `rel="noopener"`. The lite backend embeds outcomes in `ast.rel` at parse time (page-record version bumped to 4); full backends answer via `resolveLink`.
- **Frontmatter viewer / concept header (TP-9, OP-2/OP-5)** — new [FrontmatterPanel.astro](../../../../src/components/markdown/FrontmatterPanel.astro): typed pages get a compact concept header (type badge, tags, date, description, resource link, inspectable concept id) with remaining fields behind "Additional metadata"; untyped pages with frontmatter get a generic expandable "Metadata" panel. No compliance banners anywhere. `resource` is treated as untrusted (only http(s) is linked).
- **Breadcrumb + relations footer (TP-10, DD-10)** — new [Breadcrumb.astro](../../../../src/layout/Breadcrumb.astro) (path orientation, ancestors linked when they are documents) and [RelationsFooter.astro](../../../../src/layout/RelationsFooter.astro) (prev/next among same-parent siblings from `level`/`order`, plus contextual backlinks "Referenced by X under 'heading': 'link text'"). Wired in [\[...url\].astro](../../../../src/pages/[...url].astro) and index.astro; both hidden in preview mode.
- **log.md (DD-8)** — validation gate in [layout_utils.js](../../../../src/layout/layout_utils.js) (`findKnowledgeLog`): root-level `log.md` with at least one date-like heading. Passing adds a clock icon to the app bar ([AppBar.astro](../../../../src/layout/AppBar.astro)) and a timeline treatment (rail + dots per heading) on the log page; failing leaves it a completely normal page. In lite the gate can only pass once the log page has been parsed (visited) — consistent with DD-9's no-bulk-parsing rule.
- **Lite frontmatter columns (TP-14, DD-9)** — the lazy per-page parse now applies non-identity document columns (`type`, `description`, `resource`, `tags`, `date`, `timestamp`→`date`) from frontmatter to the opened document's row, so the concept header/metadata panel works in the extension preview. Identity stays filename-derived.

### Bug found and fixed along the way

- better-sqlite3 cannot bind `Date` objects; unquoted YAML dates (`timestamp: 2026-07-19`) therefore crashed the sqlite collect (the JSON writer had masked this). `formatColumnValue` in [structure_db.js](../../../../packages/content-structure/src/structure_db.js) now serializes Dates to ISO strings and nested objects to JSON for scalar columns.

### Left for later stages

- Stage 3: authored `index.md` navigation (TP-11), `/explore` type/tag pages and the data-inconsistency report (TP-12).
- Stage 4: neighborhood graph (TP-13), background relations crawler for lite, multi-bundle.
- JSON server-mode deferred relations flush (~5 min) from DD-5 — collect-time relations cover the static JSON case; a long-running JSON server currently reuses the collect output as-is.
- `packages/md-render` is a staged copy: run `pnpm ext:stage-engine` before packaging the extension to pick up these src/ changes.
