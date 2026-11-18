# Handoff: responsive image previews

Prepared 2026-11-18. Planning only; no renderer changes or deployment performed.

## Goal

Fix slow photo loading through reusable framework support for responsive previews. Keep originals for downloads and full-screen viewing. Reproduction: https://homesmartmesh.github.io/3dprinting/.

## Repository relationship and unresolved deployment provenance

- Content/site checkout: `C:\dev\HomeSmartMesh\homesmartmesh.github.io`, local HEAD `7ee076a`. Its README says it is built with `MicroWebStacks/astro-big-doc`. It contains its own Astro 4 renderer and static GitHub Pages workflow; it does not declare an `astro-huge-doc` dependency.
- Target framework: `C:\dev\MicroWebStacks\astro-huge-doc`, local HEAD `e38fb1e`, origin `MicroWebStacks/astro-huge-doc`. Astro 5 SSR, SQLite and versioned blob storage; `content-structure` is a sibling filesystem dependency (`../content-structure`).
- Target manifest currently fetches content from `MicroWebStacks/astro-big-doc` and `Roblibs/rovi_ros_ws`, not HomeSmartMesh. `manifest.yaml` has pre-existing user changes; preserve them.
- The published HomeSmartMesh HTML uses `/blobs/<hash>.<ext>`, while the inspected huge-doc renderer emits `/assets/<blob_uid>:<asset_uid>` and the site checkout emits `/assets/<content path>`. Therefore the live deployment cannot yet be attributed to this huge-doc revision. Do not claim that huge-doc is the current production generator without tracing the deployment.
- The optimization belongs in the reusable renderer. A huge-doc implementation alone will not fix GitHub Pages until the real publication path consumes it (or receives a compatible backport).

## Measured evidence

Fetched live HTML and issued HEAD requests for all 52 referenced images on 2026-11-18. All returned HTTP 200. Sizes are decimal MB from HTTP Content-Length:

| Group | Images | Bytes | MB |
| --- | ---: | ---: | ---: |
| Project cards | 8 | 8,183,707 | 8.18 |
| Gallery | 44 | 41,522,152 | 41.52 |
| Total | 52 | 49,705,859 | 49.71 |

- Live image tags have no `loading`, `srcset`, or intrinsic width/height attributes; no picture/source variants were present. Browsers eagerly request the gallery even below the fold.
- Kayak Trailer card: `/blobs/60067a5e07ed.png`, 3,207,117 bytes. House model card: `/blobs/6c988950523a.jpg`, 3,336,216 bytes.
- Largest gallery image: `/blobs/2017a5903789.png`, 4,348,883 bytes.
- Sampled image response cache policy: `max-age=600`. HTML was 69,212 bytes; one curl fetch took 1.94 seconds including 1.63 seconds to first byte. These are single-client samples, not a browser waterfall or controlled CDN benchmark.
- In-memory Sharp experiment on all 44 matching local gallery files: auto-rotate, resize to width 640 without enlargement, WebP quality 75. Original 41,522,152 bytes became 569,220 bytes (98.63% reduction). This is a thumbnail payload estimate, not measured page-load improvement; cards, originals opened by the viewer, scripts and styles are excluded.

## Relevant code

In astro-huge-doc:

- `src/components/markdown/cards/CardsMeta.astro`: resolves original via `getAssetBlob`, emits plain `<img src={asseturl}>`.
- `src/components/gallery/gallery.astro`: reads `getImageInfo` and original blob URL; uses that URL for both preview and PhotoSwipe link. Plain eager img, no responsive candidates.
- `src/libs/structure-db.js`: asset/blob/version lookup and image metadata. Source bytes may reside in SQLite or external blob storage; avoid assuming source files remain on disk.
- `src/pages/assets/[...uid].js`: existing asset endpoint; inspect its version, MIME, response and cache behavior before designing variant routing.
- `scripts/collect.js`: collection entry point delegated to `content-structure`.
- `server/cache/htmlCache.js`, `server/server.js`: review image-route exclusion and cached HTML invalidation when adding preview URLs.
- `src/components/markdown/image/MarkdownImage.astro`: follow-up integration point for ordinary images and Panzoom.

