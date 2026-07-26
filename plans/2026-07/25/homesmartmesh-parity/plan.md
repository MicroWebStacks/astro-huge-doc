# HomeSmartMesh Feature Parity (static publish target)

## Problem Summary

`manifest.yaml` already fetches the HomeSmartMesh content set
(`HomeSmartMesh/homesmartmesh.github.io` → `content/`, `public/images`,
`public/design`) and the engine can render it. The reference deployment is
<https://homesmartmesh.github.io/>, built by `HomeSmartMesh/website-astro`
(Astro 4, `content-structure@^1.1.10`, the same lineage as
`C:\dev\MicroWebStacks\astro-big-doc`).

The goal is that `astro build --config astro.config.static.mjs` on this repo
produces a static artifact that can replace the live site on GitHub Pages.

**Status: Phases 0, 1, 2, 4 and 5 are done; Phase 3 is partial (`WP-13` only).** Both static targets build (full 115
pages, lite 76 pages), and one path-only identity rule now drives full and lite. The
HomeSmartMesh migration worklist has been applied on branch
`astro-huge-doc-migration`; a fresh manifest fetch produces zero unresolved
card or document-link diagnostics and builds 115 pages. The full artifact now
renders the missing iframe, external GLB, XLSX, gallery-directory, and
text-directive forms. Static-mode runtime correctness, publish chrome, the Pages workflow and the
regression harness all landed in Phases 4-5. What remains is **Phase 3's asset
work**: `WP-14`, `WP-21`, `WP-23` and `WP-25`.

## Goal And Objectives

1. `astro build --config astro.config.static.mjs` completes with zero errors on
   the full HomeSmartMesh content set. ✔ **met by Phase 0**
2. Every document is reachable at a url derived from its file path by one shared
   rule. Matching the live site's urls is **explicitly not a goal** — see `R-7`;
   the content is migrated to the new scheme instead of the scheme bending to
   the content.
3. Every markdown feature used by the content renders as it does live — no raw
   directive text, no empty galleries, no dropped 3D models or spreadsheets.
4. The published pages carry no SSR-only runtime calls, no console 404s, and no
   visible "index unavailable" chrome. ✔ **met by WP-15**
5. The site can be deployed from CI at either a root or a sub-path `base`. ✔
   **met by Phase 5** — though not through `action.yml`; see `WP-18`.
6. Every non-publish profile still renders every page without failing (`R-11`).

## Maintainer Rulings (2026-07-25)

These constrain everything below and are not open for re-litigation:

- **R-1 — Parity target is the full static build only.** Parity is judged
  against `DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static`. This
  settles what was drafted as `OP-001`.
- **R-2 — lite must not break.** The lite/VS Code profile must keep building
  and rendering every page. It does not have to reach parity.
- **R-3 — Degraded rendering is acceptable in lite.** A feature lite cannot
  render may fall back to a plain highlighted code block. It may never crash a
  page or abort a build. Galleries were the worked example, but see `R-5`:
  fallback is the floor for what lite may do, never a target to aim at.
- **R-4 — Phase 0 comes first and is real work.** No further phase planning is
  trustworthy until the site builds and pages can actually be compared. *(Phase
  0 is complete; Phases 1, 3, 4 and 5 were re-derived against the working
  build in rounds 2-3. Phase 2 was subsequently implemented and its feature
  counts were verified against the emitted full/static artifact.)*
- **R-5 — Phase 0 removes nothing that already worked.** Lite rendered
  galleries before this packet, so it must render them after. Phase 0 is the
  minimum change that makes the build succeed; any capability reduction is out
  of scope, whatever else it might buy. This supersedes the reading of `OP-0.2`
  that had lite ignore galleries.

### Round 2 (2026-07-25, after Phase 0)

Rulings on the Phase 1+ open points. These **redefine what parity means** — see
the note below the table.

- **R-6 — Website identity is the filename in both renderer profiles.** Lite and
  full use the same website rule: the url is the slugified relative file path,
  while the label/title is display-only. OKF itself supplies bundle-relative
  path identity and does **not** require underscore-to-dash route
  canonicalization. The renderer preserves URL-unreserved filename characters
  and only normalizes unsafe characters such as spaces. `frontmatter.slug` is **ignored** in every
  renderer profile; the `frontmatter.slug → title_slug(title) → filename`
  chain is not reinstated. Authors control website urls by naming files
  (`OP-002`, `OP-003`, `DD-001`).
- **R-7 — Breaking url and uid compatibility is accepted.** The maintainer
  authors the HomeSmartMesh content and will rework it to match. No redirect
  map, no legacy uid alias index, no dual-resolution path. Where the new scheme
  breaks a reference, the **content** is the thing that gets fixed
  (`OP-002`, `OP-004`, `DD-004`).
- **R-8 — One meaning for a root-absolute path: the content root.** `/x/y.png`
  resolves against the content root, falling back to `public/` only if the file
  exists there. Anything in the content that relied on another reading is a
  content bug. This must be written into a spec (`OP-007`).
- **R-9 — `base` is configurable.** Both `/` and a sub-path base must work
  (`OP-008`).
- **R-10 — Chrome is collapsible, not removed.** Breadcrumb + metadata area,
  and the footer references + prev/next area, keep their functionality but
  collapse behind a small arrow, hidden by default, with sticky per-user state
  — the pattern already used for the indexing status bar (`OP-006`).
- **R-11 — Lite degrades, it does not fail.** Restates `R-2`/`R-3` for
  Phases 1+: only full/json/static is held to parity, but every other profile
  must render every page without failing, omitting features rather than
  breaking (`OP-001`).

### Round 3 (2026-07-25, asset storage and the slug rule)

- **R-12 — Website path normalization is gentle and OKF/GitHub-friendly.**
  Preserve the RFC 3986 URL-unreserved ASCII set (`A-Z`, `a-z`, digits, `-`,
  `.`, `_`, `~`) including case. Trim surrounding whitespace, strip diacritics
  after NFKD normalization, collapse each remaining unsafe run (including
  spaces) to one dash, trim boundary dashes, and fall back to `page` for an
  empty, `.` or `..` segment. URL-safe spellings are distinct:
  `thread_sensortag` does not alias `thread-sensortag`. HomeSmartMesh keeps its
  original filenames; only broken references and obsolete frontmatter slugs
  are migrated (`OP-010`).
- **R-13 — Blob storage stays; the artifact ships only what it references.**
  `OP-005` Option A. Option B (serve source files in place) is rejected on
  measurement: it would grow the artifact. Option C (hotlink GitHub) is
  rejected outright.
- **R-14 — The JSON backend writes blob bytes straight to the flat served
  directory**, bypassing the date-sharded sidecar tree it currently stages
  through. The sidecar stays for sqlite, where it is load-bearing (`WP-25`,
  `OP-013`).
- **R-15 — `external_storage_kb` becomes sqlite-only** in scope or in name. It
  has no effect on any JSON dataset's size, and presenting it as a global knob
  is how it came to be misunderstood (`OP-014`).

### Round 5 (2026-07-25, the crossed C3 documents)

- **R-18 — The C3 DevKit M1 crossing is a content inconsistency, not a
  rendering issue, and is accepted as-is.** The two documents are each named
  after the other's title, so under `R-6` their URLs read backwards. Both
  render correctly and both exist on the live site. No renderer change, no
  content edit, no redirect: `OP-015` Option C. The rich board page serves at
  `/microcontrollers/esp32/esp32-c3-devkitm-1`. This is consistent with `R-7` —
  our urls are deliberately allowed to differ from the live site's.

### Round 4 (2026-07-25, public discovery surfaces)

- **R-16 — The graph button and `explore/` pages ship publicly.** Both are
  intentional improvements over the reference site, not extension-only
  affordances. They must work in the full/json/static artifact without relying
  on `/__lite/*` endpoints (`OP-011`).
