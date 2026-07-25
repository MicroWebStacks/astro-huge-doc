# Implementation — HomeSmartMesh Parity

## Progress

[##----] Phase 0/5 Done - both static targets build; Phases 1-5 planned and decided, no code started.

Phase 1+ carries no implementation yet. The rulings that shape it (`R-6`..`R-15`),
the two remaining open points (`OP-011`, `OP-012`), and the handover notes all
live in `plan.md`.

## Phase 0 — make the site build (complete)

### The defect

Two predicates disagreed about what a "gallery" fenced block is:

| Side | Location | Predicate |
| --- | --- | --- |
| Collector | `md_utils.js#createCodeEntry` | `meta === 'gallery'` |
| Renderer | `Code.astro` | `params.startsWith("gallery")` |

`content/microcontrollers/esp32/fire-beetle.md` uses ```` ```yaml gallery_dir ````.
The collector rejected it, so no `gallery_items` were written and the item's
`ast` stayed `null`; the renderer accepted it and dereferenced
`item.ast.gallery` → `TypeError` → the whole static build aborted.

The `{dir: <path>}` expansion the block needed (`collectGalleryAssets` →
`listGalleryDirFiles` → `addGalleryAsset`) was already implemented and correct.
It was simply unreachable behind the exact-match gate.

### Files changed

| File | Change |
| --- | --- |
| `packages/content-structure/src/code_blocks.js` (new) | `codeBlockKind(language, meta)` — the single classifier for `gallery` / `glb` / `cards`, prefix-matched. Imported by both the collector and `Code.astro`. |
| `packages/content-structure/src/md_utils.js` | `createCodeEntry` uses `codeBlockKind`. Gallery expansion stays unconditional — every caller gets the same items. |
| `packages/content-structure/index.js` | `SHARP_DECODABLE_EXT` allowlist; `collectImageMetadata` skips undecodable formats before calling sharp, at debug level. |
| `src/components/markdown/code/Code.astro` | Uses `codeBlockKind`; each custom-yaml branch now requires the data it consumes to exist, otherwise the block falls through to `<Highlighter>`. Dead `yaml_glb && isLite` branch removed (the generic fallback covers it). |
| `src/libs/structure-db-lazy.js` | `RECORD_VERSION` 6 → 7: v6 records for `gallery_dir` pages predate the classifier fix and hold no gallery items. |
| `test/gallery-blocks.test.js` (new) | 8 regression tests. |

### Decisions made during implementation

- **No `expand_galleries` flag (`R-5`, reversing `DD-0.4`).** An intermediate
  version of this work had the lite lazy parse skip gallery expansion, on the
  reading that `R-3` licensed it. It does not: lite already rendered galleries,
  so skipping them was a capability reduction, and Phase 0 removes nothing that
  worked. The flag, its plumbing and its tests are gone; expansion is
  unconditional. The footgun found while building it is still worth recording —
  any future switch here must not be keyed on `DOCS_PROFILE`, because
  `pnpm collect` writes the `content.json` that the full/static publish reads
  while the repo `.env` defaults to `DOCS_PROFILE=lite`, so collecting with
  repo defaults would have silently stripped every gallery from a published
  site.
- **`warn` vs info (`OP-0.1`).** Malformed gallery yaml and an unreadable
  gallery directory keep their `warn` — those are authoring faults. Neither
  path renders error UI and neither throws; the renderer degrades them to a
  highlighted yaml block.
- **Renderer fallback is generic, not gallery-specific (`DD-0.2`).** Every
  custom-yaml branch now checks for the data it will consume. `Cards` was left
  as-is: it parses the fence body directly, already surfaces its own yaml
  error, and cannot throw.
- **`glb` widened from exact match to prefix** as a side effect of the shared
  classifier. No content in this set uses `yaml glb`, and it removes the second
  latent copy of the same bug.

### Verification

| Check | Result |
| --- | --- |
| `pnpm test` | **86/86** (was 78; +8 new) |
| `pnpm collect` (default lite `.env`) | pass, ~7 s, 73 docs / 3517 items / 639 assets / 393 images, **no warnings** |
| Full static build (`DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static`) | **exit 0**, 115 pages, 61.5 s |
| Lite static build (`DOCS_OUTPUT=static`, repo `.env`) | **exit 0**, 76 pages, 69.7 s |
| Full artifact crawl, all 73 document URLs | 0 missing, **0 error pages**, 13 thin |
| Lite artifact crawl, all 73 document URLs | **0 error pages**, 17 URL misses, 10 thin |
| Gallery render, full: 3dprinting / house / rovi / fire-beetle | gallery container + 44 / 12 / 18 / 4 images |
| Gallery render, lite: same pages | **identical** — 44 / 12 / 18 / 4 |

The 13 thin pages (full) and the 17 lite URL misses are **pre-existing Phase 1
scope** — dangling card uids and the dataset-url/route drift respectively — not
Phase 0 regressions. Both were present in the pre-Phase-0 survey.

### Deviations from the plan

- `WP-0.6` (sharp allowlist) was added mid-flight from the `OP-0.3` ruling that
  Phase 0 leaves no non-fatal warnings.
- `WP-0.7` was added, implemented, and then **withdrawn**. It made gallery
  expansion opt-out so the lite lazy parse could skip it. That reduced a lite
  capability that already worked, which `R-5` rules out of Phase 0 scope. The
  code, the flag and its two tests were removed; nothing of it remains.
- The plan assumed lite needed a gallery fallback it did not previously have.
  It did not — lite rendered galleries all along, and still does. The fallback
  is still worth having, but as the crash guard it was always meant to be: it
  fires when a block genuinely yields no items (bad yaml, missing directory),
  not as a profile-level opt-out.

## Discovery (pre-Phase 0)

The parity baseline in `plan.md` — 34/73 divergent URLs, 38/45 dangling card
uids, the `/__lite/**` 404s in static output, the missing iframe/glb/xlsx
rendering and `/data/**` assets — was measured by building this repo three ways
(lite SSR, full/json SSR, full/json static) and diffing every page against
<https://homesmartmesh.github.io/> with a headless browser. Throwaway harness
and screenshots under `.tmp/parity-2026-07-25/`.
