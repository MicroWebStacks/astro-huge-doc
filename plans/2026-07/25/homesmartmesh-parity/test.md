# Test Notes — HomeSmartMesh Parity

Environment: Windows 11, Node 22, pnpm workspace, content set = HomeSmartMesh
(73 documents, 199 MB) fetched per `manifest.yaml`.

## Round 9 run — sibling order and rail density (2026-07-27)

`R-25`, `R-26`. Lite dev server on 4389 plus a Chromium (Playwright) pass, and
a full static build for the publish target.

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | Authored `order` in `content/microcontrollers/*/readme.md` | esp32 1, riscv 2, stm32 3, nrf52 4, nrf53 none |
| 2 | Lite pages rail under Microcontrollers | `ESP32, Risc-V, STM32, nRF52, nRF53` — pinned in authored order, unpinned last. Matches the reference |
| 3 | Lite ESP32 children | `Datasheets, ESP32-C3 0.42 Oled, Software, Waveshare S3 3.5 Inch display, Timer Cam OV3660, TTGO T-Display, TTGO T5-EPaper, M5 Stick C Plus, FireBeetle, M5 Atom Lite, ESP-Now, ESP-Mesh` (orders 1,1,3,5,11,12,13,14,15,16,20,21) then the 9 unpinned A→Z |
| 4 | App bar, lite | `Home \| Robotics \| 3D Printing \| Web \| Microcontrollers \| Frameworks \| Protocols \| Other` — matches the reference; was alphabetical |
| 5 | App bar + rail, **full/json** backend | byte-identical ordering to lite |
| 6 | `astro build --config astro.config.static.mjs` (full/json/static, scratch outdir) | **exit 0**, 75 `index.html`. `microcontrollers/esp32/c3-devkit-m1/index.html` carries the same 26 labels in the same order |
| 7 | Chromium, rail measured (`getComputedStyle` + rects) | row height **22px** uniform (was 36px, and 45px where a label wrapped); font **13px** (was 13.6px); indent **9px**/level (8px + 1px guide, was 16px); header **28px** (was 40px) |
| 8 | Same page, dark theme screenshot | Whole ESP32 subtree plus Risc-V / STM32 / nRF52 / nRF53 visible in 1000px; previously about half the subtree |
| 9 | `node --test test/lite-menu-labels.test.js` | **8/8 pass** (5 label + 3 order) |
| 10 | `pnpm test` | **135/135 pass** |
| 11 | `pnpm check:plans` | pass |

Trap worth recording: the first density pass changed only `SubMenu.astro` and
the browser showed no difference. The extension preview renders the rail
**client-side** from `/__lite/navigation` into `.lazy-menu-tree`, styled by the
global `lazy_navigation.css`, whose selectors outrank the Astro-scoped ones.
Both files style the same rail; a change to one alone is invisible in the
profile the maintainer is looking at.

## Round 8 run — menu labels from the title (2026-07-27)

`R-24`. Lite backend driven directly (`DOCS_PROFILE=lite DOCS_BACKEND=json`)
against the normal HomeSmartMesh content.

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | `buildNavigationMenus('/microcontrollers/esp32/c3-devkit-m1')` app bar | `Home \| 3D Printing \| Frameworks \| Microcontrollers \| Other \| Protocols \| Robotics \| Web` — was lowercase slugs (`home \| 3dprinting \| frameworks \| ...`) |
| 2 | Same call, pages rail | `Microcontrollers > ESP32 > {ESP32 C3 DevKit M1, ESP32-C3 0.42 Oled, Datasheets, Debug, ESP-Mesh, FireBeetle, M5 Stick C Plus, TTGO T-Display, Waveshare S3 3.5 Inch display, …}` — matches the reference site's labels |
| 3 | Links on those same nodes | unchanged: `/microcontrollers/esp32/c3-devkit-m1`, `/microcontrollers/esp32/waveshare-s3-3.5`, … Still filename-derived |
| 4 | Cold walk (`dataset/json/filetree.json` removed) | `73 documents, 298 entries in 25 ms; 73/73 title head-reads` |
| 5 | Warm walk (snapshot present) | `… in 22 ms; 22/73 title head-reads` — the 22 are folder pages, which have no seedable file entry |
| 6 | `pnpm bench:lite --pages 1000 --fresh` | `1111 documents … in 95 ms; 1111/1111 title head-reads`. Isolated: 38 ms for the 1111 head-reads vs 9 ms to stat the same files |
| 7 | `node --test test/lite-menu-labels.test.js` | **5/5 pass** |
| 8 | `pnpm test` | **132/132 pass** (127 + 5 new) |
| 9 | `pnpm check:plans` | pass — 38 packets, indexes consistent |