- **R-17 — Content migration is a validation bridge; publishing cutover remains
  outside this packet.** This repository is a safe island for building and
  validating the replacement builder. The HomeSmartMesh edits are isolated on
  branch `astro-huge-doc-migration`, and this repository's manifest temporarily
  pins that branch so the migrated content is exercised now. The later atomic
  change to the publishing action and its content reference remains work in the
  currently publishing repository, which does not yet use `astro-huge-doc`
  (`OP-012`).

**Consequence — parity is no longer url parity.** `R-1` set the publish target;
`R-6`/`R-7` now say our urls are *deliberately* allowed to differ from
<https://homesmartmesh.github.io/>. So the measured "34/73 divergent urls" stops
being a defect count and became a **content migration list**, now applied and
verified on the isolated content branch. What remains under test is *render*
parity: every page shows the same content, components, and assets the live site
shows, at whatever url our scheme produces.

## Scope

- In: URL/identity derivation, card resolution, markdown feature gaps, fetch
  manifest completeness, static-mode runtime guards, publish chrome, Pages
  deployment, a repeatable parity check.
- Out (non-goals):
  - Renaming otherwise URL-safe content paths to fit a renderer convention.
    Both profiles instead adopt the gentle shared rule in `R-12`.
  - Matching the live site's urls (`R-7`).
  - Redesigning the UI to pixel-match the live theme (colours, spacing, dark
    default are cosmetic and deliberately diverged).
  - Serving assets from their source paths, or from GitHub — measured and
    rejected as `OP-005` Options B and C.
  - Fixing content-side dead links that are already broken on the live site
    (`/docs/**`, `/networks/**`, `/frameworks/chip/`) — see `OP-007`.
  - Porting `swiper` and `pz_gallery` components: zero usages in this content.

## Measured Baseline (2026-07-25)

Evidence gathered by building/serving this repo and diffing against the live
site page-by-page with a headless browser. Working artifacts under
`.tmp/parity-2026-07-25/` (throwaway).

**This table is the pre-Phase-0 survey.** Rows marked ✔ were fixed by Phase 0;
everything unmarked is still true and is Phase 1+ scope. Asset sizes were
re-measured after Phase 0 and are in `OP-005`.

| Measurement | Result |
| --- | --- |
| Static build, `DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static` | ✔ **was** failing at `microcontrollers/esp32/fire-beetle` — `TypeError: Cannot read properties of null (reading 'gallery')`. Now exit 0, 115 pages. |
| Documents in the content set | 73 |
| Document URLs that differ from the live site's URL | **34 / 73** — reclassified by `R-7` from a defect count to the content migration list |
| `yaml cards` uid references in content | 45 unique; **7 resolve, 38 dangle** |
| Pages rendering "thin" (< 400 chars of body) on full/json | 16, of which 8 are section landing pages emptied by dangling cards |
| `:iframe[]` directives | 2 (both render as raw attribute text) |
| Remote `.glb` links | 12 (render as plain links; live renders `<model-viewer>`) |
| `.xlsx` links | 2 (render as plain links; live renders a table) |
| `/data/*.zip\|hex` download buttons | **14** (all 404 locally; all 200 live). The survey said 16; two of those were `/opt/zigbee2mqtt/data/configuration.yaml` and `.../data/database.db` in prose, matched by a loose `/data/` grep. Corrected during `WP-13`, which resolves all 14. |
| `yaml gallery` / `yaml gallery_dir` blocks | ✔ 8 / 1 — both forms now expand in both profiles |
| Console errors on every static page | `GET /__lite/navigation` 404, `GET /__lite/index-control?action=start` 404, plus a visible "Link index unavailable" status bar |

### Root cause groupings