In the HomeSmartMesh checkout, `gen-webp-sizes.mjs` and `src/components/gallery/OptimisedImg.astro` already attempt manual filesystem thumbnails. Only one file was present under `public/images/3dprinting`; `build` only runs `astro build`. The local gallery uses lazy loading, unlike production. Use this as prior art, not an architecture to copy into the database renderer.

## Implementation plan

1. **Trace the production publication path.** Identify the repository, commit, workflow and asset exporter that generated live `/blobs/` URLs. Record whether GitHub Pages consumes static exported output or a different generator. Do not run `pnpm fetch` against the current manifest as an investigation shortcut: fetching clears destination content directories. Use a separate fixture/config for reproduction.
2. **Add one shared image-variant service.** Resolve bytes using the requested source blob/version. Start with a bounded width set (320, 640, 1280), WebP quality around 75, EXIF auto-orientation and no upscaling; expose actual output dimensions. Cache identity must include source content hash, transform settings and pipeline version. Handle alpha and unsupported formats deliberately; pass SVG through and preserve animated originals unless an explicit animation strategy is implemented.
3. **Generate variants once and reuse them.** Prefer a repeatable preparation/warmup step with bounded concurrency, with shared logic if SSR needs on-demand generation. Coalesce concurrent requests and write cache files atomically. Keep generated files outside fetched content and disposable build output. Avoid transcoding every image during every HTML render. Make original fallback explicit and report generation failures.
4. **Serve/export variants.** Use finite validated transform choices. Return correct MIME and dimensions; use immutable caching only for content-addressed variant URLs. Exclude binary routes from HTML caching. For a static GitHub Pages publication, materialize all referenced variants and their URLs before upload; no server endpoint may be required at runtime. Decide storage/schema changes only after examining content-structure's existing asset model; keep framework-specific derivatives separate unless a shared API is warranted.
5. **Use a shared responsive image component.** Supply `srcset`, layout-accurate `sizes`, intrinsic width/height, meaningful alt text and async decoding. Integrate cards and gallery first. Lazy-load below-fold previews, with an eager first visible/LCP candidate where justified by the layout. Preserve the original URL and original oriented dimensions for PhotoSwipe. Check how picture wrappers interact with existing grid/masonry CSS. Missing variants must still render usable originals.
6. **Wire preparation into the actual pipeline.** Document collect/preparation/build/server/export order and make the publisher generate previews automatically. Keep existing content Markdown and original image files intact. Update cached HTML as needed after renderer or transform changes. If production still uses big-doc or another exporter, deliver the corresponding integration/backport as a separate explicit step.

## Verification and acceptance

- Reproduce with the HomeSmartMesh 3D Printing fixture using an isolated manifest/output directory, preserving the current user-modified manifest.
- Check generated HTML: cards and gallery have responsive candidates, intrinsic dimensions and intended loading priorities; candidate URLs return valid images with matching actual widths and MIME.
- Test version correctness, source replacement invalidation, identical-source reuse, concurrent requests, unavailable derivatives, portrait EXIF rotation, alpha, SVG pass-through and small images without upscaling. Use focused tests for these contracts rather than markup snapshots.
- Repeat preparation and confirm no unnecessary transforms. If static publication is used, serve the export with a plain static server and verify every image candidate works without SSR.
- Visually inspect mobile and desktop layouts, high-DPI selection, masonry/grid, card heights and PhotoSwipe/Panzoom originals. Ensure preview changes do not fetch full-resolution gallery images before interaction.
- Capture a cold-cache browser waterfall before/after at the same viewport and network settings. Report selected candidate bytes, initial image bytes, request counts and LCP; separate scrolling/viewer downloads from initial navigation.
- Target for the 44-image gallery at 640px WebP: under 1 MB total preview bytes on this fixture (experiment: 0.57 MB). Only images near the viewport should be requested initially. Larger high-DPI candidates have separate budgets; do not claim 0.57 MB for every device.
- Run the normal project build and verify the actual HomeSmartMesh deployment after publication. A local huge-doc improvement is not evidence of a production fix.

## Scope and next action

Begin with deployment provenance and the shared variant API/storage decision. This handoff authorizes no content fetch, database migration, package update, commit, push or deployment; the current request is for a plan only. No sub-agent work is required.
