# OKF Support — Plan

Status: proposal, awaiting review
Inputs: [handoff.md](handoff.md) (product/spec handoff), [deep-research-report.md](deep-research-report.md) (ecosystem research)
Scope: content parser (`packages/content-structure`), rendering engine (`packages/md-render`), VS Code extension (lite profile), demo site (`src/`)

---

## 1. Approach: OKF-native by default, not an OKF mode

Two strategies were on the table:

1. **Opt-in detection** — identify OKF-compliant content and switch on an "OKF mode" that reinterprets it.
2. **OKF-native defaults** — make the engine's default behavior coincide with OKF semantics wherever they don't conflict with existing behavior, and reserve explicit configuration only for the points where they do conflict.

**Decision: OKF-native (option 2).** The audit below shows we are already closer to OKF than expected — the lite profile is *fully* OKF-compliant on identity today, unknown frontmatter is already preserved, broken links already don't block rendering. Being native means: path-based identity, tolerant frontmatter, link-derived relations, and reserved-file awareness become the default engine semantics for everyone. An `okf:` config block exists only to (a) opt into stricter validation/bundle features and (b) opt back out to legacy behaviors. This avoids the two-codepaths problem and makes plain-Markdown sites benefit from the same improvements (backlinks, neighbor links) without declaring anything.

Auto-detection (`okf.enabled: auto`) remains useful, but only to decide whether to *surface* OKF UI (metadata header, conformance status, explore pages) — never to change parsing semantics.

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

## 3. Design decisions and open points

Kind: **DD** = design decision (needs a ruling before implementation), **OP** = open point (can be resolved during implementation), **RK** = risk to watch.

