# OKF Support — Plan

Status: decisions ruled 2026-07-19 (see Resolution column in §3), ready for implementation planning
Inputs: [handoff.md](handoff.md) (product/spec handoff), [deep-research-report.md](deep-research-report.md) (ecosystem research)
Scope: content parser (`packages/content-structure`), rendering engine (`packages/md-render`), VS Code extension (lite profile), demo site (`src/`)

---

## 1. Approach: OKF-native by default, best-effort matching

Two strategies were on the table:

1. **Opt-in detection** — identify OKF-compliant content and switch on an "OKF mode" that reinterprets it.
2. **OKF-native defaults** — make the engine's default behavior coincide with OKF semantics wherever they don't conflict with existing behavior.

**Decision: OKF-native (option 2), refined by the rulings to "best-effort OKF matching".** We are not strictly-OKF-compliant and not OKF-only: the engine takes everything useful OKF offers (path identity, reserved files, relations from links, recommended metadata fields) as native default behavior, per-field and per-file — never as a global mode switch. There is **no `okf.enabled` flag, no compliance detection, no compliance reporting**: if `type` is present the page gets concept treatment, if not it gets generic treatment, and nothing warns about non-compliance (OP-2, OP-5). Diverging from the v0.1 draft where our design is better is explicitly acceptable (RK-3).

## 2. What already aligns (no changes needed)

