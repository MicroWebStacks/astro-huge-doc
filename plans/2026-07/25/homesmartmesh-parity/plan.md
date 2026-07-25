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
Today it does not: the build **aborts**, and once unblocked the rendered
output diverges from the live site in URLs, page identity, several markdown
features, and static-mode runtime behaviour.

## Goal And Objectives

1. `astro build --config astro.config.static.mjs` completes with zero errors on
   the full HomeSmartMesh content set.
2. Every URL the live site serves is served by the static artifact (or 301s to
   it), so existing inbound links and bookmarks keep working.
3. Every markdown feature used by the content renders as it does live — no raw
   directive text, no empty galleries, no dropped 3D models or spreadsheets.
4. The published pages carry no SSR-only runtime calls, no console 404s, and no
   visible "index unavailable" chrome.
5. The site can be deployed from CI with the existing reusable render action.

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
  trustworthy until the site builds and pages can actually be compared. Phases
  1-5 below are provisional and will be re-derived from a working build.
- **R-5 — Phase 0 removes nothing that already worked.** Lite rendered
  galleries before this packet, so it must render them after. Phase 0 is the
  minimum change that makes the build succeed; any capability reduction is out
  of scope, whatever else it might buy. This supersedes the reading of `OP-0.2`
  that had lite ignore galleries.

### Round 2 (2026-07-25, after Phase 0)

Rulings on the Phase 1+ open points. These **redefine what parity means** — see
the note below the table.

- **R-6 — Identity is the filename, everywhere.** One rule for lite, full, and
  OKF: the url is the slugified relative file path, the label/title is for
  display only and never enters a url. Filenames with spaces or special
  characters are slugified. `frontmatter.slug` is **ignored** in every profile;
  the `frontmatter.slug → title_slug(title) → filename` chain is not
  reinstated. Authors control their urls by naming their files (`OP-002`,
  `OP-003`, `DD-001`).
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

**Consequence — parity is no longer url parity.** `R-1` set the publish target;
`R-6`/`R-7` now say our urls are *deliberately* allowed to differ from
<https://homesmartmesh.github.io/>. So the measured "34/73 divergent urls" stops
being a defect count and becomes a **content migration list**. What remains
under test is *render* parity: every page shows the same content, components,
and assets the live site shows, at whatever url our scheme produces.

## Scope

- In: URL/identity derivation, card resolution, markdown feature gaps, fetch
  manifest completeness, static-mode runtime guards, publish chrome, Pages
  deployment, a repeatable parity check.
- Out (non-goals):
  - Changing the lite/VS Code extension identity contract (see `DD-001`).
  - Redesigning the UI to pixel-match the live theme (colours, spacing, dark
    default are cosmetic and deliberately diverged — see `OP-006`).
  - Fixing content-side dead links that are already broken on the live site
    (`/docs/**`, `/networks/**`, `/frameworks/chip/`) — see `OP-007`.
  - Porting `swiper` and `pz_gallery` components: zero usages in this content.

## Measured Baseline (2026-07-25)

Evidence gathered by building/serving this repo and diffing against the live
site page-by-page with a headless browser. Working artifacts under
`.tmp/parity-2026-07-25/` (throwaway).

| Measurement | Result |
| --- | --- |
| Static build, `DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static` | **fails** at `microcontrollers/esp32/fire-beetle` — `TypeError: Cannot read properties of null (reading 'gallery')` (`src/components/markdown/code/Code.astro:57`) |
| Same build with a one-line null guard | passes, 115 pages, 42 s, 345 MB output |
| Documents in the content set | 73 |
| Document URLs that differ from the live site's URL | **34 / 73** |
| `yaml cards` uid references in content | 45 unique; **7 resolve, 38 dangle** |
| Pages rendering "thin" (< 400 chars of body) on full/json | 16, of which 8 are section landing pages emptied by dangling cards |
| `:iframe[]` directives | 2 (both render as raw attribute text) |
| Remote `.glb` links | 12 (render as plain links; live renders `<model-viewer>`) |
| `.xlsx` links | 2 (render as plain links; live renders a table) |
| `/data/*.zip|hex` download buttons | 16 (all 404 locally; all 200 live) |
| `yaml gallery` / `yaml gallery_dir` blocks | 8 / 1 (the `gallery_dir` one is the build blocker) |
| Console errors on every static page | `GET /__lite/navigation` 404, `GET /__lite/index-control?action=start` 404, plus a visible "Link index unavailable" status bar |