Not covered: no browser pass. The labels were read out of the menu builders the
page renders from, not off a rendered screenshot. `bench:lite` also fails at its
last step (`SSR benchmark needs dist/server/entry.mjs`) — pre-existing, that
step needs a prior `pnpm build`, and it is after every measurement used here.

## Round 7 run — XLSX tables in lite (2026-07-27)

`R-23`. Lite dev server on port 4399 (`DOCS_PROFILE=lite astro dev`), existing
`dataset/json`, no re-collect.

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | `GET /microcontrollers/esp32/esp32-c3-devkitm-1` **before** the change | 200, 154 KB. `xlsx-table` appears only inside `TableXLSX.astro`'s injected CSS; the workbook is an `<a>` |
| 2 | Same route **after** | 200, 168 KB. `<section class="xlsx-table" aria-label="pinout">` + hydrated island; payload contains `J1 Header 9` and `RGB LED`; **0** "Unable to render spreadsheet" |
| 3 | `GET /microcontrollers/esp32/wall-display` (second workbook) | 200, `<section class="xlsx-table" aria-label="Pinout">`, no fallback |
| 4 | `astro build` (server output, scratch `MICROWEBSTACKS_OUTDIR`) | exit 0; `grep` finds `import { read, utils } from 'xlsx'` in the emitted server chunk — i.e. externalized, so the staged engine must vendor it |
| 5 | `node --test "test/**/*.test.js"` | **127/127 pass** |

Not covered: the packaged extension. `packages/md-render` still holds the
2026-07-24 engine, so this needs `pnpm build && pnpm ext:reinstall` (which will
now vendor `xlsx`) before the installed preview shows the table.

## Phase 2 Definition-of-Done run (2026-07-25)

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | Full `pnpm test` in a disposable workspace installed from the lockfile with a fresh pnpm store | **97/97 pass** |
| 2 | `node --test test/phase2-markdown-features.test.js` | **6/6 pass** |
| 3 | Full JSON/static Astro build against the normal HomeSmartMesh content and dataset | **exit 0**, 115 pages |
| 4 | Audit all emitted HTML for the Phase 2 components | 2 YouTube embeds; 12 model viewers across 9 pages; 2 XLSX tables; 0 XLSX fallback errors |
| 5 | Audit directive and gallery output | 0 raw iframe directives; 9 gallery containers / 130 gallery images; `fire-beetle` has 1 container / 4 images / 0 raw `gallery_dir` blocks |
| 6 | `pnpm check:plans` | pass |

The two iframe embeds are on `robotics/rovi`. The XLSX tables are on
`microcontrollers/esp32/esp32-c3-devkitm-1` and
`microcontrollers/esp32/wall-display`. Representative external model links are
on `3dprinting/voronoi` (four viewers) and
`microcontrollers/nrf52/thread_sensortag`.

The repository's existing pnpm store contains unreadable cached manifests for
`glob` and an older `esbuild` on this Windows machine. A disposable workspace
under `.tmp/` was installed from the unchanged lockfile using a fresh store,
then used for the full suite and static build. The in-app browser bootstrap was
unavailable, so the rendered artifact was inspected at the DOM level; no
interactive screenshot pass was performed.