| Aspect | Where | Status |
|---|---|---|
| Unknown frontmatter fields preserved | `partitionFrontmatter` → `meta_data` JSON column, [collect.js:415](../../../../packages/content-structure/src/collect.js#L415) | OKF §unknown-fields ✓ |
| Unknown `type` values accepted | `type` currently flows into `meta_data` untouched | ✓ (promotion to column is additive, see TP-3) |
| Broken links don't block rendering | Links render as raw hrefs, [Link.astro](../../../../packages/md-render/src/components/markdown/Link.astro) | ✓ (visual "unresolved" marking still missing) |
| Path-based identity fallback | `get_slug` falls back to `parse(path).name` when no `slug`/`title` frontmatter | ✓ for untitled docs only — see TP-1 |
| Lite profile identity | [structure-db-lazy.js:158](../../../../packages/md-render/src/libs/structure-db-lazy.js#L158): url = slugified relative path, frontmatter never read | **Already fully OKF-native** ✓ |
| `tags` / `date` / `lastmod` document columns | [catalog.yaml](../../../../packages/content-structure/catalog.yaml) documents table | ✓ maps to OKF `tags` / `timestamp` |
| Relationship raw material | `createLinkEntry` records url, text, title, containing heading per link | ✓ extraction exists; resolution does not (TP-5) |
| Anchor/heading slugs & fragments | heading slug pipeline in md_utils.js | ✓ fragment navigation works |

## 3. Design decisions and open points — with rulings

Kind: **DD** = design decision, **OP** = open point, **RK** = risk. All items were ruled on 2026-07-19; the **Resolution** column is authoritative where it differs from the original proposal.

| ID | Kind | Topic | Original proposal | Resolution (2026-07-19) |
|---|---|---|---|---|
| DD-1 | DD | **Identity default flip.** Full profile lets frontmatter `slug`/`title` rewrite the URL, violating OKF §8. | Path-first identity; `slug` explicit override; `title` display-only; `identity: legacy` escape. | **Resolved — path-based identity is the default.** Filenames with spaces/special chars are handled by **slugifying each path segment** (deterministic, same as lite's `slugSegment`) — no frontmatter needed for non-URL-safe names. Frontmatter `slug` remains an explicit override for cases where the slugified name is not wanted. `title` never affects identity. No legacy mode (see RK-1). |
| DD-2 | DD | **`index.md` vs `readme.md`.** OKF reserves `index.md`; GitHub convention is `readme.md`. | `index.md` wins as landing page, `readme.md` demoted to child page. | **Resolved — readme.md stays the default landing page.** OKF does not mandate rendering `index.md` as the default (it is an *optional* directory listing). Only when **both** exist in a folder does `index.md` take the landing role and `readme.md` is demoted to a normal child page. Landing-page selection becomes an ordered priority list (see OP-6). |
| DD-3 | DD | **Root-absolute link meaning.** OKF: `/x.md` is bundle-root-relative; our convention: leading `/` = `public/`. | `.md` links → content-root; other assets keep `public/`. | **Resolved — both, prioritized.** For any root-absolute reference: check **content root first**; only if the file does not exist there fall back to `public/` (and use it only if it exists there). Applies uniformly, not just to `.md`. |
| DD-4 | DD | **OKF fields in schema.** `type`, `description`, `resource` land in `meta_data` JSON, not queryable. | Promote to real columns. | **Resolved — promote all OKF-recommended fields** (`type`, `description`, `resource`; `timestamp` mapped to existing `date`; `title`/`tags` already exist) to `documents` columns in catalog.yaml. |
| DD-5 | DD | **Relations storage.** No relations table; backlinks impossible. | New `relations` table populated at collect, sqlite + JSON backends. | **Resolved — build the relations table, storage per backend:** **sqlite mode** → sqlite table. **JSON mode** → in-memory with **deferred persistence** (flush ~every 5 min only if content changed). **Lite mode** → strictly in-memory, built incrementally (see RK-2), **capped at ~10 MB default** with lossy eviction when full; cap user-extendable. Monitor memory usage in all in-memory variants. |
| DD-6 | DD | **Malformed frontmatter.** Currently the whole document is skipped. | Degrade to plain body + conformance flag. | **Resolved — salvage robustly.** Body rendering must never suffer from malformed YAML. Additionally attempt **partial YAML recovery**: truncate the YAML block before the error location and re-parse, to save the fields above the error. No conformance flag (see OP-5); a collector warning (data-inconsistency channel) is enough. |
| DD-7 | DD | **Bundle model.** | One implicit bundle = `contentdir`; multi-bundle postponed. | **Resolved — postponed.** No multi-bundle, no multi-context for now. |
| DD-8 | DD | **`log.md` treatment.** | Reserved, excluded from concept set, rendered as normal page. | **Resolved — recognize with validation gate.** Run a sanity check/validation on `log.md` structure. **Fails** → treat as a completely normal page. **Passes** → treat as special page and add an **icon in the top bar (next to info)** that opens the log in a dedicated, polished view. |
| DD-9 | DD | **Lite profile scope.** Lite never reads frontmatter at startup (perf ruling). | Metadata only for opened doc via lazy parse. | **Resolved — confirmed.** YAML frontmatter is read **only on page open or on demand** (e.g. future link-check from another page). No bulk YAML parsing at startup, ever. |
| DD-10 | DD | **Neighbor links** (revival of historic astro-huge-doc linking ideas). | Always-on neighbors strip, prev/next/parent + backlinks. | **Resolved — yes.** A **breadcrumb-style bar on top** (path/parent context) and a **relations footer at the bottom**: next, prev, and pages referencing this page (backlinks). Always-on, not OKF-gated; OKF metadata enriches when present. |
| OP-1 | OP | Case sensitivity + URL-encoding in link-target matching across OSes. | Case-insensitive fallback + warning. | **Resolved — spec-faithful, case-sensitive matching.** We do not violate the spec to accommodate case-colliding authors; if content authored on Linux collides on Windows, that is the author's problem. Keep URL-decoding/`/`-normalization only. |
| OP-2 | OP | What gets the metadata header. | Only typed docs get a header; untyped get nothing. | **Resolved — every page with frontmatter gets a viewer.** Two-tier treatment: `type` present → OKF concept header (special treatment of known fields); otherwise → **generic YAML frontmatter viewer**, ideally as an expandable section. **No compliance warning banner in any case.** The implementation must stay comprehensible and unbroken for non-OKF content. |
| OP-3 | OP | Type/tag normalization (`API Endpoint` vs `api-endpoint`). | Group by slugified form, display original, never rewrite source. | **Resolved — as proposed.** |
| OP-4 | OP | Duplicate identity after slugification (two files → one url). | Dedup guard + diagnostics warning. | **Resolved — warn and ignore.** Emit a file-tree parsing warning; the **second page is simply ignored**. No lazy renames, no hacky rename rules (referenced links couldn't know about them). Cross-OS authoring collisions are the author's problem. |
| OP-5 | OP | Conformance/diagnostics surface. | `conformance` field per document + warnings. | **Resolved — no OKF-compliance reporting at all.** Only **data inconsistencies** are warnings (broken links, duplicate identities, malformed YAML, invalid dates…). No conformance column, no compliance status in UI, no dedicated OKF compliance reports. |
| OP-6 | OP | `index.md` role in navigation. | Landing page only; authored nav later. | **Resolved — landing page only.** Landing-page selection is an **ordered priority list**: `index.md` → `readme.md` → same-name-as-parent `.md` → (existing fallbacks). Authored-index navigation menus remain Stage 3. |
| RK-1 | RK | URL breakage for sites relying on title-derived slugs. | `identity: legacy` config + emitted redirect map. | **Resolved — clean break.** Old title-derived URLs are simply ignored; **no legacy mode, no redirect map**. |
| RK-2 | RK | Relations cost / lite constraint (no startup parsing). | Collect-time pass, keep out of lite. | **Resolved — full modes complete, lite incremental.** Sqlite and JSON (static) modes build complete relations at collect time — required for static pages. Lite builds backlinks **incrementally from visited pages** into the growing in-memory relations store (DD-5 cap applies). A future background crawler thread or external service could complete it — **out of scope now**. |
| RK-3 | RK | OKF is a v0.1 draft; semantics may shift. | Depend only on the stable core. | **Resolved — non-issue.** We are best-effort OKF matching, not strictly compliant and not OKF-only. We take everything OKF offers even if unstable; diverging later is not a conceptual problem. |

## 4. Architecture touch points

Ordered roughly by pipeline position. "Stage" refers to §6. Updated to reflect the rulings above.

| # | Area | Location | Current behavior | Change | Stage |
|---|---|---|---|---|---|
| TP-1 | Identity / slug | `get_slug`, `entry_to_url`, `buildDocumentUid` — [collect.js:28-64](../../../../packages/content-structure/src/collect.js#L28-L64) | frontmatter `slug` > `title` > path | Path-first identity with **per-segment slugification** (align with lite's `slugSegment`); `slug` frontmatter = explicit override only; `title` display-only; no legacy mode (DD-1, RK-1) | 1 |
| TP-2 | Reserved files / landing priority | `get_url_type` [collect.js:144](../../../../packages/content-structure/src/collect.js#L144) and `urlTypeFor` [structure-db-lazy.js:138](../../../../packages/md-render/src/libs/structure-db-lazy.js#L138) | `readme.md` + same-name-as-parent → dir | Ordered landing priority `index.md` > `readme.md` > same-name-as-parent (DD-2, OP-6); demote `readme.md` to child page only when `index.md` coexists; recognize `log.md` with validation gate + special-view icon (DD-8) — keep both implementations mirrored | 1 |
| TP-3 | Schema | [catalog.yaml](../../../../packages/content-structure/catalog.yaml) documents table | no `type`/`description`/`resource` columns | Add columns for all OKF-recommended fields; `knownEntryFields` (schema-driven) then routes them out of `meta_data` automatically; map `timestamp`→`date`. **No conformance column** (DD-4, OP-5) | 1 |
| TP-4 | Frontmatter salvage | [frontmatter.js](../../../../packages/content-structure/src/frontmatter.js) + caller [collect.js:156](../../../../packages/content-structure/src/collect.js#L156) | malformed YAML ⇒ document skipped | Never skip: render body regardless; attempt truncate-before-error YAML re-parse to salvage fields above the error; emit data-inconsistency warning (DD-6) | 1 |
| TP-5 | Link resolution pass | `createLinkEntry` [md_utils.js:486](../../../../packages/content-structure/src/md_utils.js#L486) + new collect post-pass | links recorded, never resolved to documents | Classify each link (external / asset / concept / anchor); root-absolute: content-root first, `public/` fallback if absent in content root (DD-3); case-sensitive matching, URL-decoding only (OP-1); duplicate-identity targets: first wins, warn (OP-4) | 2 |
| TP-6 | Relations persistence | [structure_db.js](../../../../packages/content-structure/src/structure_db.js), [structure_json.js](../../../../packages/content-structure/src/structure_json.js), catalog.yaml | — | New `relations` table: `version_id, source_sid, target_sid, target_raw, fragment, link_text, source_heading, status, external`. Sqlite mode → DB table; JSON mode → in-memory + deferred flush (~5 min, on change); lite → in-memory only, ~10 MB cap (extendable), lossy eviction, memory monitored (DD-5) | 2 |
| TP-7 | Backlink queries | structure-db backends: [structure-db-sqlite.js](../../../../packages/md-render/src/libs/structure-db-sqlite.js), [structure-db-json.js](../../../../packages/md-render/src/libs/structure-db-json.js), [structure-db-lazy.js](../../../../packages/md-render/src/libs/structure-db-lazy.js) | — | `getOutgoing(sid)` / `getBacklinks(sid)` / `getNeighbors(sid)` accessors; lazy backend answers from the incrementally-grown store (visited pages only) rather than returning empty (RK-2) | 2 |
| TP-8 | Link rendering | [Link.astro](../../../../packages/md-render/src/components/markdown/Link.astro) | non-asset links pass raw href through; internal `.md` links emit dead hrefs | Look up resolved route for concept links; CSS classes for `external` (exists) / `unresolved` / `concept`; unresolved keeps text visible with marker, no dead navigation | 2 |
| TP-9 | Frontmatter viewer / concept header | new component in [markdown/](../../../../packages/md-render/src/components/markdown/) + [\[...url\].astro](../../../../packages/md-render/src/pages/[...url].astro) | frontmatter invisible to readers | **Every page with frontmatter**: expandable generic YAML viewer. `type` present: OKF concept header (type badge, description, tags, timestamp, resource link) with remaining fields in the expandable section. No compliance banner, no raw-YAML dump by default (OP-2, OP-5) | 2 |
| TP-10 | Breadcrumb + relations footer | [Layout.astro](../../../../packages/md-render/src/layout/Layout.astro), [AppBar.astro](../../../../packages/md-render/src/layout/AppBar.astro) | right rail = TOC only | **Top**: breadcrumb bar (path/parent context). **Bottom**: relations footer — prev, next (from `level`/`order`), and pages referencing this page (backlinks with link-text + source-heading context). Always-on for all content (DD-10) | 2 |
| TP-11 | Authored index nav | [source_navigation.js](../../../../packages/md-render/src/layout/source_navigation.js), [SideMenu.astro](../../../../packages/md-render/src/layout/SideMenu.astro), lazy_navigation | filetree-driven only | Parse `index.md` link structure into an alternate nav source; switchable Contents/Files; mark synthesized entries | 3 |
| TP-12 | Explore pages | new routes under [pages/](../../../../packages/md-render/src/pages/) (`/explore/types/…`, `/explore/tags/…`) | — | Type/tag views from documents columns (TP-3); slugified grouping, original values displayed (OP-3); static-build compatible. Data-inconsistency report (broken links, duplicates) — **not** an OKF-compliance report (OP-5) | 3 |
| TP-13 | Graph view | new, optional; candidate base: existing [panzoom](../../../../packages/md-render/src/components/panzoom/) + SVG | — | Local neighborhood graph per concept (1–2 hops, from `getNeighbors`); full-graph explorer later/optional package | 4 |
| TP-14 | VS Code extension (lite) | extension preview + planned hash-keyed lazy parse | frontmatter never read | Opened-document-only frontmatter viewer/concept header via lazy parse (DD-9); incremental relations from visited pages (RK-2); future crawler thread out of scope | 2–3 |
| TP-15 | Config surface | `set_config` [collect.js:437](../../../../packages/content-structure/src/collect.js#L437) + md-render config | — | **Minimal**: no `okf.enabled`, no identity toggle, no validation strictness. Only `relations` memory cap override (default ~10 MB) and reserved future `bundles:` key (DD-5, DD-7) | 1–2 |

## 5. Rendering step (second phase focus)

Reading-first, per handoff §13–14 — the document stays the center, semantics live at the edges:

1. **Frontmatter viewer / concept header** (TP-9) — every page with frontmatter gets the expandable viewer; typed pages get the concept header on top of it. Identity (concept id = slugified path) inspectable there.
2. **Breadcrumb + relations footer** (TP-10) — this is where the historic "link neighboring pages" ideas get enforced rather than revisited: breadcrumb on top for orientation, and at the bottom prev/next plus contextual backlinks ("Referenced under *Calculation*: '…MRR is calculated from…'"). Context comes free from the relations table (link text + source heading).
3. **`log.md` special view** (TP-2/DD-8) — when validation passes, an icon next to the info action opens the curated history in a dedicated view.
4. **Graph** (TP-13) — optional, neighborhood-first, never the primary interface. A per-concept neighbors JSON keeps it static-build compatible and avoids loading any global graph (handoff §26). Full-graph explorer only if the neighborhood view proves insufficient.

## 6. Suggested delivery stages

1. **Stage 1 — Native identity & recognition** (TP-1..4, TP-15): slugified path identity, landing priority list, schema columns, frontmatter salvage. *Engine becomes OKF-native; URLs change for title-slug sites (clean break, RK-1).*
2. **Stage 2 — Relations & reading UI** (TP-5..10, TP-14): resolution pass, relations table per backend, backlinks, link rendering states, frontmatter viewer/concept header, breadcrumb + relations footer. *The visible release.*
3. **Stage 3 — Navigation & exploration** (TP-11, TP-12): authored indexes, type/tag pages, data-inconsistency report.
4. **Stage 4 — Graph & beyond** (TP-13, multi-bundle, log timelines deep features, context export, background relations crawler for lite).

Stages 1+2 together correspond to the handoff's "minimum useful OKF support" (§31) minus type/tag explore pages (Stage 3), and deliberately dropping its conformance-status ideas per OP-5.

## 7. Rulings log

All DD/OP/RK items were ruled by the user on 2026-07-19; resolutions are recorded in the table in §3 (Resolution column) and propagated into §4–§6. Notable deltas from the original proposal:

- No legacy identity mode and no redirect map — clean URL break (RK-1).
- `readme.md` keeps its GitHub-convention landing role; `index.md` only wins on coexistence (DD-2).
- Root-absolute references check content root first, `public/` as existence-based fallback (DD-3).
- Generic frontmatter viewer for **all** pages with frontmatter, not just typed ones; no compliance banners or reports anywhere (OP-2, OP-5).
- Relations storage is backend-specific with a capped, lossy, incrementally-grown in-memory store in lite (DD-5, RK-2).
- `log.md` gets a validation gate before receiving its special view (DD-8).
