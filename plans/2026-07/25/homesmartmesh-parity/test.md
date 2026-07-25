# Test Notes — HomeSmartMesh Parity

Environment: Windows 11, Node 22, pnpm workspace, content set = HomeSmartMesh
(73 documents, 199 MB) fetched per `manifest.yaml`.

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