| ID | Kind | Topic | Proposal | Confidence |
|---|---|---|---|---|
| DD-1 | DD | **Identity default flip.** `get_slug` prefers frontmatter `slug`/`title` → title edits change the URL/uid, violating OKF §8 (identity must survive title changes). | Make path-based identity the default for *all* documents (aligning full profile with lite). `slug:` frontmatter remains an explicit, honored override (OKF allows explicit aliases); `title` stops influencing the URL and becomes display-only. Config escape hatch `identity: legacy` for existing deployments. | High on direction, Medium on default-for-existing-sites (breaking URLs — see RK-1) |
| DD-2 | DD | **`index.md` as reserved file.** Today `readme.md` and same-name-as-parent map to `url_type: dir`; `index.md` is an ordinary page. OKF reserves `index.md` as authored directory navigation. | Add `index.md` to `get_url_type()` / `urlTypeFor()` as a third "dir" trigger. Precedence when both exist in one folder: `index.md` wins as landing page, `readme.md` renders as a normal child page (warning in diagnostics). Do not register `index.md` as a concept node. | High |
| DD-3 | DD | **Root-absolute link meaning.** OKF says `/tables/x.md` is bundle-root-relative. Our asset pipeline treats leading `/` as `public/` root. | For links ending in `.md` (and their fragments): `/` = content-root(bundle)-relative. For all other assets: keep `public/` semantics unchanged. No ambiguity in practice since `public/` doesn't serve markdown. | High |
| DD-4 | DD | **Where OKF fields live in the schema.** `type`, `description`, `resource` currently land in `meta_data` JSON — queryable only by full JSON parse. | Promote `type`, `description`, `resource` to real `documents` columns in catalog.yaml (additive migration; the schema-driven `knownEntryFields` set picks them up automatically). Map OKF `timestamp` → existing `date` column at collect time, keep raw value in `meta_data`. | High |
| DD-5 | DD | **Relations storage.** No links/relations table exists; backlinks impossible today. | New `relations` table (see TP-6) populated by a resolution pass at collect time, in both sqlite and JSON backends. Store context per handoff §10: source sid, raw href, resolved target sid or null, link text, containing heading slug, resolution status (`resolved` / `unresolved` / `external` / `asset`). No inferred relation *types* — links stay untyped, context is the payload. | High |
| DD-6 | DD | **Malformed frontmatter behavior.** Since 0.0.15 we *skip* the document entirely. OKF requires content to remain consumable. | Degrade instead of skip: on YAML parse failure, treat the whole file as body with no frontmatter, flag `conformance: error` on the entry, keep rendering. | High |
| DD-7 | DD | **Bundle model, first release.** Handoff proposes multi-bundle config. | One implicit bundle = `contentdir` for the first release. Schema fields (`bundle` column on documents/relations) reserved but constant. Multi-bundle + cross-bundle link rules postponed. | High (postponement), Low (final multi-bundle syntax) |
| DD-8 | DD | **`log.md` treatment.** | First release: recognize it as reserved (not a concept node, excluded from relations graph), render as a normal page. Timeline rendering, per-concept history extraction postponed. | Medium |
| DD-9 | DD | **Lite profile scope.** Lite deliberately never reads frontmatter (perf ruling: filename-only identity). OKF metadata display seems to conflict. | No conflict for identity (lite is already path-native). For metadata: surface `type`/`tags`/conformance only for the *opened* document via the already-planned hash-keyed lazy parse; filetree stays frontmatter-free. Relations/backlinks are full-profile-only initially. | Medium |
| DD-10 | DD | **Neighbor links (revival of the historic astro-huge-doc linking ideas).** Several past iterations sketched linking neighboring pages; never enforced. | Make it a first-class, always-on feature (not OKF-gated): a neighbors strip per page — prev/next in reading order (from `level`+`order`), parent, and top backlinks once relations exist. OKF metadata (same type / shared tags) enriches it when present. This is the cheapest visible payoff of the relations table. | High |
| OP-1 | OP | Case sensitivity + URL-encoding in md-link target matching across OSes. | Resolve targets against a normalized (decoded, `/`-separated, case-preserving with case-insensitive fallback + warning) path index. Reuse `resolveDocumentAssetPath` normalization. | Medium |
| OP-2 | OP | What counts as "OKF concept" for the metadata header. | Non-empty `type` frontmatter ⇒ concept. Untyped pages get no header and never enter type/tag explore views (matches handoff §9.3). | High |
| OP-3 | OP | Type/tag normalization (`API Endpoint` vs `api-endpoint`). | Group by slugified form for facets, always display the original source value, never rewrite source. Reuse `sanitizeTag`. | High |
| OP-4 | OP | Duplicate uid after identity flip (two files normalizing to one url). | Already partially handled by `usedUrls` dedup in lazy; full profile needs the same guard + a diagnostics warning listing both paths. | Medium |
| OP-5 | OP | Conformance/diagnostics surface for first release. | Collector warnings (existing `warn()` channel) + a `conformance` field per document (`ok` / `warning` / `error`). A dedicated diagnostics page is a later stage. | Medium |
| OP-6 | OP | Does `index.md` content feed navigation menus (authored nav) or only render as landing page? | First release: landing page only. Authored-index-driven SideMenu is Stage 3 (needs link-order extraction, synthesized-entry marking). | High (deferral) |
| RK-1 | RK | **URL breakage** on existing deployments that rely on title-derived slugs (DD-1). | Ship `identity: legacy` config; changelog callout; optionally emit a redirect map (old url → new url) at collect time so static hosts can serve redirects. Decide whether new default applies to existing demo/dataset content before release. | Medium |
| RK-2 | RK | Collect-time cost of the resolution pass on huge trees (path index + N links lookups). | Path→sid map is O(docs) in memory, lookups O(1); backlink aggregation is one pass over relations. Piggyback on existing collect loop, no second file read. Keep out of lite. | High |
| RK-3 | RK | OKF is a v0.1 draft; field semantics may shift (per research report). | We only depend on the stable core (type/title/description/tags/timestamp/resource, index.md/log.md, links-as-relations). Everything else stays in `meta_data`, so spec drift is absorbed without schema churn. | High |

