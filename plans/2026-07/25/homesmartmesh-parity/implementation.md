# Implementation — HomeSmartMesh Parity

## Progress

[###---] Phase 1/5 Done - shared path-only identity and migration reporting verified; awaiting maintainer review before Phase 2.

No Phase 2+ implementation has started. Every open point is resolved in
`plan.md`. The content migration branch is now part of Phase 1 validation; only
the external publishing-action cutover remains outside this packet (`R-17`).

## Phase 1 — one identity rule and a downstream migration worklist (complete)

### What changed

| File | Change |
| --- | --- |
| `packages/content-structure/src/identity.js` (new) | Dependency-free owner of `slugSegment`, path → `{slug,url,uid}`, canonical document-reference keys, and canonical card UIDs. |
| `packages/content-structure/src/collect.js` | Full collection derives identity only from the relative filename path. `frontmatter.slug` no longer affects slug, URL, or UID; titles remain display metadata. |
| `src/libs/structure-db-lazy.js` | Lite imports the same identity functions for its file walk and canonical link matching. `RECORD_VERSION` 7 → 9 invalidates cached outcomes from both the old profile-local rule and the briefly tested aggressive shared rule. Heading anchors call the shared sanitizer separately and remain lowercase. |
| `packages/content-structure/src/relations.js` | Markdown document references compare through the shared slug rule after exact-path lookup. Only extensionless and `.md` references get this fallback, so `foo.js` cannot accidentally resolve to `foo.md`. |
| `src/components/markdown/cards/Cards.astro` | Authored card UIDs are canonicalized before lookup. Only unsafe characters normalize; URL-safe `_` and `-` remain distinct. |
| `packages/content-structure/index.js` | Collection persists and prints a deduplicated, source-specific migration worklist for unresolved card UIDs and document links. |
| `manifest.yaml` | All three HomeSmartMesh fetch entries temporarily pin `astro-huge-doc-migration`, keeping the breaking content shape off mainline while it is tested. |
| `test/identity.test.js`, `test/okf-identity.test.js`, `test/okf-relations.test.js`, `test/okf-stage3.test.js` | Shared-rule, ignored-frontmatter-slug, canonical-reference, non-document-extension, and persisted-worklist coverage. |

### Result on the HomeSmartMesh snapshot

- 73 documents produce 73 unique URLs and UIDs; 16 URLs retain underscores,
  one retains a dot, and there are zero duplicate-identity diagnostics.
- Full and lite now preserve the exact URL-safe filename spelling:
  `thread_sensortag.md` remains `thread_sensortag`; a dash spelling is a
  different identity. This matches OKF's bundle-relative path identity and
  standard GitHub filenames.
- Every one of the 50 source-specific unresolved card-reference rows and 34
  unresolved document-link rows exposed by the final rule was inspected. The
  applied content migration has no path renames, removes three obsolete
  frontmatter `slug` keys, and repairs full-path UIDs and stale links across 21
  Markdown files.
- The migration is committed and pushed as
  `HomeSmartMesh/homesmartmesh.github.io@astro-huge-doc-migration`, commit
  `2a0385c`. Collection from a fresh manifest fetch reports **zero unresolved
  card UIDs and zero unresolved document links**.
- Canonical fixture references resolve, while genuinely missing references
  remain unresolved and render/report honestly.

### Decisions made during implementation

- Display titles stay profile-specific: full keeps the frontmatter title and
  order metadata; lite keeps its filename/folder label without reading content
  during startup. Only identity is shared.
- Canonical comparison follows exact lookup and applies only to document-like
  references. Asset extensions retain their own resolution path.
- Document identity preserves URL-unreserved spelling and case. Heading
  fragments remain independently lowercased, so heading behavior does not
  dictate filename identity.
- Migration diagnostics are deduplicated by `(source path, canonical target)`
  for cards and `(source path, authored target)` for links. Relation rows still
  retain every link occurrence for backlinks and context.
- `getStaticPaths` and the catch-all route consume canonical URLs through the
  backend document list; they do not re-derive paths locally.

### Verification

| Check | Result |
| --- | --- |
| `pnpm test` | **91/91 pass** |
| Pre-migration collect under the final identity rule | exit 0; 73 docs / 3517 items; 50 card + 34 link migration rows; zero duplicate identities |
| Fresh manifest fetch of migration branch | commit `2a0385c`; all content, image, and design entries fetched successfully |
| Collect freshly fetched migrated content | exit 0; 73 docs / 3517 items / 640 asset_info / 637 assets / 393 images; **0 card + 0 link diagnostics** |
| Full JSON/static build from freshly fetched migration | **exit 0**, 115 pages |
| Legacy `content-structure@1.1.10` compatibility probe | Collected all 73 documents but proved incompatible UID contracts (`esp32.*` vs `microcontrollers.esp32.*`); later failed on the pre-existing percent-encoded `/assets/3dprinting/Voronoi%20cells.jpg` route |
| Full JSON/static build | **exit 0**, 115 pages |
| Lite static build | **exit 0**, 76 pages; file walk finds all 73 documents |
| Default SSR build | **exit 0** |
| `pnpm bench:lite -- --pages 1000` | 1111 docs: 120 ms walk, 1 ms warm entry, 153 ms fresh-process cached entry, 1.81 s total to first page, 1.91 s cold SSR |

The Vite chunk-size, empty-lite-model-viewer, unused `node:path` import, and
dynamic-route `getStaticPaths` warnings are pre-existing later-phase scope; no
Phase 1 identity warning or build failure remains.

The normal in-place `pnpm fetch` could not replace
`content/protocols/ultrawideband/DRTLS.webp` because another local process holds
that file open on Windows (`EBUSY`). Fetching the exact same manifest entries
into clean temporary destinations succeeded, so this is local working-copy
state rather than a branch or archive failure.

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