## Phases 4 and 5 Definition-of-Done run (2026-07-25)

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | `node --test "test/**/*.test.js"` | **120/120 pass** (104 + 6 base-prefix + 10 parity-harness) |
| 2 | Full JSON/static build | **exit 0**, 115 pages, 30.6 s |
| 3 | Lite static build (`R-2`) | **exit 0**, 76 pages, 30.0 s |
| 4 | Default SSR build | **exit 0**, 26.5 s |
| 5 | `node scripts/check-static-artifact.js` on the full artifact | **no page-reachable SSR-only route references**; 3 dead preview chunks reported |
| 6 | Same gate on the lite static artifact | **clean** — the surface is gone from the artifact the repo `.env` used to bake it into |
| 7 | `node scripts/parity-metrics.js` | 115 pages; 598 headings, 419 images, 2 iframes, 12 model viewers, 3 tables, 9 galleries / 130 gallery images, 0 raw directives, 16 dangling links; **no regressions against the recorded baseline** |
| 8 | Sub-path build (`MICROWEBSTACKS_BASE=/astro-huge-doc/`) | **exit 0**, 115 pages |
| 9 | Scan the sub-path artifact for unprefixed root-absolute `href`/`src` | **95 before the fix → 0 after** |
| 10 | Dev server with the repo `.env` (extension mode, output `server`) | indexer bar, lazy navigation and preview-history controls all still render; both collapsible bands present |
| 11 | `pnpm check:plans` | pass |

### WP-15 — what the artifact contained before and after

Counted across the lite static artifact's 76 pages, built with the repo `.env`
exactly as the plan's reproduction command says:

| Marker | Before | After |
| --- | --- | --- |
| `lite-index-status` (the "Link index unavailable" bar) | 76 pages | **0** |
| inline `/__lite/index-control` fetch | 76 pages | **0** |
| `/__lite/*` reachable from any page | yes | **none** |
| `_astro` chunks containing `/__lite/` | 2, linked from no page | 3, linked from no page — reported, `--prune` removes them |

The `data-lazy-navigation` string still appears in every page: it is a CSS
selector in the inlined `lazy_navigation.css`, not a rendered attribute. Checked
directly rather than assumed.

### WP-24 — the sub-path failure

The first sub-path build attempt was run from Git Bash, which rewrote
`MICROWEBSTACKS_BASE=/astro-huge-doc/` into `C:/Program Files/Git/astro-huge-doc/`
before Node saw it. That is MSYS path conversion, not a code defect; the build
was repeated from PowerShell. Worth recording because the mangled output looks
exactly like a base-handling bug.

The real finding followed: 95 distinct root-absolute links emitted without the
prefix. The one match remaining after the fix is
`![Trick Tracker Schematics]{src="/images/trick_tracker/trick_tracker_schematics.svg" }`
on `microcontrollers/nrf52/trick_tracker` — malformed authored markdown that
renders as literal prose here and on the live site, not an emitted attribute.

### Not run

- `pnpm test:extension` (VS Code extension host). `WP-15` and `WP-22` both touch
  the extension preview path — the client gate and the indexer bar — so this
  suite should run before the extension is released. The dev-server check in
  row 10 covers the same surfaces at the HTML level but is not a substitute.
- A real GitHub Pages deployment. `pages.yml` is `workflow_dispatch`-only by
  design (`R-17`) and has never been dispatched; its build steps are the same
  commands rows 2, 5 and 7 run locally, but the upload/deploy pair is unproven.

## Phase 3 WP-13 run (2026-07-25)

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | `node --test test/fetch-manifest.test.js` | **7/7 pass** |
| 2 | `node --test "test/**/*.test.js"` | **104/104 pass** (97 pre-existing + 7 new) |
| 3 | Fetch only the two new manifest entries via `MICROWEBSTACKS_MANIFEST_PATH` | archive resolves to `2a0385c`; `public/data` 17 files / 3.1 MB; `favicon.svg`, `favicon.png`, `.nojekyll` copied |
| 4 | Confirm the additive `files:` entry did not reset `public/` | `public/images` 150 entries and `public/design` 12 entries intact |
| 5 | Probe every rendered `/data/**` href on the dev server | **14/14 → 200**, including the space-bearing `tag_four_ping 2021.07.17 17-26-01.json.zip` |
| 6 | Full JSON/static build | **exit 0**, 115 pages, 27.8 s |
| 7 | Cross-check every `/data/` href in the built HTML against `dist/data` | **0 missing** |
| 8 | Artifact contains the fetched loose files | `dist/.nojekyll`, `dist/favicon.svg`, `dist/favicon.png` present |
| 9 | Lite static build (`R-2`) | **exit 0**, 76 pages, 27.5 s |