**A. Identity is derived from filenames, not frontmatter.**
`src/libs/structure-db-lazy.js` states the lite contract explicitly ("Frontmatter
is never read"), and `packages/content-structure/src/collect.js#get_slug` dropped
the `title_slug(title)` fallback that the legacy collector
(`content-structure@1.1.10`) still has. Consequences before Phase 1, by profile:

| Symptom | lite/json (lazy) | full/json + full/sqlite |
| --- | --- | --- |
| `<title>` | slug (`thread_sensortag`) | frontmatter title (correct) |
| Nav labels / order | lowercase slugs, alphabetical | titles, frontmatter `order` (correct) |
| Card headings | slug (`kayak_trailer`) | title (correct) |
| Page URL | slugified filename (`.../thread-sensortag`) | raw filename (`.../thread_sensortag`) |
| Live URL | `.../thread-sensortag` | — |

So the **publish target must be the full profile** (`OP-001`), which removes the
title/label/order gaps for free, but leaves URL and uid divergence.

**B. Card uids use the legacy `<type>.<slug>` scheme.**
Legacy: `uid = <parent-folder>.<title_slug(title)>` (root-level content →
`generic`). Current: `uid = <dotted full url path>`. So the content's
`- uid: esp32.firebeetle` cannot match `microcontrollers.esp32.fire-beetle`.
This is why the ESP32, nRF52, STM32, robotics, protocols, frameworks, web, and
3dprinting landing pages render an empty or partial card grid.

**C. Dataset URL ≠ served route (lite only).**
`dataset/json/content.json` stores `3dprinting/kayak_trailer`, but the lite route
serves `/3dprinting/kayak-trailer`. 12 of the 73 exported URLs 404 against the
running lite server. Internal markdown links inherit the stored value, so
`/microcontrollers/nrf52/usb_dongle` is emitted and 404s.

**D. Markdown features present in `astro-big-doc`, absent here.**
`src/components/markdown/directive/IframeDirective.astro`,
`.../ImageDirective.astro`, `.../table/TableXLSX.astro`, `.../code/LinkCode.astro`
and `markdown/Tag.astro` have no counterpart. (`AstroMarkdown.astro:6` still
imports the non-existent `./Tag.astro`; TypeScript unused-import elision hides
it at build time — dead code to remove.) `Link.astro` gates `is_model3d` on
`hasAsset`, so remote `.glb` URLs never reach `<ModelViewer>`, and `is_table` is
hard-coded `false`.

**E. `gallery_dir` is half-implemented.**
`packages/content-structure/src/md_utils.js:353` only recognises meta exactly
equal to `gallery`, so `yaml gallery_dir` produces no `gallery_items` and a
`null` ast; `Code.astro:34` matches on `startsWith("gallery")`, so it *does*
route the block to `<Gallery>`. The mismatch is the build-aborting crash.

**F. Static output still calls SSR-only endpoints.**
`src/layout/lazy_navigation.js` and `src/layout/lite_relation_indexer.js` fetch
`/__lite/*`, which only exists in the Node middleware. In the static artifact
these 404 on every page load and surface a user-visible failure bar.

**G. Fetch manifest is incomplete.**
The source repo's `public/` contains `data/`, `design/`, `images/`,
`favicon.svg`, `favicon.png`, `.nojekyll`. The manifest fetches only `images`
and `design`, so all 16 `/data/**` download buttons 404.

## Phase 0 — Make the site build (active)

Phase 0 is a standalone deliverable. Nothing downstream is planned in detail
until it is done, because the comparison that would inform that planning is
impossible while the build aborts.

### Root cause

Two predicates disagree about what a "gallery" code block is:

| Side | Location | Predicate |
| --- | --- | --- |
| Collector | `packages/content-structure/src/md_utils.js:353` | `meta.trim().toLowerCase() === 'gallery'` |
| Renderer | `src/components/markdown/code/Code.astro:34` | `asset.params.startsWith("gallery")` |

`content/microcontrollers/esp32/fire-beetle.md` uses ```` ```yaml gallery_dir ````.
The collector rejects it (so no `gallery_items`, so `ast` stays `null`); the
renderer accepts it and dereferences `item.ast.gallery` → `TypeError` → the
whole build aborts.

The directory-expansion logic the block needs
(`collectGalleryAssets`, the `{dir: <path>}` branch) is **already fully
implemented** — it was simply unreachable behind the exact-match gate.

The same exact-match-vs-`startsWith` divergence exists for `glb`
(`md_utils.js:354` vs `Code.astro:32`). No content uses it today, so it is a
latent copy of the same bug.

### Work packages

| WP | Work | State |
| --- | --- | --- |
| WP-0.1 | Widen the collector's gallery gate to accept any `gallery*` meta, so `gallery_dir` reaches the existing `{dir:}` expansion. | **Done** |
| WP-0.2 | Make `Code.astro` non-fatal: when a block routed to a custom-yaml component has no usable `ast`, render the plain highlighted code block instead of throwing (`DD-0.2`, satisfies `R-3`). | **Done** |
| WP-0.3 | Replace both copies of the block-kind predicate with one shared helper covering `gallery`, `glb`, and `cards`, imported by collector and renderer, so they cannot drift again (`DD-0.1`). | **Done** — `packages/content-structure/src/code_blocks.js` |
| WP-0.4 | Regression fixtures + tests: `yaml gallery` (list form), `yaml gallery_dir` (dir form), and a malformed gallery. Assert the first two produce `gallery_items` and the third degrades to a code block rather than throwing. | **Done** — `test/gallery-blocks.test.js`, 8 tests |
| WP-0.5 | Record the DoD verification run in `test.md`. | **Done** |
| WP-0.6 | Skip sharp for formats it cannot decode instead of warning per asset (`OP-0.3`). | **Done** |
| WP-0.7 | ~~Gallery expansion is opt-out per parse call (`expand_galleries`).~~ **Withdrawn** under `R-5` — it existed only to stop lite expanding galleries, which is a capability reduction Phase 0 must not make. The flag and its plumbing were removed; every caller expands galleries. | **Withdrawn** |

### Definition of Done

All five commands green, from a clean checkout:

```bash
pnpm collect                                                     # required: WP-0.1 changes the collector, so the exported dataset must be rebuilt
pnpm test
MICROWEBSTACKS_DOTENV_OVERRIDE=false DOCS_PROFILE=full DOCS_BACKEND=json \
  DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs   # parity target (R-1)
DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs     # lite must not break (R-2)
```

plus: serving the full static artifact, every one of the 9 gallery-bearing
pages renders its gallery, and `microcontrollers/esp32/fire-beetle` renders
content rather than an error page.

Explicit non-goal for Phase 0: **no parity fixes.** URLs, card uids, iframes,
glb, xlsx and `/data/**` stay broken. Phase 0 buys the ability to see them.

### Phase 0 open points

| ID | Question | Resolution | Status |
| --- | --- | --- | --- |
| OP-0.1 | What should a malformed or unexpanded gallery block render as? | A clean code block highlighted as yaml. No error UI, no `warn` — an info-level hint only, because this is an expected outcome, not a fault. Genuine yaml syntax errors and unreadable directories keep their `warn`, since those are authoring faults rather than expected fallbacks. | **Resolved** — maintainer |
| OP-0.2 | Is `gallery_dir` a distinct authoring form or an alias of `gallery`? | Same feature: `gallery_dir` takes a directory path where `gallery` takes an image list, and both must reach the same outcome. Both profiles expand and render both forms — the fallback applies only when a block genuinely yields no items. (Superseded reading: the first implementation took "ignored in lite" from `R-3` as licence to stop lite expanding galleries at all. `R-5` corrects this — lite already rendered them, so it keeps rendering them.) | **Resolved** — maintainer, revised |
| OP-0.3 | Does the `sharp` warning on `protocols/thread/threadgrouplogo.ico` belong to Phase 0? | Yes — Phase 0 leaves no non-fatal warnings behind. Fixed by skipping formats sharp cannot decode before calling it. Whether sharp is wanted at all (e.g. for gallery image sizing) is a later question, and out of scope for lite either way. | **Resolved** — maintainer |

No other decisions are needed to finish Phase 0. Everything else in the OP/DD
tables below belongs to Phase 1+ and is deliberately left undecided until the
build works.

### Phase 0 design decisions

| ID | Decision | Proposal | Confidence |
| --- | --- | --- | --- |
| DD-0.1 | One predicate owns "which custom-yaml component does this block belong to", shared by collector and renderer. | High |
| DD-0.2 | The renderer never throws on a missing/absent `ast`. Degrading to `<Highlighter>` is the universal fallback for every custom-yaml component, not a gallery special case. | High |
| DD-0.3 | `gallery_dir` reuses the existing `{dir:}` expansion; no second code path is introduced. | High |
| DD-0.4 | ~~Gallery expansion is switched by a per-call collect flag (`expand_galleries`).~~ **Reversed** by `R-5`: gallery expansion is unconditional, and no switch exists. The reasoning that produced it still stands as a warning for any future attempt — such a switch must never be keyed on `DOCS_PROFILE`, because `pnpm collect` writes the `content.json` a full/static publish reads, and the repo `.env` defaults to `DOCS_PROFILE=lite`; that would silently strip galleries from a published site. | Reversed |
| DD-0.5 | Phase 0 changes are confined to the classifier, the renderer fallback, and the sharp allowlist. No performance work, no capability changes, no refactors of adjacent code. Everything else waits for a measured comparison (`R-4`, `R-5`). | High |

### Phase 0 findings worth carrying forward

- **`pnpm collect` takes ~7 s** on this content set, so making it a mandatory
  pre-build step costs nothing.
- **Gallery was the only build blocker.** With it fixed, both targets complete:
  full/json 115 pages, lite 76 pages, zero error pages in either artifact.
- **Galleries now render identically in both profiles** — same pages, same
  image counts. Lite additionally gained `gallery_dir`, which the old
  exact-match gate had excluded from *both* profiles. Phase 0 is a net capability
  gain for lite and a loss nowhere.
- **The lite parse cache is versioned** (`RECORD_VERSION` in
  `structure-db-lazy.js`) but is *not* invalidated by a collector change on its
  own — it must be bumped by hand whenever parse output changes shape. Bumped
  to 7 here, because v6 records for `gallery_dir` pages hold no gallery items.
- **The lazy parse pays for gallery expansion** (a directory listing plus a
  stat per image, per page parse). Not measured, and not Phase 0's business to
  change (`R-5`) — but if lite page-open latency is ever profiled, this is a
  known cost, and caching amortises it across opens of an unchanged file.
- **13 of 73 pages in the full artifact still render thin**, all of them
  landing pages emptied by the dangling card uids. That is the Phase 1 headline
  and is now measurable rather than hypothetical.

---

## Phases 1-5

Revised 2026-07-25 against the working build and the round-2 rulings. Phase 1
was rewritten outright; Phase 3's sizing WP and Phase 4's chrome WP are backed
by measurements rather than estimates. Phase 2's iframe, GLB, XLSX, gallery,
and directive counts were re-counted against its completed full/static
artifact. Implementation facts and exact validation results live in
`implementation.md` and `test.md`.

### Phase 1 — One identity rule, and the content migration it forces

Rewritten under `R-6`/`R-7`. The original shape (reinstate the frontmatter slug
chain, alias legacy uids, emit redirects) is **dropped in full** — it existed to
preserve a compatibility the maintainer has chosen to break. The work is now to
delete the divergence rather than bridge it, and to fix the content.

| WP | Work | Notes |
| --- | --- | --- |
| WP-03 | Make filename-derived identity the only rule in the full profile: `get_slug` returns `slugSegment(filename)`, `frontmatter.slug` is ignored, `title` becomes display-only (`R-12`, `DD-001`). | Both profiles import the shared rule: full drops frontmatter identity and lite adopts gentle URL-safe-character preservation. |
| WP-04 | Extract one url/slug/uid derivation module imported by collect, `getStaticPaths`, the catch-all route, link rewriting, **and the lite tree walk**, so all five cannot drift (`DD-003`). Exact source paths resolve first; canonical fallback normalizes unsafe characters but preserves URL-unreserved spelling, so `esp32_remote` and `esp32-remote` remain distinct. | Closes root cause C, makes `R-6` structurally true rather than a convention, and retains OKF/GitHub path identity. |
| WP-05 | Resolve `yaml cards` uids against the new canonical uid. Report every unresolved uid as a build-time list — this is the content migration worklist, not a runtime fallback (`R-7`, `DD-004`). | 38/45 dangle today; each becomes a content edit. |
| WP-06 | Rewrite internal markdown links through the resolved target document's served url, never the raw filename. Unresolved links are reported, not silently emitted as 404 hrefs. | Same worklist mechanism as WP-05. |
| WP-20 | Duplicate-slug guard: two files slugifying to the same url is an authoring error. First claimant wins, the loser is dropped with a `warn` naming both paths (`DD-004`). | Lite already has this (`structure-db-lazy.js:587`); WP-04 makes it shared. |

Exit: every document url is derivable from its path by the single module;
unresolved card uids and internal links are reported as a complete downstream
migration worklist; canonical references resolve in focused fixtures; zero
duplicate-slug warnings in the HomeSmartMesh snapshot. The worklist is applied
and verified on the isolated migration branch; switching the publishing action
remains outside this packet (`R-17`). **Not** an exit criterion any more:
matching the live site's urls.

### Phase 2 — Missing markdown features

| WP | Work | Notes |
| --- | --- | --- |
| WP-08 | Support `yaml gallery_dir` at collect time — expand `dir:` into `gallery_items` the same way `yaml gallery` does (`DD-005`). Accept both meta tags. | 1 usage today, but it is the crash source and a documented authoring form. |
| WP-09 | Port `IframeDirective` (`:iframe[]{src= title= center}`), including the YouTube `youtu.be` → embed URL mapping the live site does. | 2 usages; currently leaks raw attribute text into the page. |
| WP-10 | Let `Link.astro` route **external** `.glb` URLs to `<ModelViewer>`, and un-gate `is_model3d` for the full profile. Keep the lite gate. | 12 usages. |
| WP-11 | Port `TableXLSX` and re-enable the `is_table` branch in `Link.astro`. | 2 usages. |
| WP-12 | Audit the remaining directive surface against content usage (`button` 271 ✓, `image` 124 ✓, `details` 2 — verify the textDirective form renders, not just `:::details`). Remove the dead `Tag.astro` import from `AstroMarkdown.astro`. | |

Exit: no page contains raw directive text, an empty gallery, or a degraded link
where the live site renders a component.

### Phase 3 — Assets and fetch completeness

| WP | Work | Notes |
| --- | --- | --- |
| WP-13 | Extend `manifest.yaml` fetch to `public/data`, `public/favicon.svg`, `public/favicon.png`, `public/.nojekyll`. | **Done.** Closes all 14 download-button 404s (not 16 — see the baseline note). Needed a `files:` entry form in `scripts/fetch.js`: folder entries reset their destination, so `folders: [public]` would have deleted the sibling `public/images` and `public/design` fetches. `.nojekyll` is belt-and-braces — `actions/upload-pages-artifact` bypasses Jekyll anyway — but it matches the source repo and costs nothing. |
| WP-14 | Ship `public/**` only for paths the built HTML actually references (`OP-005`, Option A). Add an artifact-composition report to the build. | **−86.8 MB of 356.9 MB (−24%)** on measured numbers, with no change to what any page renders. `WP-13` added `dist/data` (3.1 MB / 17 files), of which **3 files are unreferenced**: two space-named duplicates of underscore-named archives, and the bare `ot-rcp-com-1.2-usb_27.08.2021.hex` whose `.zip` is what the page links. The scan must percent-encode before comparing — one live href contains spaces. |
| WP-21 | Prune blobs that no emitted page references. | Measured at 249 files / **0.5 MB** — negligible, so this is hygiene, not a size lever. Do it with WP-14 or not at all. |
| WP-25 | JSON backend writes blob bytes straight to the flat served dir, bypassing the date-sharded sidecar tree it currently stages through (`OP-013`). Keep the sidecar for sqlite, where it is load-bearing. | Removes 198.4 MB of local duplication and the unbounded cross-run accumulation. No effect on the artifact. Also makes `external_storage_kb` honestly sqlite-only. |
| WP-23 | Write the asset-path resolution rule into a spec and make one module implement it: a root-absolute path resolves against the **content root**, falling back to `public/` only when the file exists there (`R-8`, `OP-007`). Report content that resolves to neither. | No spec covers this today — `specification/` has no absolute-path rule at all, and `structure-db-lazy.js` carries its own `DD-3` comment about resolving against `public/`. 199 of 264 image assets are root-absolute, so this rule decides most of them. |

Exit: every asset the live site serves resolves; artifact size understood and
justified; the composition report is part of the build output so the next
regression is visible rather than discovered.

### Phase 4 — Static-mode runtime correctness and publish chrome

| WP | Work | Notes |
| --- | --- | --- |
| WP-15 | Guard `/__lite/*` clients on `config.output !== 'static'` (`DD-006`). | **Done.** The cause was not where the survey put it: the clients were already gated on `extensionPreviewEnabled()`, but the repo `.env` sets `MICROWEBSTACKS_EXTENSION_MODE=true`, so the plan's own lite reproduction command baked the whole preview surface into a static artifact. New `extensionPreviewClientEnabled()` adds the output condition; `scripts/check-static-artifact.js` is the `DD-006` gate and checks reachability rather than a flat grep. |
| WP-16 | Make the breadcrumb+metadata area and the footer references+prev/next area **collapsible**, hidden by default, with sticky state (`R-10`, `OP-006`). Keep the graph button and `explore/` pages available (`R-16`, `OP-011`). | **Done** via `CollapsibleBand`. The graph trigger stays *outside* the band: `R-16` ships it as a public discovery affordance, so it must not need an extra click to be found. Neither the graph nor `explore/` reaches `/__lite/*` — confirmed by the `WP-15` gate. |
| WP-22 | Extract the collapsible-bar affordance (arrow control + persisted state) into a shared component. | **Done** — `src/layout/collapsible.js` + `CollapsibleBand.astro`, consumed by both chrome bands and the index status bar. Found on the way: the index bar was **not** actually sticky (`userCollapsed` reset every page load), despite `R-10` describing it as the existing sticky pattern. It is now. |
| WP-17 | Head/branding parity: `<title>`, `<link rel="icon">`, and a footer. | **Done.** Icons declare `favicon.svg` → `favicon.png` → `favicon.ico` plus `apple-touch-icon`, all base-prefixed. `SiteFooter.astro` ships the footer *capability* but renders nothing unless a `render.footer` manifest key is set — the live site has no footer, so inventing branding would have put unrequested text on 115 pages. No `description`/OG tags were added. |

Exit: a published page has a clean console, no SSR-only requests, and no
nonfunctional extension-only affordances; the graph button and `explore/`
pages work from the static artifact.

### Phase 5 — Deployment and regression guard

| WP | Work | Notes |
| --- | --- | --- |
| WP-18 | Add a GitHub Pages workflow → `actions/upload-pages-artifact` → `actions/deploy-pages`. | **Done** — `.github/workflows/pages.yml`, `workflow_dispatch` only (`R-17`). **Deviation:** it drives the in-repo builder, not `action.yml`. That Action installs a pinned *published* engine from npm, so running it here would build with a released engine and validate nothing in this packet; the consumer shape is already documented by `render-example.yml`. Never dispatched — the upload/deploy pair is unproven. |
| WP-19 | Promote the parity harness into `test/`. | **Done** — `scripts/parity-metrics.js`, `test/fixtures/parity-baseline.json`, `test/parity-harness.test.js`. It reads the built artifact rather than serving and crawling it, which is faster and needs no port. Asymmetric by `DD-007`: gaining content is fine, losing a component is a failure. The 16 dangling links are the already-out-of-scope content-side dead links, baselined as accepted so only growth fails. |
| WP-24 | Verify both `base` values end-to-end (`R-9`, `OP-008`). | **Done, and it was not test-and-document.** The sub-path build found **95 internal links emitted without the prefix** — every `:button[]{link=/...}` href and every authored root-absolute markdown link, including all 14 download buttons `WP-13` had just fixed. New `withBasePrefix()` in `blob-files.js`, applied in `ButtonDirective` and `link-presentation`; sub-path artifact now has zero unprefixed root-absolute references. |

Exit: a green CI run publishes the artifact and the parity harness reports zero
regressions against the recorded baseline.

## Open Points (Phase 1+)

| ID | Question | Resolution | Status |
| --- | --- | --- | --- |
| OP-001 | Which profile/backend is the publish target? | `DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static` for GitHub Pages. Every other profile must still render every page without failing, omitting features where it cannot render them (lite shows a gallery as a highlighted code block). | **Resolved** — `R-1`, `R-11` |
| OP-002 | Match the live URL scheme exactly, or adopt our filename paths? | Filename paths, and accept compatibility changes where the old title-derived identity differed. Both profiles use the gentle shared rule; OKF continues to identify entries by bundle-relative paths. The author picks website URLs by naming files; title is a display label only. | **Resolved** — `R-6`, `R-7` |
| OP-003 | Does the lite filename-only identity contract change? | No — and now neither does full's. Both use filenames. The question dissolves: there is one contract, not two. | **Resolved** — `R-6` |
| OP-004 | Legacy uid aliases — permanent feature or migration aid? | Neither. No alias index is built. A broken uid is a content bug and is included in the downstream migration worklist. | **Resolved** — `R-7`, `R-17` |
| OP-005 | Is 350 MB an acceptable Pages artifact, and can `blobs/` and `public/images` be de-duplicated? | **Option A**: blob store stays canonical, ship nothing unreferenced. 349.8 MB → ~241 MB. Option B (serve source in place) is rejected — it would make the artifact *larger*. See the use-case table below for where blob storage earns its keep. | **Resolved** — maintainer |
| OP-006 | Which of breadcrumb / METADATA panel / footer refs / prev-next ship on the public site? | All of them, collapsed. Hidden by default behind a small arrow with sticky state, functionality unchanged, same pattern as the indexing status bar. | **Resolved** — `R-10` |
| OP-007 | What does a root-absolute asset path mean? | One meaning: the content root, falling back to `public/` if the file exists there. Not currently in any spec — WP-23 writes it into one. Content that assumed otherwise is fixed as content. | **Resolved** — `R-8` |
| OP-008 | Deploy as a user site (base `/`) or a project site with a base prefix? | Support both. `base` is an input, defaulting to `/`; the static config already reads `site`/`base` from env, so this is a test-and-document task, not a build change. | **Resolved** — `R-9` |
| OP-009 | Does the fetched content snapshot match what the live site was built from? | Uses the same fetcher against the same url, so yes by construction. No separate verification WP. | **Resolved** — maintainer |
| OP-010 | What exactly does "slugify a filename" do? | Preserve URL-unreserved filename characters and case; normalize only unsafe runs such as spaces. `_`, `.`, `~`, and `-` remain distinct literal path data. This follows OKF's path identity and ordinary GitHub filenames closely, and requires no HomeSmartMesh path renames. | **Resolved** — `R-12` |
| OP-011 | Do the graph button and `explore/` pages ship on the public site? | Yes. Both ship as intentional public discovery features and must work in full/json/static without `/__lite/*` runtime dependencies. | **Resolved** — `R-16` |
| OP-012 | How is the Phase 1 code/content split sequenced across two repos? | The content migration is isolated on `HomeSmartMesh/homesmartmesh.github.io@astro-huge-doc-migration`, and this manifest pins that branch for validation. The later one-commit publishing-action/content-reference cutover remains outside this packet. | **Resolved** — `R-17` |
| OP-013 | Do the local blob duplicates (`dataset/blobs` sidecar tree, 217.5 MB, accumulating across runs) get pruned? | `WP-25`: the JSON backend writes straight to the flat served dir and never stages through the sidecar, so the duplication stops being *created* rather than being cleaned up after. | **Resolved** — `R-14` |
| OP-014 | Should `external_storage_kb` become sqlite-only in name and effect? | Yes — scope it to the sqlite writer, or rename it to say what it does. | **Resolved** — `R-15` |
| OP-015 | The two C3 DevKit M1 documents are named after each other's titles, so under `R-6` their URLs read backwards. Merge, swap the filenames, or accept? | **Accept** (Option C). It is a content inconsistency, not a rendering issue, so the renderer stays unchanged and no content edit is made in this packet. The rich page serves at `/microcontrollers/esp32/esp32-c3-devkitm-1`. | **Resolved** — `R-18` |

### OP-010 — gentle path normalization

The official OKF v0.2 specification defines a Concept ID as the concept file's
path within the bundle, minus `.md`; its link examples use exact relative
paths. The renderer therefore preserves URL-unreserved filename characters
and case instead of imposing a dash-only naming convention. `_`, `-`, `.`, and
`~` are literal, distinct identity data. Only unsafe runs such as spaces are
normalized to a dash, with the collision guard retained for the rare case
where two unsafe names converge.

The earlier aggressive rule was rejected before Phase 2. Under the final rule,
`thread_sensortag.md` remains `/thread_sensortag/`, while
`thread-sensortag.md` would be a different document. Heading-anchor
normalization remains a separate, lowercase concern.

The HomeSmartMesh branch was corrected to retain every original content path.
Its combined diff from main has no renames: 21 Markdown files are modified to
remove three obsolete frontmatter `slug` keys and repair full-path card UIDs
or genuinely stale document links. The final rule exposed 50 unresolved card
rows and 34 unresolved link rows before those content edits; every row was
inspected, and a fresh collection of the corrected branch reports zero of
either kind.

### OP-015 — the crossed C3 DevKit M1 documents

**Resolved: Option C, accept (`R-18`).** Raised during the 2026-07-25 takeover
from a side-by-side screenshot that looked like content loss. It is not: full
evidence in `implementation.md` ("Post-phase review diagnosis") and `test.md`
("Sparse-C3 re-verification"). The maintainer ruled it a content
inconsistency rather than a rendering issue, so nothing changes here. The
options below are retained as the record of what was weighed.

#### What is actually true

Two documents exist, and **each is named after the other's title**:

| Source file | `title` | Body | Live URL (title-derived) | Our URL (`R-6`, filename-derived) |
| --- | --- | --- | --- | --- |
| `c3-devkit-m1.md` | `ESP32 C3 DevKit M1` | 2 buttons, 288 B | `/…/esp32-c3-devkit-m1/` 200 | `/…/c3-devkit-m1` |
| `esp32-c3-devkitm-1.md` | `C3 Dev Kit M1` | full board page, 548 B | `/…/c3-dev-kit-m1/` 200 | `/…/esp32-c3-devkitm-1` |

Both documents exist and render on the live site too, with the same bodies. The
duplication predates the migration and is identical on HomeSmartMesh `main` and
`astro-huge-doc-migration`. Under the old title-derived scheme the crossing was
invisible, because the URL followed the title; under `R-6` the URL follows the
filename, so each URL now reads as the other document's name. Nothing is lost
and no renderer behaves incorrectly.

#### Blast radius of a content fix

Small and fully enumerated: the two files, plus **one** card uid
(`microcontrollers.esp32.esp32-c3-devkitm-1` in
`microcontrollers/esp32/readme.md`). Nothing else in the content set references
either document, and the stub is carded by nothing at all — it is reachable
only from the navigation tree, on the live site as much as here.

#### Options

| Option | Effect | Cost | Note |
| --- | --- | --- | --- |
| **A — merge** | Fold the stub's two buttons into the rich board page, delete the stub, name the survivor `c3-devkit-m1.md`. One C3 DevKit M1 document at `/…/c3-devkit-m1`. | 2 file edits, 1 deletion, 1 card uid | Ends the duplication instead of renaming it. The stub's two buttons (ESP32-C3 datasheets, Espressif user guide) are reference links that sit naturally on the board page. |
| **B — swap filenames** | Rename each file to match its own title: rich → `c3-devkit-m1.md`, stub → `esp32-c3-devkitm-1.md`. | 2 renames, 1 card uid | Fixes only the crossing. The duplication survives, as it does live. Also the closest URL to live's `/c3-dev-kit-m1/`. |
| **C — accept** ← **chosen** | No content change. Rich page stays at `/…/esp32-c3-devkitm-1`. | none | Consistent with `R-7` (urls are deliberately allowed to differ). It does leave a URL pair that reads backwards, which is why the diagnosis is written down here in full — the next reviewer who spots it should find this section rather than re-derive it. |

#### Why this is not folded into Phase 3

Phase 3 is asset fetch and artifact composition. This is a content-authoring
decision about which documents should exist and what they are called — the same
class of decision `R-7` reserves for the maintainer, and it touches the
migration branch rather than this repository. Phase 3 proceeds independently.

### OP-012 — scope boundary

There is no intermediate public deployment to coordinate in this repository.
The content edits are committed on
`HomeSmartMesh/homesmartmesh.github.io@astro-huge-doc-migration` at `2a0385c`,
and `manifest.yaml` pins that branch for end-to-end validation. Mainline and
the current public build remain untouched.

The later cutover is still one atomic change in the currently publishing
repository: point its action at this proven builder and switch to the migrated
content at the same time. Its action mechanics remain outside this packet.

### OP-005 — asset duplication: measured, with options

Measured on the 2026-07-25 full/static artifact (`dist`, 349.8 MB, 1301 files):

| Component | Size | Files | Referenced by any emitted page? |
| --- | --- | --- | --- |
| `dist/blobs` | 240.8 MB | 619 | 370 files / 240.3 MB yes; 249 files / **0.5 MB** no |
| `dist/images` (from `public/images`) | 86.8 MB | 327 | **8 distinct `/images/` refs in 115 pages**, several of them malformed fragments |
| `dist/_astro` | 13.3 MB | 154 | yes |

Cross-checking bytes rather than names: **189 of the 327 `public/images` files
(58.9 MB) are byte-identical to a blob** — they are the *source* of those blobs,
shipped a second time under their original name. The other 138 files (28.0 MB)
match no blob, meaning no markdown references them at all.

Every in-page image is served as `/blobs/<hash>.<ext>`; `asset_info.path`
retains the authored path (199 root-absolute `/images/**`, 65 relative). Source
images total ~278 MB across `content/` (191 MB, no gifs) and `public/images`
(87 MB); the content-addressed store collapses that to 240.8 MB, so **hashing
is already saving ~37 MB of genuine duplication.**

**Option A — blob store stays canonical; ship nothing unreferenced.**
Keep `/blobs/<hash>` as the served path. Copy `public/**` into the artifact only
for paths the built HTML references, and drop unreferenced blobs.
*Effect:* 349.8 MB → **~241 MB (−31%)**, no change to any rendered page.
*Cost:* one post-build (or integration-time) reference scan.
*Bonus:* hash-named files are immutable, so they can carry `cache-control:
immutable` — worth more on repeat visits than the byte saving.

**Option B — serve source assets in place, no blob copy for binaries.**
Rewrite image `src` to the asset's source path, ship the content tree, and keep
blobs only for derived/inline artifacts (code blocks, diagrams, tables).
Matches the "reference the data in source, don't copy it" intuition.
*Effect on size:* **negative.** The union of referenced image bytes is the same
either way, but serving by path re-introduces the ~37 MB the hash store
currently dedups, landing near **278 MB — larger than Option A.** It is a
readability and pipeline change, not a size optimisation.
*Cost:* substantial. `blob_uid` is the join key across `items`/`assets`/`images`
in the dataset, the sqlite backend depends on the store being self-contained,
and the extension serves blobs from cache where the workspace is not the web
root. The schema does admit a blob whose bytes live elsewhere
(`blob_store.path`, used today for external storage above `external_storage_kb`
= 512), so "a blob that is a reference" has a natural hook — but it is a change
to a contract shared by three backends and belongs in its own packet, not here.

**Why the blob copy exists** (the "was that a server idea?" question): yes,
essentially. The store predates static publishing. It gives sqlite a single
self-contained artifact, lets the extension serve assets without the workspace
being a web root, and dedups by content hash. For Pages specifically only the
last of those three still earns its keep — but it earns 37 MB.

**Option C — reference GitHub-hosted content instead of shipping it.** Point
image urls at `raw.githubusercontent.com` or the content repo's own Pages, so
the ~240 MB never enters the artifact. Not recommended: `raw.` is explicitly not
a CDN and is rate-limited, it adds a cross-origin runtime dependency to every
page, it breaks offline and lite entirely, and it makes the published site's
integrity depend on another repo's branch state. A same-origin `/blobs/` path
with immutable caching is better on every axis except artifact size, and Pages'
1 GB soft limit is not close to binding at 241 MB.

**Decision: Option A** (maintainer, 2026-07-25). It is the whole size win, needs
no contract change, and leaves Option B available later as a deliberate
architecture packet if human-readable asset urls become a goal on their own
merits.

#### Implementation caveat for WP-14

"Ship only what is referenced" is only safe if the reference scan sees *every*
way an asset url can reach the page. `<img src>` is the easy case; the scan must
also cover `:button[]{}` download hrefs (14 `/data/**` links, one of them
containing spaces and emitted unencoded into `href`), `<a href>`,
`srcset`, inline `style="background-image:url(...)"`, and any url built in
client JS. Scanning the **built HTML** rather than the source markdown catches
all but the last. Fail closed: if the scan cannot classify a file, ship it.

#### No JSON file in this system contains blob bytes

Verified, because an earlier draft of this section got it wrong and the
conclusion matters:

| File | Size | Blob bytes inside? |
| --- | --- | --- |
| `dataset/json/content.json` | **1.71 MB** | **none** — 619 `blob_store` rows, no `payload` field at all, while `sum(size)` = 240.8 MB |
| `dataset/json/pages/*.json` (lite) | **1.96 MB** total, largest 0.15 MB | **none** |
| `dataset/json/blobs/<hash>.<ext>` | 240.8 MB / 619 files | this is where every byte lives |

The JSON writer strips payloads by construction —
[`structure_json.js:163`](../../../../packages/content-structure/src/structure_json.js#L163),
*"Blob bytes live on disk (content-addressed); keep only metadata."* Payloads
are held in memory during collect, written out as files, then dropped from the
dataset. **A JSON dataset cannot grow with image size**, whatever the threshold
is set to.

#### What `external_storage_kb` actually controls, per backend

The knob does two different jobs depending on the writer, and only one of them
is the job its name suggests:

| Backend | ≤ threshold | > threshold | Does the threshold affect the dataset file's size? |
| --- | --- | --- | --- |
| **sqlite** | payload inlined into the `blob_store.payload` BLOB column ([`structure_db.js:1286`](../../../../packages/content-structure/src/structure_db.js#L1286)) | sidecar file `blobs/<year>/<month>/<hash[0:2]>/<hash>`, `path` recorded | **Yes** — this is what 512 KB was tuned for |
| **json** (full and lite) | payload held **in memory** during collect, then stripped | staged to the same sidecar tree, then also written flat | **No — zero effect** |

So for JSON the threshold is a **peak-memory vs. staging-disk** control, nothing
more. Setting it to 16 KB would not shrink `content.json` by a single byte,
because `content.json` holds no bytes; it would push nearly all 619 blobs
through the sidecar tree, growing that tree from 217.5 MB toward 240 MB, in
exchange for lower peak memory during collect. On this content set collect peaks
harmlessly and finishes in ~7 s, so there is nothing to buy.

Neither branch, in either backend, references the original source file. Both
copy. That is why `OP-005` Option B was not a small change.

Measured local duplication: the sidecar tree is 973 files / 217.5 MB — it is
date-sharded and content-addressed, so it *accumulates across collect runs*
rather than being overwritten — of which 104 files / 198.4 MB are byte-identical
to the flat served dir. **Only the flat served dir is copied into `dist`**, so
this costs developer disk and nothing at publish time (`OP-013`, `WP-25`).

#### Where blob storage earns its keep

| Use case | Where the bytes originate | Blob store? | Why |
| --- | --- | --- | --- |
| Code blocks, tables, diagram sources | **No source file exists** — derived from the markdown AST | **Essential** | There is nothing to reference. This is the store's irreducible job, and it is 249 of 619 blobs (0.5 MB). |
| SSR + sqlite, deployed without the content tree | content repo, absent at runtime | **Essential** | The DB is the entire artifact. Remove the store and the server has no bytes to serve. |
| Static Pages publish (our target) | content repo, present at build time | **Earns it** | Content-addressing collapses ~278 MB of source images to 240.8 MB (**37 MB saved**), and hash-named files can be cached immutably. Both survive into the artifact. |
| VS Code extension preview (lite) | the open workspace, on disk | **Convenient, not essential** | The workspace is not a web root, so images need *some* served path — but a path-mapped route over the workspace would also work. This is the one use case where Option B would be a genuine simplification. |
| Large binaries >512 KB | content repo | **Same as its use case** | The threshold changes storage location, not whether the store is involved. |
| Remote assets (12 `.glb` urls) | third-party origins | **No** | Never enters the store; rendered as a remote url. Already the behaviour. |

Read down the "why" column and the pattern is: the store is unavoidable for
derived content and for sqlite, pays for itself on static publishing, and is
merely convenient in lite. That is why Option B is not simply wrong — it targets
the one row where the store is optional — but it is the wrong trade here,
because it would give back the 37 MB the static publish is currently earning.

## Design Decisions (Phase 1+)

| ID | Decision | Resolution | Status |
| --- | --- | --- | --- |
| DD-001 | Slug source of truth | Slugified filename, full stop. No frontmatter chain, no title fallback, no profile gate. `frontmatter.slug` is ignored wherever it appears. | **Resolved** — `R-6` |
| DD-002 | Where the profile gate lives | No identity gate exists any more (`DD-001`), so the switch is gone rather than relocated. What differs by profile is *when* a file is opened — see the confirmed rule below. | **Resolved** — maintainer |
| DD-003 | One URL derivation | A single module owns `path → {slug, url, uid}`, imported by collect, `getStaticPaths`, the catch-all route, link rewriting, and the lite tree walk. | **Resolved** — accepted |
| DD-004 | uid compatibility | No alias map. The dotted-path uid is the only uid. Two files slugifying to the same url is an authoring error: first claimant wins, the loser is dropped with a `warn` naming both paths. | **Resolved** — `R-7` + accepted |
| DD-005 | Gallery directory expansion | Expand `gallery_dir` at collect time into the same `gallery_items` the `gallery` form produces. | **Done in Phase 0** |
| DD-006 | Static-vs-server client runtime | Components emit client scripts conditionally on `config.output`; a static page must contain no fetch to a route the static build did not emit, enforced by a build-time scan for `/__lite/` in the artifact. The `getStaticPaths` warning is a separate issue — see below. | **Resolved** — accepted |
| DD-007 | Parity is enforced by a harness | Per-page baseline (title, heading count, image count, iframe/model-viewer/table presence, dangling-link count), fails on regression. Maintainer inspection follows and is out of scope. | **Resolved** — accepted |

### DD-002 — confirmed rule

Confirmed by the maintainer 2026-07-25: *"lite never collects"* meant **at
startup**; reading frontmatter when a page is opened is fine.

> Identity — url, uid, ordering, and menu labels — never reads frontmatter, in
> any profile. Lite additionally opens no file during **startup**: the tree walk
> that builds navigation costs one stat per file and never reads contents.
> Frontmatter *is* read during the per-page parse, in both profiles, for display
> metadata only (OKF `type`/`description`/`resource`, plus `image`, `tags`,
> `date`) — including frontmatter of pages referenced from the open page.
> Nothing read there may feed back into identity.

This preserves `2026-07/19/okf-support` (`structure-db-lazy.js:880-898`) intact.
The testable invariant for `R-6`: opening a file must never change any url, uid,
menu label, or sort order.

### DD-006 — what `/__lite/` is

Request-time JSON endpoints for the VS Code extension preview, registered in
`src/middleware.js` (and the express wrapper `server/server.js`), specified in
[`specification/run-modes/spec.md`](../../../../specification/run-modes/spec.md):

| Endpoint | Purpose |
| --- | --- |
| `/__lite/version` | live-reload stamp the preview polls |
| `/__lite/navigation` | the side menu, fetched post-paint so first paint does not wait for it |
| `/__lite/runtime` | runtime identity for the in-viewer info surface, incl. diagram renderer routing |
| `/__lite/stats` | workspace/cache statistics for that info surface |

They are SSR-only by nature — a static artifact has no server to answer them, so
each one 404s and `lazy_navigation.js` renders its "Link index unavailable" bar.
The run-modes spec already carries the invariant this violates: *never emit a
client for an endpoint this run mode does not register*. So WP-15 is enforcing
an existing rule, not inventing one.

On the `getStaticPaths` warning: it is emitted because the same route file
serves both a prerendered and an on-demand configuration. Living with it is
acceptable, but the cleaner fix is for the route to export `getStaticPaths` only
under `output: 'static'` — the config is known at build time, so the export can
be conditional rather than always-present-and-ignored. Worth one attempt during
WP-15; if it fights Astro's static analysis, keep the warning and move on.

## Dependencies And Risks

- **WP-03 changes every URL.** `dataset/`, the html cache, and any stored
  relations keyed by url/uid must be rebuilt (`pnpm collect`), not migrated.
- **The migration crosses a repository boundary.** WP-03..WP-06 change code
  here. The resulting content edits are isolated and tested on the
  `astro-huge-doc-migration` branch, which this manifest pins. Changing the
  publishing action remains deliberately outside this packet (`R-17`); no
  intermediate public deployment uses this experimental builder.
- **Lite regression risk.** WP-03/WP-04 touch shared collector code and WP-04
  now explicitly folds the lite tree walk into the shared module. The
  extension's startup path and `pnpm bench:lite` numbers must be re-checked
  before closing Phase 1 (see `[[project-extension-performance]]`).
- **DD-002 is about startup, not about parsing.** Implement the confirmed rule
  under DD-002; a literal "lite never reads frontmatter" would delete the OKF
  columns shipped by `2026-07/19/okf-support`.
- **`content-structure` is now in-repo** (`packages/content-structure`), so
  these changes land here rather than in the frozen 2.2.4 sibling repo — but
  they also affect the VS Code engine, so they ship together.
- **Artifact size** is 349.8 MB and Option A takes it to ~241 MB, comfortably
  under the 1 GB Pages soft limit. Not a blocking risk at either number; it is
  deploy duration, not feasibility.

## Exit Criteria (whole packet)

Phase 0 has its own Definition of Done above; these are the criteria for the
packet as a whole.

1. `astro build --config astro.config.static.mjs` (full/json/static) exits 0 with
   no warnings about missing assets, and the lite target still builds (`R-2`).
2. All 73 document URLs resolve in the artifact, each derived from its file path
   by the single derivation module (`R-6`). Matching the live site's urls is
   explicitly **not** required (`R-7`).
3. Canonical `yaml cards` uid references resolve in focused fixtures; every
   unresolved HomeSmartMesh reference appears in the downstream migration
   report. Zero duplicate-slug warnings.
4. Zero pages contain raw directive text, an empty gallery, or a plain link
   where the live site renders `<model-viewer>` / a table / an iframe.
5. All 14 `/data/**` download buttons resolve. ✔ **met by WP-13**
6. A published page loads with an empty browser console and no `/__lite/**`
   requests. ✔ **met by WP-15**, enforced by `scripts/check-static-artifact.js`.
7. Every non-publish profile renders every page without failing (`R-11`), lite
   included — verified by the crawl, not by inspection.
8. Breadcrumb/metadata and footer-references/prev-next collapse by default and
   remember their state (`R-10`). ✔ **met by WP-22/WP-16**
9. The graph button and `explore/` pages are present and functional in the
   public static artifact, with no `/__lite/*` dependency (`R-16`). ✔ **met by
   WP-16**, with the graph trigger deliberately outside the collapsible band.
10. The artifact ships no unreferenced asset; its composition is reported by the
   build (`OP-005` Option A). **Outstanding — `WP-14`.** The composition report
   exists (`scripts/check-static-artifact.js`), but `public/**` selection does
   not.
11. The parity harness runs in CI and reports zero regressions against the
    recorded baseline. ✔ **met by WP-19** — recorded at 115 pages, wired into
    `pages.yml`; `test/parity-harness.test.js` runs it whenever `dist/` holds
    the full artifact.
12. A GitHub Pages deployment from the workflow serves the artifact, verified at
    both `base = /` and a sub-path base (`R-9`). **Partial** — both bases are
    verified end-to-end locally (`WP-24`, 95 unprefixed links found and fixed)
    and `pages.yml` exists, but it has never been dispatched, so the
    upload/deploy pair is unproven.

---

## Handover (2026-07-25)

Work paused after Phase 2 and resumed by maintainer instruction on the same
day. Everything below is what a fresh reader needs.

### Takeover state (2026-07-25)

- Phases 0, 1, 2, **4 and 5 are complete**. Phase 3 is partial: `WP-13` landed,
  and `WP-14`, `WP-21`, `WP-23`, `WP-25` are the only work left in the packet.
- Phases 4 and 5 were done in one pass by maintainer instruction, after Phase 3
  was started. They do not depend on the remaining Phase 3 asset work.
- Three findings from that pass are worth a reader's attention before touching
  the code:
  - **`WP-15`**: the repo `.env` sets `MICROWEBSTACKS_EXTENSION_MODE=true`, so
    the documented lite static build was baking the extension-preview surface
    into the artifact. Fixed by an output-aware client gate.
  - **`WP-24`**: 95 internal links were emitted without the base prefix. Only a
    sub-path build exposes this class of bug — run one before believing `R-9`
    holds.
  - **`WP-22`**: the index status bar was never actually sticky, though `R-10`
    describes it as the existing sticky pattern. It is now.
- Phase 1/2 changes remain in the working tree and intentionally uncommitted.
  Git history stays maintainer-owned.
- HomeSmartMesh stays pinned to `astro-huge-doc-migration` at `2a0385c`.
- The publishing-action cutover remains outside this packet (`R-17`).
- The sparse-C3 review observation was re-opened, re-verified against the live
  site, and closed as accepted-as-is (`R-18`, `OP-015`) — a content
  inconsistency, not a rendering issue. See “Post-phase review diagnosis: the
  sparse C3 page” in `implementation.md`.

### State

**Phases 0 through 2 complete and verified.** Phase 3+ is planned and **not
started**. No planning decisions remain open.

| Check | Result |
| --- | --- |
| Full test suite (fresh disposable install) | 97/97 |
| Pre-migration collect under the final identity rule | pass; 50 card + 34 link migration rows; zero duplicate identities |
| Fresh pinned-branch collect (`2a0385c`) | 73 documents; zero unresolved card or document-link diagnostics |
| Full static build | exit 0, 115 pages |
| Lite static build | exit 0, 76 pages |
| Phase 2 built-DOM audit | 2 YouTube embeds; 12 model viewers; 2 XLSX tables; 9 non-empty galleries; 0 raw iframe directives |
| `pnpm check:plans` | pass |

Phase 0 code is committed:

| Commit | Contents |
| --- | --- |
| `961227a` | Phase 0 — shared classifier, renderer fallback, sharp allowlist |
| `48a5871` | the `R-5` revert — `expand_galleries` removed, lite renders galleries again |

Phase 2 is complete in the working tree and intentionally paused for maintainer
review before Phase 3.

### Reproducing the builds

```bash
pnpm collect                                                          # rebuild the dataset first; the collector changed
MICROWEBSTACKS_DOTENV_OVERRIDE=false DOCS_PROFILE=full DOCS_BACKEND=json \
  DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs # publish target
DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs   # lite, must also pass
```

Both write to the same `dist/`, so the second overwrites the first — measure one
before building the other.

### Two traps that already cost time here

1. **The lite parse cache is not invalidated by a collector change.** Records in
   `dataset/json/pages/` are keyed by content hash, so after changing collector
   behaviour you must bump `RECORD_VERSION` in `src/libs/structure-db-lazy.js`
   *and* delete the directory locally, or you will measure the old behaviour and
   believe it.
2. **The repo `.env` sets `DOCS_PROFILE=lite`.** `pnpm collect` run with repo
   defaults still writes the dataset the *full* static publish reads. Never make
   collector output depend on the profile — see the reversed `DD-0.4`.

### What to pick up next

After maintainer review, start Phase 3 with the asset-fetch and artifact
composition work. Phase 2's feature counts were re-counted against the working
artifact and are recorded in `implementation.md` and `test.md`.

### Still open

None. Every OP and DD in this document carries a resolution and the ruling that
produced it. `OP-015` was the last to close, as accept-as-is under `R-18`.

### Superseded — do not resurrect

Reversals are recorded in place rather than deleted, so that a reader who
remembers an earlier decision finds out it changed instead of finding nothing:

- `WP-0.7` / `DD-0.4` — the `expand_galleries` opt-out. Withdrawn by `R-5`.
- `OP-0.2`'s first reading — "lite ignores galleries". Superseded by `R-5`.
- `OP-002`/`OP-004`'s original proposals — match live urls, alias legacy uids.
  Superseded by `R-6`/`R-7`.
- `OP-005` Options B and C — serve source in place; hotlink GitHub. Rejected on
  measurement by `R-13`.
- The aggressive underscore-to-dash route policy and its proposed content
  renames. Rejected by the maintainer; corrected under `OP-010`.
- The claim that small blobs are inlined into `content.json`. Wrong for JSON
  (true only for sqlite); corrected under `OP-005`.
