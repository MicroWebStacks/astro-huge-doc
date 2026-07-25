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
  render (galleries were the example) may fall back to a plain highlighted
  code block. It may never crash a page or abort a build.
- **R-4 — Phase 0 comes first and is real work.** No further phase planning is
  trustworthy until the site builds and pages can actually be compared. Phases
  1-5 below are provisional and will be re-derived from a working build.

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
| WP-0.4 | Regression fixtures + tests: `yaml gallery` (list form), `yaml gallery_dir` (dir form), and a malformed gallery. Assert the first two produce `gallery_items` and the third degrades to a code block rather than throwing. | **Done** — `test/gallery-blocks.test.js`, 9 tests |
| WP-0.5 | Record the DoD verification run in `test.md`. | **Done** |
| WP-0.6 | Skip sharp for formats it cannot decode instead of warning per asset (`OP-0.3`). | **Done** |
| WP-0.7 | Gallery expansion is opt-out per parse call (`expand_galleries`), not keyed on `DOCS_PROFILE` (`DD-0.4`). | **Done** |

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
| OP-0.2 | Is `gallery_dir` a distinct authoring form or an alias of `gallery`? | Same feature: `gallery_dir` takes a directory path where `gallery` takes an image list, and both must reach the same outcome — expanded and rendered where galleries are enabled, ignored (highlighted code block) where they are not. | **Resolved** — maintainer |
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
| DD-0.4 | Gallery expansion is switched by a per-call collect flag (`expand_galleries`, default true) that the lite lazy parse opts out of — **not** by `DOCS_PROFILE`. Keying it on the profile would make the exported `content.json` profile-dependent, so running `pnpm collect` under a lite `.env` would silently strip galleries from a full/static publish. | High |

### Phase 0 findings worth carrying forward

- **`pnpm collect` takes ~7 s** on this content set, so making it a mandatory
  pre-build step costs nothing.
- **Gallery was the only build blocker.** With it fixed, both targets complete:
  full/json 115 pages, lite 76 pages, zero error pages in either artifact.
- **The lite parse cache is versioned** (`RECORD_VERSION` in
  `structure-db-lazy.js`) but is *not* invalidated by a collector change on its
  own — it must be bumped by hand whenever parse output changes shape. Bumped
  to 7 here.
- **13 of 73 pages in the full artifact still render thin**, all of them
  landing pages emptied by the dangling card uids. That is the Phase 1 headline
  and is now measurable rather than hypothetical.

---

## Phases 1-5 — provisional

Per `R-4`, the phases below are the shape derived from a *broken* build. They
are recorded so the discovery work is not lost, but each is to be re-confirmed
against the working artifact before any of it is committed as scope.

### Phase 1 — Identity and URL parity

| WP | Work | Notes |
| --- | --- | --- |
| WP-03 | Reinstate the frontmatter slug chain in `packages/content-structure/src/collect.js#get_slug`: `frontmatter.slug` → `title_slug(title)` → filename. Full profile only, gated so the lite contract is untouched (`DD-001`, `DD-002`). | Closes 34/73 URL divergences. |
| WP-04 | Extract one URL/slug derivation module used by collect, the `[...url].astro` route, and link rewriting, so `content.json.documents[].url` is byte-identical to the emitted route (`DD-003`). | Closes root cause C. |
| WP-05 | Add a legacy uid alias index (`<parent-folder>.<slug>`, root → `generic.<slug>`) and resolve `yaml cards` uids through it (`DD-004`). | Closes 38 dangling card refs; restores 8 landing pages. |
| WP-06 | Rewrite internal markdown links through the resolved target document's served URL, never the raw filename. Fail loudly (or mark unresolved) instead of emitting a 404 href. | Closes the `usb_dongle` / `thread_sensortag` / `esp32_remote` link class. |
| WP-07 | Emit a redirect map for any URL the live site serves that the new scheme would not (`OP-002`). | Only needed if `OP-002` resolves to anything other than "match live exactly". |

Exit: all 73 document URLs served; zero internal-link 404s; the live site's URL
set is a subset of ours (or 301s into it).

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
| WP-14 | Measure and budget the artifact: 345 MB today (241 MB `blobs/` + 88 MB `images/`). Determine the overlap between content-addressed blobs and `public/images` and stop shipping both where they are the same bytes (`OP-005`). | GitHub Pages soft limit is 1 GB; the current number is workable but wasteful and slow to deploy. |