Scoping the fetch to a temporary manifest avoids re-fetching `content/`, which
is what hit the Windows `EBUSY` during Phase 1 while the dev server held a file
open. The two new entries write to fresh destinations, so nothing in-use is
touched.

`dist` measured **356.9 MB / 1321 files** after `WP-13` (`blobs` 243 MB,
`images` 88 MB, `data` 3.1 MB, `_astro` 14 MB) — the updated `WP-14` baseline.

Three of the 17 `data/` files are referenced by nothing: two space-named
duplicates of underscore-named archives, and `ot-rcp-com-1.2-usb_27.08.2021.hex`
whose `.zip` is what the page links. That is `WP-14`/`WP-21` input, not a
`WP-13` failure.

## Sparse-C3 re-verification (2026-07-25, takeover)

Run to settle whether the side-by-side screenshots showed content loss. They do
not; the two documents are named after each other's titles. Ruled accepted-as-is
(`R-18`, `OP-015`).

| # | Probe | Actual |
| --- | --- | --- |
| 1 | `HEAD` the four candidate live URLs under `/microcontrollers/esp32/` | `c3-dev-kit-m1` **200**, `esp32-c3-devkit-m1` **200**, `c3-devkit-m1` **404**, `esp32-c3-devkitm-1` **404** |
| 2 | Body of live `/esp32-c3-devkit-m1/` | `<title>ESP32 C3 DevKit M1`, exactly the two buttons — the live twin of our sparse page |
| 3 | `GET` both routes on the local dev server | both **200** |
| 4 | Audit the local rich route `/microcontrollers/esp32/esp32-c3-devkitm-1` | 5 headings (`c3-dev-kit-m1`, `pio-board`, `esp32-c3-mini`, `schematics`, `pinout`), `c3-m1.webp`, board block, schematic, XLSX link — 166 KB of HTML |
| 5 | Grep the whole content set for references to either document | one: card uid `microcontrollers.esp32.esp32-c3-devkitm-1` in `microcontrollers/esp32/readme.md`. The stub is carded by nothing. |

The review screenshot was taken against the **lite** dev server, so the pinout
XLSX was a plain link there by design (`link-components.js` gated `.glb`/`.xlsx`
on `profile !== 'lite'`). The full artifact's XLSX-table count of 2 already
covers this page. **Superseded 2026-07-27 by `R-23`** — lite renders the table
too; see the Round 7 run below.

## Phase 1 Definition-of-Done run (2026-07-25)

| # | Command / inspection | Actual |
| --- | --- | --- |
| 1 | `pnpm test` | **91/91 pass** |
| 2 | Collect the unmodified content under the final identity rule | exit 0; 73 docs / 3517 items |
| 3 | Inspect `content.json` identities from a clean pinned fetch | 73 unique URLs, 0 duplicate identities, 16 underscore URLs, 1 URL containing a dot |
| 4 | Inspect persisted pre-migration diagnostics | 50 source-specific unresolved-card rows; 34 source-specific unresolved-document-link rows |
| 5 | Full JSON/static build | **exit 0**, 115 pages, 64.24 s |
| 6 | Lite static build | **exit 0**, 76 pages, 71.68 s; file walk reports all 73 documents |
| 7 | Default SSR build | **exit 0**, 58.91 s |
| 8 | `pnpm bench:lite -- --pages 1000` | 120 ms walk; 1 ms warm entry; 153 ms fresh-process cached entry; 1.81 s total to first page; 1.91 s cold SSR |
| 9 | `pnpm check:plans` | pass |

