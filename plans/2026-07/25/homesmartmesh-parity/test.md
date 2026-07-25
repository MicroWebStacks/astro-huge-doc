# Test Notes — HomeSmartMesh Parity

Environment: Windows 11, Node 22, pnpm workspace, content set = HomeSmartMesh
(73 documents, 199 MB) fetched per `manifest.yaml`.

## Phase 0 Definition-of-Done run (2026-07-25)

| # | Command | Expected | Actual |
| --- | --- | --- | --- |
| 1 | `pnpm test` | all green | **87/87 pass** (78 pre-existing + 9 new) |
| 2 | `pnpm collect` (repo `.env`, `DOCS_PROFILE=lite`) | exits 0, no warnings, galleries still exported | pass, ~7 s; 73 docs / 3517 items / 642 asset_info / 639 assets / 393 images / 619 blob files; **no warnings** |
| 3 | `MICROWEBSTACKS_DOTENV_OVERRIDE=false DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs` | exit 0 | **exit 0**, 115 pages, 60.66 s |
| 4 | `DOCS_OUTPUT=static npx astro build --config astro.config.static.mjs` | exit 0 (`R-2`: lite must not break) | **exit 0**, 76 pages, 68.03 s |
| 5 | Serve both artifacts, crawl all 73 document URLs | no error pages | full: 0 missing / **0 error pages** / 13 thin. lite: **0 error pages** / 17 URL misses / 10 thin |

Before this work, step 3 aborted at `microcontrollers/esp32/fire-beetle` with
`TypeError: Cannot read properties of null (reading 'gallery')` and produced no
artifact at all.

## Gallery behaviour matrix

Served from the two static artifacts and inspected in a headless browser.

| Page | Form | Full artifact | Lite artifact |
| --- | --- | --- | --- |
| `microcontrollers/esp32/fire-beetle` | `yaml gallery_dir` | gallery container, 5 images (directory listed) | no gallery; yaml code block with the standard code toolbar |
| `3dprinting` | `yaml gallery` | gallery container, 44 images | code block |
| `3dprinting/house` | `yaml gallery` | gallery container, 12 images | code block |
| `robotics/rovi` | `yaml gallery` | gallery container, 22 images | code block |

The lite fallback renders through the normal `code-shell` component — language
label "Yaml", copy/wrap controls, syntax highlighting. No error text, no
warning banner, no console output.

## Unit and integration cover added

`test/gallery-blocks.test.js` — 9 tests:

- `codeBlockKind` maps `gallery`, `gallery_dir`, and `  GALLERY_DIR  ` to one
  kind; maps `glb` and `cards`; returns null for non-yaml fences, empty meta,
  and unknown metas.
- The dataset export expands both the list form and the `dir:` form to the same
  two gallery items.
- `expand_galleries: false` (the lite lazy parse) leaves both forms unexpanded.
- A malformed gallery yaml and a `dir:` pointing at a missing directory both
  collect without throwing and yield no items.
- An unexpanded gallery fence is still collected as a `codeblock` asset with
  `ext: 'yaml'` and `params: 'gallery_dir'`, so it can be highlighted.

## Known gaps (not Phase 0 scope)

- 13 thin pages in the full artifact: landing pages whose `yaml cards` uids do
  not resolve (38 of 45 dangle). Phase 1, `WP-05`.
- 17 lite URL misses: `dataset/json/content.json` stores raw filenames while the
  lite route serves slugified ones. Phase 1, `WP-04`.
- `/__lite/navigation` and `/__lite/index-control` still 404 on every page of
  the static artifacts, with a visible "Link index unavailable" bar. Phase 4,
  `WP-15`.
- `fire-beetle` renders 5 gallery images where the live site shows 6. Not
  investigated — belongs to the Phase 1+ page-by-page comparison, which is now
  possible.

## Not run

- SQLite/full-native profile (`DOCS_BACKEND=sqlite`): the local `content.db`
  holds `demo/` content, not the HomeSmartMesh set, so it was not exercised.
  The collector change is backend-independent (it runs before the writer), but
  this is unverified on sqlite.
- VS Code extension integration (`pnpm test:extension`): not run. The lite
  behaviour change (galleries no longer expanded, `RECORD_VERSION` 6 → 7) is
  the kind of thing that suite would cover, and it should run before the
  extension is released.