Exit: every asset the live site serves resolves; artifact size understood and
justified.

### Phase 4 — Static-mode runtime correctness and publish chrome

| WP | Work | Notes |
| --- | --- | --- |
| WP-15 | Guard `/__lite/*` clients (`lazy_navigation.js`, `lite_relation_indexer.js`) on `config.output !== 'static'` so the static artifact never issues them and never renders the "Link index unavailable" bar (`DD-006`). | Currently two console 404s + a visible failure bar on every published page. |
| WP-16 | Introduce a published-site chrome profile: decide per-element whether breadcrumb, METADATA/frontmatter panel, preview-lock/monitor toolbar, graph button, and `explore/` ship publicly (`OP-006`). | The live site shows a top nav, a section side menu, a right-hand TOC, heading anchor links, and a footer. |
| WP-17 | Head/branding parity: `<title>` (already correct on full), `<link rel="icon">` pointing at the fetched favicon, and a footer. Optionally add `description`/OG tags — the live site has none, so this is an improvement rather than parity. | |

Exit: a published page has a clean console, no SSR-only requests, and no
extension-only affordances.

### Phase 5 — Deployment and regression guard

| WP | Work | Notes |
| --- | --- | --- |
| WP-18 | Add a GitHub Pages workflow driving the existing `action.yml` (`output=static`, `backend=json`, `profile=full`) → `actions/upload-pages-artifact` → `actions/deploy-pages`. | The reusable render action already exists (`specification/reusable-render/spec.md`); only the Pages wiring is missing. |
| WP-19 | Promote the parity harness (build → serve → crawl all document URLs → diff structural metrics against the live site) into `test/` so regressions are caught, not rediscovered. | The `.tmp/parity-2026-07-25/compare.mjs` prototype already produces the numbers in this plan. |

Exit: a green CI run publishes the artifact and the parity harness reports zero
regressions against the recorded baseline.

## Open Points (Phase 1+, provisional)

None of these block Phase 0. They are recorded from the broken-build survey and
must be re-checked against the working artifact before being decided.

| ID | Question | Proposal | Confidence | Status |
| --- | --- | --- | --- | --- |
| OP-001 | Which profile/backend is the publish target? | `DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static` — matches the existing reusable action, needs no native deps in CI, and already produces correct titles/labels/order. | High | **Resolved** — maintainer ruling `R-1` |
| OP-002 | Match the live URL scheme exactly, or adopt our filename slugs and 301 the old ones? | Match exactly (title-slug). 34/73 URLs are affected; the site has years of inbound links and cross-page `uid` references authored against that scheme. Redirects are strictly more work and worse for SEO. | High | Open |
| OP-003 | Does the lite/VS Code filename-only identity contract change? | No. Gate the frontmatter slug chain on `profile !== 'lite'`. The lite contract exists for lazy parsing without reading frontmatter, and this plan must not regress extension startup cost. Reinforced by `R-2`. | High | Open |
| OP-004 | Legacy uid aliases — permanent feature or migration aid? | Permanent, documented alias resolution. Rewriting 45 uid references in fetched upstream content would violate the "fetched content is source material" rule. | Medium-High | Open |
| OP-005 | Is 345 MB an acceptable Pages artifact, and can `blobs/` and `public/images` be de-duplicated? | Investigate before deciding. Likely: keep `blobs/` as the canonical served path and ship `public/images` only for paths referenced by absolute `/images/**` URLs in content. Needs a measured overlap first. | Low-Medium | Open |
| OP-006 | Which of breadcrumb / METADATA panel / preview toolbar / graph / `explore` ship on the public site? | Ship `explore` and the graph (genuine improvements over live); hide the breadcrumb, METADATA panel, and preview/monitor toolbar behind the extension profile. | Medium | Open |
| OP-007 | Content links already dead on the live site (`/docs/**`, `/networks/**`, `/frameworks/chip/`, `/applications/voronoi`) | Out of scope. Report upstream as a content issue; do not synthesise redirects for URLs the reference site itself 404s. | High | Open |
| OP-008 | Deploy as the user site (`homesmartmesh.github.io`, base `/`) or a project site with a base prefix? | User site, `base = '/'`, `site = 'https://homesmartmesh.github.io'`. The static config already reads both from env. | High | Open |
| OP-009 | Does the fetched content snapshot match what the live site was built from? | Assume yes for planning; the predicted title-slugs matched live URLs on every page spot-checked. Re-verify after WP-03 by diffing our URL set against a crawl of the live sitemap. | Medium | Open |