Focused fixtures prove that `Thread_SensorTag.md` retains its URL-safe spelling
and case, underscore and dash spellings remain distinct, frontmatter
`slug: custom-route` is ignored in favor of the filename, unsafe characters
normalize consistently, and a `.js` link cannot fall through to a same-stem
Markdown page.

A later post-documentation rerun in the normal workspace was blocked before
collection tests loaded because the local `glob@13.0.6` installation became
unreadable. Phase 2's fresh-store run above resolves the validation gap and
passes the expanded suite 97/97; the failure is local dependency-cache state,
not a repository-code failure.

### HomeSmartMesh migration validation

| Inspection | Actual |
| --- | --- |
| Audit the diagnostic arrays under the final rule | All 50 unresolved-card rows and all 34 unresolved-link rows classified and migrated |
| Content change isolation | Branch `HomeSmartMesh/homesmartmesh.github.io@astro-huge-doc-migration`, commit `2a0385c`; mainline untouched |
| Migration contents | No path renames; 21 modified Markdown files containing 3 frontmatter `slug` removals plus full-path card UID and stale-link repairs |
| Fetch the exact pinned manifest branch into clean destinations | pass; archive resolves to `2a0385c` for content, public images, and public design |
| Collect the freshly fetched branch | exit 0; 73 docs / 3517 items / 640 asset_info / 637 assets / 393 images; **0 unresolved card UIDs, 0 unresolved document links** |
| Full JSON/static build from the fresh fetch | **exit 0**, 115 pages |
| Legacy builder probe with exact `content-structure@1.1.10` | Collects 73 docs, but its short parent/title UIDs are incompatible with the new full-path UIDs; build later hits the pre-existing percent-encoded `Voronoi%20cells.jpg` route bug |
| In-place fetch to the normal ignored `content/` destination | blocked by Windows `EBUSY` on `content/protocols/ultrawideband/DRTLS.webp`; clean-destination fetch above proves the branch and manifest |

The pre-migration collect's 50 + 34 warnings were the migration worklist rather than
collection failures. They are retained above as the before-state; the
fresh-branch collect is the after-state and is clean. Vite's existing
chunk-size/empty-chunk warnings and SSR `getStaticPaths` warnings remain
later-phase scope.

## Phase 0 Definition-of-Done run (2026-07-25)

| # | Command | Expected | Actual |
| --- | --- | --- | --- |
| 1 | `pnpm test` | all green | **86/86 pass** (78 pre-existing + 8 new) |
| 2 | `pnpm collect` (repo `.env`, `DOCS_PROFILE=lite`) | exits 0, no warnings, galleries still exported | pass, ~7 s; 73 docs / 3517 items / 642 asset_info / 639 assets / 393 images / 619 blob files; **no warnings** |
| 3 | `MICROWEBSTACKS_DOTENV_OVERRIDE=false DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs` | exit 0 | **exit 0**, 115 pages, 61.51 s |
| 4 | `DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs` | exit 0 (`R-2`: lite must not break) | **exit 0**, 76 pages, 69.70 s |
| 5 | Serve both artifacts, crawl all 73 document URLs | no error pages | full: 0 missing / **0 error pages** / 13 thin. lite: **0 error pages** / 17 URL misses / 10 thin |
| 6 | Galleries render in **both** artifacts (`R-5`) | lite keeps what it had | pass — see matrix, counts identical |

Before this work, step 3 aborted at `microcontrollers/esp32/fire-beetle` with
`TypeError: Cannot read properties of null (reading 'gallery')` and produced no
artifact at all.

## Gallery behaviour matrix

Counted in the built HTML of both static artifacts: gallery container markers,
and `data-pswp-width` attributes (one per gallery image).

| Page | Form | Full artifact | Lite artifact | Before Phase 0 |
| --- | --- | --- | --- | --- |
| `3dprinting` | `yaml gallery` | 1 container, 44 images | 1 container, 44 images | rendered in both |
| `3dprinting/house` | `yaml gallery` | 1 container, 12 images | 1 container, 12 images | rendered in both |
| `robotics/rovi` | `yaml gallery` | 1 container, 18 images | 1 container, 18 images | rendered in both |
| `microcontrollers/esp32/fire-beetle` | `yaml gallery_dir` | 1 container, 4 images | 1 container, 4 images | **rendered in neither** — full aborted the build, lite showed a code block |