## 4. Architecture touch points

Ordered roughly by pipeline position. "Stage" refers to §6.

| # | Area | Location | Current behavior | Change | Stage |
|---|---|---|---|---|---|
| TP-1 | Identity / slug | `get_slug`, `entry_to_url`, `buildDocumentUid` — [collect.js:28-64](../../../../packages/content-structure/src/collect.js#L28-L64) | frontmatter `slug` > `title` > path | Path-first identity; `slug` explicit override only; `title` display-only; `identity: legacy` config (DD-1) | 1 |
| TP-2 | Reserved files | `get_url_type` [collect.js:144](../../../../packages/content-structure/src/collect.js#L144) and `urlTypeFor` [structure-db-lazy.js:138](../../../../packages/md-render/src/libs/structure-db-lazy.js#L138) | `readme.md` + same-name-as-parent → dir | Add `index.md` → dir landing; recognize `log.md` as reserved (flag on entry, excluded from concept set) (DD-2, DD-8) — keep both implementations mirrored | 1 |
| TP-3 | Schema | [catalog.yaml](../../../../packages/content-structure/catalog.yaml) documents table | no `type`/`description`/`resource`/`conformance` columns | Add columns; `knownEntryFields` (schema-driven) then routes them out of `meta_data` automatically; map `timestamp`→`date` (DD-4) | 1 |
| TP-4 | Frontmatter tolerance | [frontmatter.js](../../../../packages/content-structure/src/frontmatter.js) + caller [collect.js:156](../../../../packages/content-structure/src/collect.js#L156) | malformed YAML ⇒ document skipped | Degrade to frontmatter-less body + `conformance: error` (DD-6) | 1 |
| TP-5 | Link resolution pass | `createLinkEntry` [md_utils.js:486](../../../../packages/content-structure/src/md_utils.js#L486) + new collect post-pass | links recorded, never resolved to documents | Classify each link (external / asset / concept / anchor); resolve `.md` targets via path index (relative + bundle-root-relative per DD-3, fragments preserved, OP-1 normalization); attach resolution status | 2 |
| TP-6 | Relations persistence | [structure_db.js](../../../../packages/content-structure/src/structure_db.js), [structure_json.js](../../../../packages/content-structure/src/structure_json.js), catalog.yaml | — | New `relations` table: `version_id, source_sid, target_sid, target_raw, fragment, link_text, source_heading, status, external`; persisted in both sqlite and static-JSON builds (DD-5) | 2 |
| TP-7 | Backlink queries | structure-db backends: [structure-db-sqlite.js](../../../../packages/md-render/src/libs/structure-db-sqlite.js), [structure-db-json.js](../../../../packages/md-render/src/libs/structure-db-json.js) | — | `getOutgoing(sid)` / `getBacklinks(sid)` / `getNeighbors(sid)` accessors; lazy backend returns empty (DD-9) | 2 |
| TP-8 | Link rendering | [Link.astro](../../../../packages/md-render/src/components/markdown/Link.astro) | non-asset links pass raw href through; internal `.md` links emit dead hrefs | Look up resolved route for concept links; CSS classes for `external` (exists) / `unresolved` / `concept`; unresolved keeps text visible with marker, no dead navigation | 2 |
| TP-9 | Metadata header | new component in [markdown/](../../../../packages/md-render/src/components/markdown/) + [\[...url\].astro](../../../../packages/md-render/src/pages/[...url].astro) | — | Compact concept header (type badge, description, tags, timestamp, resource link, conformance) rendered only for typed documents (OP-2); expandable "additional metadata" from `meta_data`; no raw YAML dump | 2 |
| TP-10 | Neighbors / related rail | [Layout.astro](../../../../packages/md-render/src/layout/Layout.astro), [SubMenu.astro](../../../../packages/md-render/src/layout/SubMenu.astro), toc area | right rail = TOC only | "Related" section: prev/next (order-based), backlinks with heading context, outgoing concepts, unresolved list; text-first, lazy-loaded (DD-10) | 2 |
| TP-11 | Authored index nav | [source_navigation.js](../../../../packages/md-render/src/layout/source_navigation.js), [SideMenu.astro](../../../../packages/md-render/src/layout/SideMenu.astro), lazy_navigation | filetree-driven only | Parse `index.md` link structure into an alternate nav source; switchable Contents/Files; mark synthesized entries | 3 |
| TP-12 | Explore pages | new routes under [pages/](../../../../packages/md-render/src/pages/) (`/explore/types/…`, `/explore/tags/…`, `/explore/diagnostics`) | — | Type/tag/diagnostics views from documents columns (TP-3); static-build compatible (pre-rendered from collected data) | 3 |
| TP-13 | Graph view | new, optional; candidate base: existing [panzoom](../../../../packages/md-render/src/components/panzoom/) + SVG | — | Local neighborhood graph per concept (1–2 hops, from `getNeighbors`); full-graph explorer later/optional package | 4 |
| TP-14 | VS Code extension (lite) | extension preview + planned hash-keyed lazy parse | frontmatter never read | Opened-document-only metadata header via lazy parse; no relations in lite (DD-9) | 2–3 |
| TP-15 | Config surface | `set_config` [collect.js:437](../../../../packages/content-structure/src/collect.js#L437) + md-render config | — | `okf:` block: `enabled: auto\|true\|false` (UI surfacing + validation strictness only), `identity: path\|legacy`, later `bundles:` (DD-7) | 1 |

## 5. Rendering step (second phase focus)

Reading-first, per handoff §13–14 — the document stays the center, semantics live at the edges:

1. **Concept header** (TP-9) — the visible payoff of Stage 1. Type badge + description + tags/timestamp; identity (concept id = url path) inspectable on hover/expand.
2. **Neighbors strip + related rail** (TP-10) — this is where the historic "link neighboring pages" ideas get enforced rather than revisited: every page (OKF or not) gets prev/next/parent from the existing `level`/`order` data; pages with relations additionally get contextual backlinks ("Referenced under *Calculation*: '…MRR is calculated from…'"). Context comes free from the relations table (link text + source heading).
3. **Graph** (TP-13) — optional, neighborhood-first, never the primary interface. A per-concept neighbors JSON keeps it static-build compatible and avoids loading any global graph (handoff §26). Full-graph explorer only if the neighborhood view proves insufficient.

## 6. Suggested delivery stages

1. **Stage 1 — Native identity & recognition** (TP-1..4, TP-15): path identity, reserved files, schema columns, tolerant degradation, config. *Engine becomes OKF-native; no visible UI change except stable URLs.*
2. **Stage 2 — Relations & reading UI** (TP-5..10, TP-14): resolution pass, relations table, backlinks, link rendering states, concept header, neighbors/related rail. *The visible release.*
3. **Stage 3 — Navigation & exploration** (TP-11, TP-12): authored indexes, type/tag/diagnostics pages.
4. **Stage 4 — Graph & beyond** (TP-13, multi-bundle, log timelines, context export).

Stages 1+2 together correspond to the handoff's "minimum useful OKF support" (§31) minus type/tag explore pages, which land in Stage 3.

## 7. Rulings requested before implementation

- **DD-1 / RK-1**: flip identity default for everyone (with `identity: legacy` escape + redirect map), or path-identity only for typed documents? Plan recommends: flip for everyone — one identity contract, lite/full parity.
- **DD-2**: `index.md` beats `readme.md` as folder landing when both exist?
- **DD-4**: promote `type`/`description`/`resource` to schema columns (vs keeping them in `meta_data`)?
- **DD-10**: neighbors strip always-on for all content (recommended), or OKF-only?
