# Implementation log

[######] Stages 1–4 implemented (identity, schema, salvage, relations, reading UI, exploration, canonical Pages nav, lite link indexer, neighborhood graph). Closed 2026-07-24.

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

- Stage 3: authored `index.md` navigation (TP-11), `/explore` type/tag pages and the data-inconsistency report (TP-12), lite background link indexer + status bar (TP-16).
- Stage 4: neighborhood graph (TP-13), multi-bundle. *(The lite crawler moved to Stage 3 as TP-16 per DD-13.)*
- JSON server-mode deferred relations flush (~5 min) from DD-5 — collect-time relations cover the static JSON case; a long-running JSON server currently reuses the collect output as-is.
- `packages/md-render` is a staged copy: run `pnpm ext:stage-engine` before packaging the extension to pick up these src/ changes.

## 2026-07-19 (handover — Stage 3/4 design rulings, no code)

Second-round rulings from discussion with the user were baked into plan.md (§3 DD-11..DD-13, §4 TP-16, §6 stages, §7 log):

- **DD-11**: graph via adjacency maps + precomputed per-concept neighbors JSON; radial SVG in the panzoom modal; entry from RelationsFooter; explicitly no Cypher/graph engine.
- **DD-12**: `/explore` reached through type badge + tag chips (primary) and one app-bar icon (secondary); top text menu untouched; data-inconsistency report under `/explore`; full profiles only initially.
- **DD-13 / TP-16**: lite relations completed by a post-render, pausable, fence/heading-aware background line scan (no YAML/AST) with a bottom progress/status bar (pause/resume/stop); `scanned` entries upgraded to `parsed` on page open; RK-2's deferred crawler superseded, Stage-4 crawler item dissolved into Stage 3.

Next implementer: start Stage 3 = TP-11 (authored nav) + TP-12 (explore pages per DD-12) + TP-16 (indexer per DD-13).

## 2026-07-19 (styling rework — chrome vs content separation, user-requested deviation)

Reworked the Stage-2 reading UI so everything not authored in markdown sits on shell surfaces, clearly separated from the reading surface (classic docs-site chrome/content split):

- `.content` in [Layout.astro](../../../../src/layout/Layout.astro) now owns `--article-pad` (the article gutter, breakpoint-aware); a new `.page-chrome` full-bleed wrapper (global styles in Layout, wired in [\[...url\].astro](../../../../src/pages/[...url].astro) and [index.astro](../../../../src/pages/index.astro)) cancels the gutter so top chrome bands run edge-to-edge, hides itself when empty (`:not(:has(*))`), and collapses to plain flow in preview mode.
- [Breadcrumb.astro](../../../../src/layout/Breadcrumb.astro): full-bleed band on `--nav-bg-color` — same shell layer as the sidebars — closed by a 1px `--soft-border-color` line; text uses `--menu-text-color`. The app bar itself got a full-width `border-bottom` in Layout.astro so the bar visibly ends against the nav-colored row below (user refinement: a same-color continuation of the app bar left its long top edge unmarked).
- [FrontmatterPanel.astro](../../../../src/components/markdown/FrontmatterPanel.astro): both tiers (concept header and generic metadata panel) are now bands on `--nav-bg-color` (sidebar continuation) instead of a rounded `--surface-2-bg` card; each closes with the same 1px separator before the body.
- [RelationsFooter.astro](../../../../src/layout/RelationsFooter.astro): full-bleed closing band on `--nav-bg-color` with a 1px top separator, bleeding into the bottom gutter; "Referenced by" restyled as an uppercase chrome label (`--content-color-faint`); prev/next cards get `--content-bg-color` fill so they read as raised on the band; inner content capped at `--prose-measure`.

Validated: server build and static build against `demo/` (11 pages) both pass; built HTML/CSS carry the band classes, `--article-pad`, and the header/nav surface backgrounds. Reminder: run `pnpm ext:stage-engine` before packaging the extension to propagate these src/ changes.

## 2026-07-19 (handover — Stage 3 started, research only, no code changes yet)

Picked up "start Stage 3" per the previous handover note. This session ran a full codebase survey for TP-11/TP-12/TP-16 (read-only, no edits) and made concrete design calls below, but **wrote no code** before running low on context. Next session should implement directly from this section rather than re-surveying. The pre-existing uncommitted styling-rework diff (previous section above) was reviewed and confirmed coherent/complete — it predates this session, is unrelated to Stage 3, and can be left as-is or committed independently.

Two source trees exist: **`src/` is authoritative**; `packages/md-render/src/` is a generated copy (`pnpm ext:stage-engine`). Edit only `src/`.

### TP-12 (explore pages + data-inconsistency report) — implement first, most self-contained

**Diagnostics plumbing (new — nothing queryable exists today for duplicates/malformed-YAML; only `console.warn`)**:
- New `packages/content-structure/src/diagnostics.js`: module-level array with `resetDiagnostics()`, `recordDiagnostic(kind, path, message, relatedPath)`, `getDiagnostics()` — deliberately simple (mirrors this codebase's existing plain-`warn()` style, no DI threading).
- `frontmatter.js` lines 12 and 28 (both malformed-YAML `console.warn` call sites): also call `recordDiagnostic('malformed_frontmatter', filePath, error.message)`.
- `index.js` `collect()`: call `resetDiagnostics()` at top; at the duplicate-identity warn (line 81) also call `recordDiagnostic('duplicate_identity', entry.path, message, claimedUrls.get(urlKey))`; after the main loop, build `diagnosticRows` from `getDiagnostics()` tagged with `versionId` and call `writer.insertDiagnostics(rows)` when the writer exposes it and rows exist.
- `catalog.yaml`: add a `diagnostics` table — `id` (pk autoincrement), `version_id`, `kind` (values: `duplicate_identity`, `malformed_frontmatter`), `path`, `related_path`, `message`.
- `structure_db.js` (sqlite writer, ~line 133/173): add `diagnosticsSchema = requireTableSchema(schema,'diagnostics')` and an `insertDiagnostics(rows)` method mirroring `insertRelations` (`normalizeTableRow` + `insertRows(db,'diagnostics',...)`).
- `structure_json.js` (json writer, ~line 100): add `insertDiagnostics(list)` pushing a `diagnostics` array mirroring `insertRelations`'s shape; include it in the `dataset` object written to `content.json`.
- Reading side: `structure-db-sqlite.js` needs a `getDiagnostics()` gated by table-existence (mirror the `relationsAvailable(db)` check ~line 642); `structure-db-json.js` needs the equivalent reading `dataset.diagnostics` (tolerate absence for older datasets, mirror how `relations` is handled ~lines 87-100/411-463). **Lazy/lite backend: skip entirely** — DD-12 restricts `/explore` (and its report) to full profile only.
- Broken-links half of the report needs **no new plumbing**: query `relations WHERE status='unresolved'` (sqlite: gated by `relationsAvailable`; json: filter `dataset.relations`) — already exists from Stage 2.

**Query surface**:
- Add `getDocumentsFull()` (or similarly named) to `structure-db-sqlite.js` (~line 586, alongside the existing narrow `getDocuments()` which only projects `{url,title,level,sort_order,url_type}`) and `structure-db-json.js` (~line 375) returning full rows (`type`,`description`,`resource`,`tags`,`date`,`url`,`title`) via the existing `normalizeDocumentRow`. Lazy backend: omit or return `[]` (DD-12 lite gating — do not build a partial "visited pages only" view now, that's explicitly deferred).
- Add a slugify-for-grouping helper for type/tag values (OP-3: group by slugified form, display original casing) — reuse/extract `structure-db-sqlite.js`'s private `slugifyText()` (~line 232) or write an equivalent. Keep this a separate convention from the OKF path-identity `slugSegment()` in `structure-db-lazy.js` (different domain, don't conflate).

**Pages** (`src/pages/explore/`):
- `index.astro` — types/tags counts + the data-inconsistency report; mirror `src/pages/index.astro`'s simple shape (no `getStaticPaths`).
- `types/[slug].astro` and `tags/[slug].astro` — each with `getStaticPaths()` enumerating distinct slugified values (dedup per OP-3), mirroring `src/pages/[...url].astro`'s gating-comment convention (lines 11-14: the export is only invoked under `output:"static"`, ignored under `output:"server"` — same file works both ways, don't write two versions).
- Gate all three on full profile only (DD-12) — check how profile is read elsewhere (`Layout.astro`, `extension-preview.js`'s `extensionPreviewEnabled()`).

**UI wiring**:
- `AppBar.astro`: copy the log-clock `<li class="nav-toggle-item">` block (lines 61-71) verbatim for a new `/explore` icon (new inline SVG, own class e.g. `explore-link`, reuse the `a.log-link`-style `float:none; padding:var(--space-2)` CSS rule), placed next to the log icon. Always-on in full profile, no DD-8-style validation gate needed (unlike log.md), omitted in lite.
- `Layout.astro`: wire an explore-enabled flag through to `AppBar` the same way `logPage` flows today (`findKnowledgeLog()` at line 38 → prop at line 161).
- `FrontmatterPanel.astro`: turn `.concept-type` span (line 80) and `.concept-tag` span (line 81, inside `tags.map`) into `<a>` tags pointing at `/explore/types/<slugified type>` / `/explore/tags/<slugified tag>` (display text stays original casing). Needs new imports: `basePrefix` from `@/libs/blob-files.js`, `config` from `@/config`, plus the slug helper. **Leave the untyped/generic tier alone** (lines 109-121, plain joined-string tags) — DD-12 only covers the typed tier's badge/chips.

### TP-11 (authored nav) — design only, no code yet

- Write a **new dedicated builder**, not a reuse of `buildSectionMenuFromSourceEntries` (that function imposes file-tree-specific semantics — scoping to the active top-level section, dirs-before-files sort — that don't fit an authored TOC). E.g. `buildSectionMenuFromIndexNav(indexMarkdownAst, pathname, documents)` in `source_navigation.js`, producing the **same final node shape** as the existing builder (`nodeKey`/`label`/`link?`/`active`/`parent`/`expanded?`/`items?` — see `finalize()` at lines 181-195) so it flows through the same `SideMenu.astro`/`SubMenu.astro` and `lazy_navigation.js` renderers unchanged.
- Add a `synthesized: true` flag for nodes that don't correspond to a literal authored link (or the reverse case); `SubMenu.astro` and `lazy_navigation.js`'s `renderList()` (~lines 19-63) both need to read/style it — keep them mirrored, per this module's existing header-comment convention.
- `SideMenu.astro` needs a Contents/Files toggle (`category` is currently just `"toc_menu"` vs everything else). Simplest per the research: **precompute both trees server-side** (full/static profiles) and toggle visibility client-side via CSS/JS, matching the existing depth-controls pattern in `menu_interactions_activation.js` — avoids new endpoints for SSR/static modes. Persist the toggle in localStorage the same way `state_key` already scopes depth state (~lines 57-61).
- Lite/extension mode: `/__lite/navigation` (`extension-preview.js:209-230`, `navigationPayload()`) needs a `?source=contents` branch that lazily parses `index.md` on demand (consistent with DD-9 — no bulk parsing) via the lazy backend's existing `getEntry`/`getItems`.

### TP-16 (lite background link indexer) — design only, no code yet

- Hook point is **inside** `structure-db-lazy.js`'s existing `relationsStore` (~line 103) and `updateRelationsForDoc()` (lines 111-160) — add `updateRelationsFromScan(doc, scannedRows)` writing into the **same** Map keyed by `doc.sid`, tagged with a new `provenance: 'scanned'|'parsed'` field (a separate axis from the existing resolution `status` field — don't conflate). The "scanned → parsed on page open" upgrade is **already free**: `updateRelationsForDoc()` already deletes-then-reinserts a doc's entry on every real parse (lines 138-142), so as long as the scanner writes into the same Map/key, opening the page naturally supersedes it — no new upgrade mechanism needed.
- Scanner algorithm (regex/line-based, no YAML/AST per DD-13): reuse the file list from `ensureTree().documents` (no new walk); reimplement the link-classification shape from `parseDocumentRecord()`'s existing block (lines 644-704) in cheap form — skip the frontmatter block, track code fences, remember the last `#` heading, regex inline links + reference-style + `<a href>`.
- Cap: **must reuse** `relationsCapBytes()` (line 106, reads `config.collect.relations_cache_mb`) — do not add a second budget.
- Trigger: NOT `extension.js`'s `warmFirstPage` (that's an extension-host-side timer with no visibility into in-page paint — confirmed no `postMessage` bridge exists between host and webview). Instead: a new client script reacting to `DOMContentLoaded` / the existing `microwebstacks:navigation-ready` event (dispatched by `lazy_navigation.js`'s `populate()`, ~line 100), waiting a grace delay, then hitting a new endpoint to kick off/poll the scan. The scan loop itself runs server-side (inside the Node dev-server process — `structure-db-lazy.js` or a sibling module — via a chunked `setTimeout` loop), **not** a native VS Code `StatusBarItem` (zero existing use of that API in `extension.js`; the "status bar" is in-page UI following the `/__lite/navigation` pattern: endpoint in `middleware.js` + `extension-preview.js`, poller script gated by `extensionPreviewEnabled()` in `Layout.astro`).
- New endpoint (e.g. `/__lite/index-status`) returning `{running, current, total, paused}`; pause/resume/stop via companion POST endpoints toggling module-scope scanner state in `structure-db-lazy.js` (same style as the existing `relationsStore`/`loadedDocs` module state).
- No `extension.js` lifecycle hook needed beyond the server process's existing lifetime per the research, but this is the piece most likely to surprise once actually coded (file-watcher interaction on `tree.stamp` changes, concurrency with in-flight page-open parses) — budget extra care and testing here.

### Next-implementer order

1. TP-12 diagnostics plumbing (`diagnostics.js` + `frontmatter.js` + `index.js` + `catalog.yaml` + `structure_db.js` + `structure_json.js`) — small, self-contained, do this first.
2. TP-12 reading-side helpers (`getDocumentsFull()`, `getDiagnostics()` on sqlite + json backends).
3. TP-12 pages + AppBar + FrontmatterPanel wiring; validate with `pnpm test` + the demo collect/build commands already documented in `test.md`.
4. TP-11, then TP-16, using the design notes above.
5. Remember `pnpm ext:stage-engine` before packaging the extension.

## 2026-07-19 (Stage 3 implemented)

Implemented TP-11, TP-12, and TP-16 from the preceding handoff. Stage 4 remains open.

### TP-12 — exploration and diagnostics

- Added collection-scoped diagnostics for malformed frontmatter and duplicate identities, persisted in the new `diagnostics` table for SQLite and the JSON dataset. Findings are explicitly data inconsistencies, not OKF compliance results.
- Added full-document, diagnostics, and unresolved-link query surfaces to the full SQLite/JSON backends. Queries resolve against the active document version so an issue-free collection cannot surface stale findings from an older version.
- Added full-profile `/explore`, `/explore/types/[slug]`, and `/explore/tags/[slug]` routes, static-path generation, facet grouping by normalized slug with original labels retained, and a combined source-diagnostics/unresolved-links report.
- Added the full-profile app-bar Explore entry and linked typed concept badges/tag chips to their facet pages. Lite intentionally exposes neither partial facets nor the Explore entry.

### TP-11 — authored navigation

- Added a dedicated `index.md` AST navigation builder. The closest ancestor `index.md` supplies authored list hierarchy; pages omitted by the author remain reachable as visibly marked synthesized entries.
- Added a persisted Contents/Files switch to both desktop and mobile page menus. Full/static profiles precompute both trees; lite fetches `source=contents` after paint and parses only the selected section's index on demand.
- Kept the existing file-tree builder and rendering node contract intact; both Astro-rendered and client-rendered menus understand the synthesized marker.

### TP-16 — lite background relation index

- Extended the existing capped in-memory relations store with `scanned`/`parsed` provenance. The fence/frontmatter/heading-aware line scanner extracts inline, reference-style, shortcut-reference, and HTML-anchor links without YAML or Markdown AST parsing; opening a page atomically replaces its scanned rows with parsed rows.
- Added bounded 50-file timer ticks, exact case-sensitive path resolution against the existing file tree, tree-stamp invalidation, cap eviction accounting, and pause/resume/stop controls that retain the partial cursor and graph.
- Added gated `/__lite/index-status` and POST `/__lite/index-control` endpoints plus a post-render in-page progress bar. It reports scan/memory/eviction state and dismisses itself after completion.
- Expanded opened-page link classification to cover anchors, extensionless document links, assets, public files, and unresolved targets so a parsed upgrade does not discard valid edges discovered by the scanner.

### Packaging handoff

- Built the lite SSR engine and ran `pnpm ext:stage-engine`; `packages/md-render` now contains the staged Stage 3 runtime and vendored dependencies. No extension package was produced.

## 2026-07-21 (TP-11 simplified)

The authored-navigation implementation above was superseded after review. The sidebar now has one canonical **Pages** tree in every run mode:

- `index.md` keeps its reserved landing-page role and is folded into the corresponding directory node.
- Other renderable files remain ordinary child entries.
- Markdown lists and links inside `index.md` render on the landing page but no longer redefine sidebar order, labels, or grouping.
- Removed the Contents/Files switch, its persisted source state, authored-index AST navigation builder, synthesized-entry presentation, and the lite `source=contents` request branch.
- Full/static rendering uses the existing source-entry tree directly; lite performs one post-paint navigation request against the same tree contract.
- Replaced the authored-navigation test with a focused invariant test for a linked directory landing node plus visible sibling pages.

This preserves OKF landing-page support while removing content-dependent application navigation. Stage 4 remains pending.

## 2026-07-24 (Stage 4 — neighborhood graph, TP-13 per DD-11)

Implemented the last open item: the local neighborhood graph. No query engine, per DD-11 — plain adjacency built from two hops of the existing `getOutgoing`/`getBacklinks`/`getDocument` calls, answered by whichever backend `@/libs/structure-db.js` dispatches to (sqlite, JSON, or lite's in-memory store), so there is no separate collect-time writer.

- **Data layer** — new `src/libs/graph.js`: `computeNeighbors(sid, backend = <real dispatcher>)` returns `{center, nodes, edges}` for center + ring 1 (direct resolved neighbors, both outgoing and backlinks) + ring 2 (each ring-1 node's own resolved neighbors). Ring 1/ring 2 are capped (`MAX_RING1`=30, `MAX_RING2`=40) and sorted by type then title for deterministic truncation. Every node carries a `neighborCount` (its own total resolved-neighbor count) as the "1-hop stub" DD-11 asks for — lets the client show "+N" or re-center without a second guess-and-fetch, without recursing into a ring 3. Edges are deduped per directed `(source, target)` pair and store real link direction only; "outgoing vs backlink" is derived client-side from whether an edge touches the center, not stored as a separate field. `backend` is injectable (defaults to the real dispatcher) purely so the ring/edge/cap algorithm is unit-testable against a small in-memory fixture instead of a live collected dataset (`test/graph.test.js`).
- **Serving** — new `src/pages/graph/[sid].json.js`: same dual-mode convention as `[...url].astro`/the explore routes (`getStaticPaths` only invoked under `output:"static"`; the `GET` handler answers on-demand under `astro dev` and lite alike). Gotcha hit during verification: unlike `.astro` pages, a plain `.js`/`.ts` endpoint is **not** implicitly prerendered by a global `output:"static"` — Astro's prerender-metadata mechanism for chunking (`plugin-prerender.js`'s `getPrerenderMetadata`) only reads compiler-extracted `pageOptions` from `.astro` files. An endpoint needs its own `export const prerender = true;`; `astro dev` ignores the export entirely (dev never prerenders), so it has no effect on the lite/dev-server path. `getStaticPaths` returns `[]` for the lite profile (never statically built).
- **Rendering** — new `src/layout/graph_view.js` (`buildGraphSvg`, pure string builder, no DOM) and `src/layout/graph_entry.js` (fetch-on-click driver). Deterministic radial layout: ring 1 and ring 2 each evenly spaced on their own circle (no force simulation), sorted order from the payload. Reuses the existing panzoom modal (`src/components/panzoom/panzoommodal.astro`, the same infrastructure `DiagramCode.astro` uses) rather than building new pan/zoom — the render target starts as an empty hidden `<div class="graph-render-target">`; on click the driver fetches `/graph/<sid>.json`, injects the built `<svg>`, then dispatches the same `open` `CustomEvent` the diagram toolbar's expand button uses. Because the modal clones its source SVG via `XMLSerializer`/`DOMParser` (`lib_panzoommodal.js`) — which drops any JS event listeners — node navigation uses native `<a href>` and hover context uses native `<title>` elements instead of click handlers, and all styling is an embedded `<style>` inside the SVG itself (CSS custom properties still inherit across the shadow-DOM boundary the clone lands in; external page stylesheets do not).
- **Entry point (DD-11)** — a small "Graph" button added to `src/layout/RelationsFooter.astro`, gated on `sid` under the same `hasContent` condition as the rest of the footer (prev/next/backlinks). No VS Code extension button of any kind, and no separate app-bar icon — matches the ruling's "never the primary interface."
- **Verification** — `test/graph.test.js` (ring/edge/cap/dedup logic against a fake in-memory backend) and `test/graph-view.test.js` (SVG shape, XML escaping, url-linked-vs-static nodes, radial placement); `pnpm test` 78/78. Manually exercised `computeNeighbors` against the real lite/lazy backend with `demo/` content (`frontmatter-examples` → `knowledge/release-checklist`, real `link_text`/`source_heading`) to confirm the end-to-end path beyond the unit fixtures. Confirmed static generation emits real per-sid `/graph/<sid>.json` files under `astro build --config astro.config.static.mjs` with the full/sqlite profile (the repo's own `.env` defaults to `DOCS_PROFILE=lite` for local dev — needed `MICROWEBSTACKS_DOTENV_OVERRIDE=false DOCS_PROFILE=full` to exercise the static path directly).

Not done: no interactive click-through of the graph modal in a real browser/VS Code Extension Development Host (same category of gap as several other recent packets — client-puml, page-render-preview, preview-lock-appbar-button).

## 2026-07-24 (Stage 4 bugfix — graph button did nothing)

User report: the RelationsFooter Graph button opened nothing. Root cause was the `export const prerender = true;` in [graph/\[sid\].json.js](../../../../src/pages/graph/[sid].json.js): a prerendered dynamic route is matched against `getStaticPaths()` even under `astro dev` and the built server engine — the earlier "astro dev ignores this" note was a misdiagnosis. With the lite profile's `getStaticPaths` returning `[]`, the route had zero valid paths in every lite environment (local dev and the staged extension engine alike), so `/graph/<sid>.json` fell through to the `[...url].astro` catch-all, 404'd, and the click handler aborted with only a console warning.

Fix: removed the `prerender` export. Under `output:"server"` the endpoint stays on-demand (dev, lite engine, full server all answer live); under `output:"static"` Astro 5 prerenders endpoints by default, so the static build still emits the per-sid files — the original "endpoints are not implicitly prerendered under static output" gotcha was also wrong.

Verified: lite dev fetch of `/graph/<sid>.json` returns the payload (was 404); Playwright click-through on `demo/` confirms the modal opens with the radial SVG (2 nodes, 1 edge, correct colors) — closing the "no interactive click-through" gap above for the browser case; full-profile static build emits all 10 `/graph/<sid>.json` files; `pnpm test` 78/78. Reminder still stands: run `pnpm ext:stage-engine` before packaging so the staged engine picks up the fix.

## 2026-07-24 (graph modal theming — user-reported readability fix)

In dark mode the graph was unreadable: the shared lightbox surface is deliberately "always light" (`--lightbox-surface-bg`, right for photos/static kroki diagrams that carry their own dark ink), but the graph SVG is drawn with theme tokens — dark-mode ink on a light surface.

Resolution per the palette's own convention ("client-rendered follows the active site theme", like mermaid/plantuml): the graph modal surface now follows the theme instead of the SVG following the lightbox. [RelationsFooter.astro](../../../../src/layout/RelationsFooter.astro) overrides the modal surface/border/close colors with content-surface tokens, scoped to `.graph-entry` only — diagram and image lightboxes keep their always-light look. [graph_view.js](../../../../src/layout/graph_view.js)'s embedded style was retuned for contrast on the content surface: edges/arrowheads `--content-color-faint` (was `--soft-border-color`, too faint), node fill `--surface-2-bg` + stroke `--menu-border-left-color` (was content-bg fill, invisible on the now-matching modal), center fill `--menu-active-color`.

Verified with Playwright screenshots of the open modal in both `data-theme="dark"` and `"light"` on `demo/` — labels, node outlines, and edge colors readable in both; `pnpm test` 78/78. Same packaging reminder: `pnpm ext:stage-engine` before packaging the extension.

## 2026-07-24 (graph node clicks — user-reported: links unclickable, only pan/zoom works)

User could hover nodes (native `<title>` tooltip showed) but clicking never navigated. Node navigation relied on native SVG `<a>` activation from inside the panzoom modal's shadow root — exactly the environment-dependent path: panzoom `preventDefault`s touch sequences, and some hosts don't activate shadow-DOM SVG links on click at all. Two more defects surfaced while reproducing: a pan that *starts on a node* fired a native click on release (the svg pans with the cursor, so press/release land on the same node) and navigated away mid-exploration; and every graph open pushed `?modal=null` (the graph container had no `data-name` for `window_url_add_modal`).

Fix in [graph_entry.js](../../../../src/layout/graph_entry.js): explicit delegated navigation on the modal — pointer events stay composed across the shadow boundary, so a `pointerdown`/`pointerup` pair resolves `a.graph-node` via `composedPath()`, navigates via `location.assign` only for unmodified primary-button presses within a 5px movement tolerance, and a companion `click` listener suppresses the now-redundant native activation (drags no longer navigate; ctrl/middle-click keep native semantics). [RelationsFooter.astro](../../../../src/layout/RelationsFooter.astro) adds `data-name="graph"` so the URL marker reads `?modal=graph`. (An Astro gotcha: JSX-style `{/* */}` comments are not valid in template position — broke the dev compile, removed.)

Verified with Playwright on `demo/`: clean click navigates; 3px-jitter click navigates; 120px drag starting on a node stays on the page; pan-then-click navigates; open URL carries `?modal=graph`. `pnpm test` 78/78. Same packaging reminder: `pnpm ext:stage-engine`.