The two profiles are identical. `gallery_dir` is the one behaviour that
changed: the old exact-match gate excluded it from both profiles, so lite gains
a gallery it never had rather than losing one.

The `<Highlighter>` fallback is still reachable — it fires per block when the
collector produced no items (malformed yaml, missing directory), which no page
in this content set currently triggers. It renders through the normal
`code-shell`: language label "Yaml", copy/wrap controls, highlighting. No error
text, no warning banner, no console output.

## Unit and integration cover added

`test/gallery-blocks.test.js` — 8 tests:

- `codeBlockKind` maps `gallery`, `gallery_dir`, and `  GALLERY_DIR  ` to one
  kind; maps `glb` and `cards`; returns null for non-yaml fences, empty meta,
  and unknown metas.
- Both the list form and the `dir:` form expand to the same two gallery items.
  There is one code path and no profile switch, so this covers the lite lazy
  parse as much as the dataset export.
- A malformed gallery yaml and a `dir:` pointing at a missing directory both
  collect without throwing and yield no items.
- A gallery that yields no items is still collected as a `codeblock` asset with
  `ext: 'yaml'` and `params: 'gallery_dir'` — the collector-side pair to the
  renderer's fallback.

## Measurements taken for planning (not tests)

Recorded here so they are reproducible rather than re-derived. Method and
conclusions are in `plan.md` under `OP-005`.

| Measurement | Value |
| --- | --- |
| `dist` (full/static) | 349.8 MB / 1301 files |
| `dist/blobs` | 240.8 MB / 619 — 370 referenced, 249 (0.5 MB) not |
| `dist/images` | 86.8 MB / 327 — 8 distinct `/images/` refs across 115 pages |
| `public/images` byte-identical to a blob | 189 files / 58.9 MB |
| `public/images` matching no blob | 138 files / 28.0 MB |
| `content.json` | 1.71 MB, **zero blob bytes** (no `payload` field on 619 rows) |
| `dataset/json/pages/*.json` (lite) | 1.96 MB total, largest 0.15 MB, zero blob bytes |
| `dataset/blobs` sidecar tree | 217.5 MB / 973 files, accumulates across runs; 104 files / 198.4 MB duplicate the served dir |
| Content markdown filenames | 73 total: 57 already plain, 15 contain `_`, 0 uppercase, 0 spaces |

## Known gaps (not Phase 0 scope)

- 13 thin pages in the full artifact: landing pages whose `yaml cards` uids do
  not resolve (38 of 45 dangle). Phase 1, `WP-05`.
- 17 lite URL misses: `dataset/json/content.json` stores raw filenames while the
  lite route serves slugified ones. Phase 1, `WP-04`.
- `/__lite/navigation` and `/__lite/index-control` still 404 on every page of
  the static artifacts, with a visible "Link index unavailable" bar. Phase 4,
  `WP-15`.
- `fire-beetle` renders 4 gallery images where the live site shows 6. Not
  investigated — belongs to the Phase 1+ page-by-page comparison, which is now
  possible. Both profiles here agree on 4, so it is a collector/content
  question, not a profile one.

## Not run

- SQLite/full-native profile (`DOCS_BACKEND=sqlite`): the local `content.db`
  holds `demo/` content, not the HomeSmartMesh set, so it was not exercised.
  The collector change is backend-independent (it runs before the writer), but
  this is unverified on sqlite.
- VS Code extension integration (`pnpm test:extension`): not run. Lite's
  behaviour is unchanged except that `gallery_dir` now expands, and
  `RECORD_VERSION` 6 → 7 forces a one-off reparse of every cached page; both
  are the kind of thing that suite would cover, so it should run before the
  extension is released.
- Lite page-open latency after the `gallery_dir` change: not measured. Only
  `fire-beetle` uses that form, and its directory holds 4 images, so any effect
  is confined to one page's first parse.