### Root cause groupings

**A. Identity is derived from filenames, not frontmatter.**
`src/libs/structure-db-lazy.js` states the lite contract explicitly ("Frontmatter
is never read"), and `packages/content-structure/src/collect.js#get_slug` dropped
the `title_slug(title)` fallback that the legacy collector
(`content-structure@1.1.10`) still has. Consequences, by profile:

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

Revised 2026-07-25 (round 2) against the working build and the round-2 rulings.
Phase 1 was rewritten outright; Phase 3's sizing WP and Phase 4's chrome WP are
now backed by measurements rather than estimates. What has **not** yet been
re-derived from the working artifact is the Phase 2 feature list (iframe, glb,
xlsx, directive audit) — those counts still come from the broken-build survey
and should be re-counted before Phase 2 starts.

### Phase 1 — One identity rule, and the content migration it forces

Rewritten under `R-6`/`R-7`. The original shape (reinstate the frontmatter slug
chain, alias legacy uids, emit redirects) is **dropped in full** — it existed to
preserve a compatibility the maintainer has chosen to break. The work is now to
delete the divergence rather than bridge it, and to fix the content.

| WP | Work | Notes |
| --- | --- | --- |
| WP-03 | Make filename-derived identity the only rule in the full profile: `get_slug` returns the slugified filename, `frontmatter.slug` is ignored, `title` becomes display-only. Slugify names with spaces/specials (`DD-001`). | Deletes code rather than adding it. Lite already behaves this way. |
| WP-04 | Extract one url/slug/uid derivation module imported by collect, `getStaticPaths`, the catch-all route, link rewriting, **and the lite tree walk**, so all five cannot drift (`DD-003`). | Closes root cause C, and is what makes `R-6` structurally true rather than a convention. |
| WP-05 | Resolve `yaml cards` uids against the new canonical uid. Report every unresolved uid as a build-time list — this is the content migration worklist, not a runtime fallback (`R-7`, `DD-004`). | 38/45 dangle today; each becomes a content edit. |
| WP-06 | Rewrite internal markdown links through the resolved target document's served url, never the raw filename. Unresolved links are reported, not silently emitted as 404 hrefs. | Same worklist mechanism as WP-05. |
| WP-07 | **Content migration**: apply the WP-05/WP-06 worklists to the HomeSmartMesh source — rename files whose desired url differs from their name, update card uids and internal links, remove `frontmatter.slug`. | Upstream content edit, in the content repo, not here. The one WP whose output is not code. |
| WP-20 | Duplicate-slug guard: two files slugifying to the same url is an authoring error. First claimant wins, the loser is dropped with a `warn` naming both paths (`DD-004`). | Lite already has this (`structure-db-lazy.js:587`); WP-04 makes it shared. |

Exit: every document url is derivable from its path by the single module; zero
unresolved card uids or internal links; zero duplicate-slug warnings. **Not** an
exit criterion any more: matching the live site's urls.

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
| WP-13 | Extend `manifest.yaml` fetch to `public/data`, `public/favicon.svg`, `public/favicon.png`, `public/.nojekyll`. | Closes 16 download-button 404s. `.nojekyll` is required for GitHub Pages to serve `_astro/`. |
| WP-14 | Ship `public/**` only for paths the built HTML actually references (`OP-005`, Option A). Add an artifact-composition report to the build. | **−86.8 MB of 349.8 MB (−25%)** on measured numbers, with no change to what any page renders. |
| WP-21 | Prune blobs that no emitted page references. | Measured at 249 files / **0.5 MB** — negligible, so this is hygiene, not a size lever. Do it with WP-14 or not at all. |
| WP-23 | Write the asset-path resolution rule into a spec and make one module implement it: a root-absolute path resolves against the **content root**, falling back to `public/` only when the file exists there (`R-8`, `OP-007`). Report content that resolves to neither. | No spec covers this today — `specification/` has no absolute-path rule at all, and `structure-db-lazy.js` carries its own `DD-3` comment about resolving against `public/`. 199 of 264 image assets are root-absolute, so this rule decides most of them. |

Exit: every asset the live site serves resolves; artifact size understood and
justified; the composition report is part of the build output so the next
regression is visible rather than discovered.

### Phase 4 — Static-mode runtime correctness and publish chrome

| WP | Work | Notes |
| --- | --- | --- |
| WP-15 | Guard `/__lite/*` clients (`lazy_navigation.js`, `lite_relation_indexer.js`) on `config.output !== 'static'` so the static artifact never issues them and never renders the "Link index unavailable" bar (`DD-006`). | Currently two console 404s + a visible failure bar on every published page. |
| WP-16 | Make the breadcrumb+metadata area and the footer references+prev/next area **collapsible**, hidden by default, with sticky state — the existing indexing-status-bar pattern, reused (`R-10`, `OP-006`). No functionality is removed, in any profile. | Applies everywhere, not just to the published site: one behaviour, not a chrome profile. |
| WP-22 | Extract the collapsible-bar affordance (arrow control + persisted state) from the indexing status bar into a shared component before WP-16 consumes it three times. | Prerequisite for WP-16. Keeps the third copy from being written by hand. |
| WP-17 | Head/branding parity: `<title>` (already correct on full), `<link rel="icon">` pointing at the fetched favicon, and a footer. Optionally add `description`/OG tags — the live site has none, so this is an improvement rather than parity. | |

Exit: a published page has a clean console, no SSR-only requests, and no
extension-only affordances.

### Phase 5 — Deployment and regression guard

| WP | Work | Notes |
| --- | --- | --- |
| WP-18 | Add a GitHub Pages workflow driving the existing `action.yml` (`output=static`, `backend=json`, `profile=full`) → `actions/upload-pages-artifact` → `actions/deploy-pages`. | The reusable render action already exists (`specification/reusable-render/spec.md`); only the Pages wiring is missing. |
| WP-19 | Promote the parity harness (build → serve → crawl all document URLs → diff structural metrics) into `test/` so regressions are caught, not rediscovered. | The `.tmp/parity-2026-07-25/compare.mjs` prototype already produces the numbers in this plan. Under `R-7` it compares *render* metrics, not urls. |
| WP-24 | Verify both `base` values end-to-end: `/` (user site) and a sub-path (project site). Every internal href, asset url, and `/blobs/` reference must carry the prefix (`R-9`, `OP-008`). | The static config already reads `site`/`base` from env, so this is expected to be test-and-document — but a hardcoded leading `/` anywhere breaks only in the sub-path case, which is exactly the case nothing currently exercises. |

Exit: a green CI run publishes the artifact and the parity harness reports zero
regressions against the recorded baseline.

## Open Points (Phase 1+)

| ID | Question | Resolution | Status |
| --- | --- | --- | --- |
| OP-001 | Which profile/backend is the publish target? | `DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static` for GitHub Pages. Every other profile must still render every page without failing, omitting features where it cannot render them (lite shows a gallery as a highlighted code block). | **Resolved** — `R-1`, `R-11` |
| OP-002 | Match the live URL scheme exactly, or adopt our filename slugs? | Filename slugs, and break compatibility. Same author owns the content and will rework it. Title-slug is unified with lite and OKF; the author picks urls by naming files; title is a display label only. | **Resolved** — `R-6`, `R-7` |
| OP-003 | Does the lite filename-only identity contract change? | No — and now neither does full's. Both use filenames. The question dissolves: there is one contract, not two. | **Resolved** — `R-6` |
| OP-004 | Legacy uid aliases — permanent feature or migration aid? | Neither. No alias index is built. A broken uid is a content bug and gets fixed in the content (WP-07). | **Resolved** — `R-7` |
| OP-005 | Is 350 MB an acceptable Pages artifact, and can `blobs/` and `public/images` be de-duplicated? | **Option A**: blob store stays canonical, ship nothing unreferenced. 349.8 MB → ~241 MB. Option B (serve source in place) is rejected — it would make the artifact *larger*. See the use-case table below for where blob storage earns its keep. | **Resolved** — maintainer |
| OP-006 | Which of breadcrumb / METADATA panel / footer refs / prev-next ship on the public site? | All of them, collapsed. Hidden by default behind a small arrow with sticky state, functionality unchanged, same pattern as the indexing status bar. | **Resolved** — `R-10` |
| OP-007 | What does a root-absolute asset path mean? | One meaning: the content root, falling back to `public/` if the file exists there. Not currently in any spec — WP-23 writes it into one. Content that assumed otherwise is fixed as content. | **Resolved** — `R-8` |
| OP-008 | Deploy as a user site (base `/`) or a project site with a base prefix? | Support both. `base` is an input, defaulting to `/`; the static config already reads `site`/`base` from env, so this is a test-and-document task, not a build change. | **Resolved** — `R-9` |
| OP-009 | Does the fetched content snapshot match what the live site was built from? | Uses the same fetcher against the same url, so yes by construction. No separate verification WP. | **Resolved** — maintainer |
| OP-010 | What exactly does "slugify a filename" do? | Undecided — see below. Determines every url in the site, and therefore the whole WP-07 content worklist. | **Open — next** |
| OP-011 | Do the graph button and `explore/` pages ship on the public site? | Undecided. `R-10` covered the breadcrumb/metadata and footer bars but not these two. | Open |
| OP-012 | How is the Phase 1 code/content split sequenced across two repos? | Undecided. Between WP-06 and WP-07 the published site is worse than today. | Open |
| OP-013 | Do the local blob duplicates (`dataset/blobs` external tree, 217.5 MB, accumulating across runs) get pruned, and by what? | Undecided. Costs developer disk only, never artifact size. Low urgency. | Open |

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
also cover `:button[]{}` download hrefs (16 `/data/**` links), `<a href>`,
`srcset`, inline `style="background-image:url(...)"`, and any url built in
client JS. Scanning the **built HTML** rather than the source markdown catches
all but the last. Fail closed: if the scan cannot classify a file, ship it.

#### What the external-storage threshold actually does

Worth stating plainly, because the phrase "large ones stay in place" describes
something the code has never done. `external_storage_kb: 512` chooses **where a
copy of the bytes is written**, not whether a copy is made:

| Blob size | Payload location | Also written to the served dir? |
| --- | --- | --- |
| ≤ 512 KB | inline, inside `content.json` / the sqlite BLOB column | yes |
| > 512 KB | sidecar file at `blobs/<year>/<month>/<hash[0:2]>/<hash>` | yes |

Neither branch references the original file. The threshold exists to keep the
dataset *loadable* — `content.json` is 1.7 MB precisely because the 240 MB of
images are not inline in it. That is the whole benefit, and it is a real one.

Measured on this working tree: the external tree is 973 files / 217.5 MB (it is
date-sharded and content-addressed, so it accumulates across collect runs rather
than being overwritten), of which 104 files / 198.4 MB are byte-identical to the
flat served dir. So locally the bytes exist two or three times. **Only the flat
served dir (`dataset/json/blobs`, 240.8 MB) is copied into `dist`**, so this
duplication costs disk during development and nothing at publish time. It is
worth a cleanup task, but it is not an artifact-size problem.

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
- **Phase 1 spans two repos and cannot half-land.** WP-03..WP-06 change the
  code here; WP-07 changes the content upstream. Between them the site is
  *more* broken than today — the 38 dangling card uids stay dangling and the
  34 url changes take effect. Sequence the merge so the content rework is ready
  before the identity change publishes, or publish from a content branch.
- **Lite regression risk.** WP-03/WP-04 touch shared collector code and WP-04
  now explicitly folds the lite tree walk into the shared module. The
  extension's startup path and `pnpm bench:lite` numbers must be re-checked
  before closing Phase 1 (see `[[project-extension-performance]]`).
- **DD-002's literal wording would delete the OKF frontmatter columns.** See
  the correction under DD-002; implement the restatement, not the sentence.
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
3. 45/45 `yaml cards` uid references resolve, after the content rework; no
   landing page renders an empty card grid. Zero duplicate-slug warnings.
4. Zero pages contain raw directive text, an empty gallery, or a plain link
   where the live site renders `<model-viewer>` / a table / an iframe.
5. All 16 `/data/**` download buttons resolve.
6. A published page loads with an empty browser console and no `/__lite/**`
   requests.
7. Every non-publish profile renders every page without failing (`R-11`), lite
   included — verified by the crawl, not by inspection.
8. Breadcrumb/metadata and footer-references/prev-next collapse by default and
   remember their state (`R-10`).
9. The artifact ships no unreferenced asset; its composition is reported by the
   build (`OP-005` Option A).
10. The parity harness runs in CI and reports zero regressions against the
    recorded baseline.
11. A GitHub Pages deployment from the workflow serves the artifact, verified at
    both `base = /` and a sub-path base (`R-9`).
