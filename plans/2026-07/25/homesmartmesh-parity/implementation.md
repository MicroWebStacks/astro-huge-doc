# Implementation — HomeSmartMesh Parity

## Progress

[##----] Phase 0/5 Done - both static targets build; parity work (Phases 1-5) not started.

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
| `packages/content-structure/src/md_utils.js` | `createCodeEntry` uses `codeBlockKind`; gallery expansion gated on `config.expand_galleries !== false`; debug-level note when a gallery is left unexpanded. |
| `packages/content-structure/index.js` | `SHARP_DECODABLE_EXT` allowlist; `collectImageMetadata` skips undecodable formats before calling sharp, at debug level. |
| `src/components/markdown/code/Code.astro` | Uses `codeBlockKind`; each custom-yaml branch now requires the data it consumes to exist, otherwise the block falls through to `<Highlighter>`. Dead `yaml_glb && isLite` branch removed (the generic fallback covers it). |
| `src/libs/structure-db-lazy.js` | Passes `expand_galleries: false` into its `collectDocument` call; `RECORD_VERSION` 6 → 7. |
| `test/gallery-blocks.test.js` (new) | 9 regression tests. |

### Decisions made during implementation

- **`expand_galleries`, not `DOCS_PROFILE` (`DD-0.4`).** The first cut keyed
  gallery expansion on the deployment profile. That was wrong: `pnpm collect`
  writes `dataset/json/content.json`, which the full/static publish reads, and
  the repo's own `.env` defaults to `DOCS_PROFILE=lite`. Collecting under that
  default would have silently stripped every gallery from a published site.
  The switch now belongs to the *parse call*, defaults to expanding, and only
  `structure-db-lazy` (the extension's on-demand parse, where the directory
  listing and per-image stat are the cost being avoided) opts out. Verified:
  `pnpm collect` under the lite `.env` still exports 639 assets / 393 images.
- **`warn` vs info (`OP-0.1`).** An unexpanded gallery is expected, so it logs
  at `debug`. Malformed gallery yaml and an unreadable gallery directory keep
  their `warn` — those are authoring faults, not expected fallbacks. Neither
  path renders error UI and neither throws.
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
| `pnpm test` | **87/87** (was 78; +9 new) |
| `pnpm collect` (default lite `.env`) | pass, ~7 s, 73 docs / 3517 items / 639 assets / 393 images, **no warnings** |
| Full static build (`DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static`) | **exit 0**, 115 pages, 60.7 s |
| Lite static build (`DOCS_OUTPUT=static`, repo `.env`) | **exit 0**, 76 pages, 68.0 s |
| Full artifact crawl, all 73 document URLs | 0 missing, **0 error pages**, 13 thin |
| Lite artifact crawl, all 73 document URLs | **0 error pages**, 17 URL misses, 10 thin |
| Gallery render (full): fire-beetle / 3dprinting / house / rovi | gallery container + 5 / 44 / 12 / 22 images |
| Gallery render (lite): same pages | no gallery container; yaml code block with the standard code toolbar |

The 13 thin pages (full) and the 17 lite URL misses are **pre-existing Phase 1
scope** — dangling card uids and the dataset-url/route drift respectively — not
Phase 0 regressions. Both were present in the pre-Phase-0 survey.

### Deviations from the plan

- Two work packages were added mid-flight: `WP-0.6` (sharp allowlist, from the
  `OP-0.3` ruling that Phase 0 leaves no non-fatal warnings) and `WP-0.7` (the
  `expand_galleries` gate, from the profile-keying footgun above).
- The plan assumed lite would need a gallery fallback it did not previously
  have. In fact lite *did* render galleries before this change; per the `OP-0.2`
  ruling it now deliberately does not, in exchange for keeping the lazy parse
  free of directory listing and per-image stat I/O. This is a deliberate
  reduction in lite capability, not a regression escaping notice.

## Discovery (pre-Phase 0)

The parity baseline in `plan.md` — 34/73 divergent URLs, 38/45 dangling card
uids, the `/__lite/**` 404s in static output, the missing iframe/glb/xlsx
rendering and `/data/**` assets — was measured by building this repo three ways
(lite SSR, full/json SSR, full/json static) and diffing every page against
<https://homesmartmesh.github.io/> with a headless browser. Throwaway harness
and screenshots under `.tmp/parity-2026-07-25/`.