## Design Decisions (Phase 1+, provisional)

| ID | Decision | Proposal | Confidence |
| --- | --- | --- | --- |
| DD-001 | Slug source of truth | `frontmatter.slug` → `title_slug(frontmatter.title)` → slugified filename, applied in `collect.js#get_slug`, active only when `profile !== 'lite'`. Restores the `content-structure@1.1.10` behaviour without touching the lite path. | High |
| DD-002 | Where the profile gate lives | In the collector config (a `collect.identity: 'frontmatter' \| 'filename'` manifest key derived from the profile), not scattered through components. One switch, testable in isolation. | Medium-High |
| DD-003 | One URL derivation | A single module owns `path → {slug, url, uid}`; `collect`, `getStaticPaths`, the catch-all route, and link rewriting all import it. Today three call sites derive it independently, which is exactly how root cause C happened. | High |
| DD-004 | uid compatibility | Keep the dotted-path uid as canonical (it is unambiguous). Build a secondary alias map `<parent>.<slug> → sid` at collect time, persisted in the dataset, and resolve card/link uids through canonical-first-then-alias. Log an ambiguity warning if an alias is not unique. | Medium-High |
| DD-005 | Gallery directory expansion | Expand `gallery_dir` at collect time into the same `gallery_items` the `gallery` form produces, so the renderer stays dumb and the asset list is complete for blob collection. Do not resolve directories at render time (the big-doc approach) — it cannot participate in the blob store. | High |
| DD-006 | Static-vs-server client runtime | Components emit client scripts conditionally on `config.output`. A static page must contain no fetch to a route the static build did not emit. Add a build-time check that scans the artifact for `/__lite/` references. | High |
| DD-007 | Parity is enforced by a harness, not by inspection | The crawl+diff harness records a baseline per page (title, heading count, image count, iframe/model-viewer/table presence, dangling-link count) and fails on regression. | Medium-High |

## Dependencies And Risks

- **WP-03 changes every URL.** `dataset/`, the html cache, and any stored
  relations keyed by url/uid must be rebuilt (`pnpm collect`), not migrated.
- **Lite regression risk.** WP-03/WP-04 touch shared collector code. The
  extension's startup path and `pnpm bench:lite` numbers must be re-checked
  before closing Phase 1 (see `[[project-extension-performance]]`).
- **`content-structure` is now in-repo** (`packages/content-structure`), so
  these changes land here rather than in the frozen 2.2.4 sibling repo — but
  they also affect the VS Code engine, so they ship together.
- **Upstream content drift.** The fetch pulls a moving target; `OP-009` should
  be re-checked at deploy time, not just once.
- **Artifact size** (345 MB) makes each CI deploy slow; if `OP-005` finds no
  safe de-duplication, expect multi-minute upload steps.

## Exit Criteria (whole packet)

Phase 0 has its own Definition of Done above; these are the criteria for the
packet as a whole.

1. `astro build --config astro.config.static.mjs` (full/json/static) exits 0 with
   no warnings about missing assets, and the lite target still builds (`R-2`).
2. All 73 document URLs resolve in the artifact and match the live site's URLs
   (or are covered by an agreed redirect map).
3. 45/45 `yaml cards` uid references resolve; no landing page renders an empty
   card grid.
4. Zero pages contain raw directive text, an empty gallery, or a plain link
   where the live site renders `<model-viewer>` / a table / an iframe.
5. All 16 `/data/**` download buttons resolve.
6. A published page loads with an empty browser console and no `/__lite/**`
   requests.
7. The parity harness runs in CI and reports zero regressions against the
   recorded baseline.
8. A GitHub Pages deployment from the workflow serves the artifact.
