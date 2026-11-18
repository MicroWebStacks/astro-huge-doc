# Responsive image previews

## Status and purpose

Implemented on maintainer instruction, 2026-11-18; see
[implementation.md](implementation.md) and [test.md](test.md).
Original assessment was against local checkout `0de5d31`. No release, consumer
pin update or deployment is included in this packet.

The original [handoff](handoff.md) is preserved unchanged as historical input.
This plan supersedes its architecture assumptions, not its recorded measurements.
No live deployment or image measurements were repeated for this assessment.

## Assessment against current code

**Still relevant and technically feasible, but not ready to implement verbatim.**
Cards and galleries still use original images for previews. The optimization
fits the current asset model; it needs derivative generation and metadata, not
a replacement collector or a new publication architecture.

| Handoff point | Current evidence and implication |
| --- | --- |
| Cards and galleries need previews | `src/components/markdown/cards/CardsMeta.astro` uses `getAssetUrl`, including a frontmatter-path fallback. `src/components/gallery/gallery.astro` uses the original URL for both `<img>` and PhotoSwipe `<a>`. Neither emits `srcset`, lazy loading or intrinsic image dimensions. Preserve the card lookup fallback. |
| SQLite and `/assets/<blob>:<asset>` are the routing baseline | Outdated. `src/libs/structure-db.js` dispatches to SQLite, full JSON or lazy JSON; all implement `getAssetUrl`. `src/libs/blob-files.js` generates base-aware `/blobs/<hash>.<ext>` URLs. The referenced `src/pages/assets/[...uid].js` no longer exists. `/blobs/` alone cannot identify the production generator. |
| `content-structure` is a sibling dependency | Outdated. It is the private workspace package `packages/content-structure/`, declared as `workspace:*`. Keep renderer derivatives separate unless a concrete shared collector need emerges. |
| Manifest does not fetch HomeSmartMesh | Outdated. `manifest.yaml` selects `HomeSmartMesh/homesmartmesh.github.io` and its `astro-huge-doc-migration` branch, with content and public asset entries. Preserve the manifest and avoid fetch as discovery: destinations can be cleared. |
| Static export and publication must be invented | Already present. `astro.config.static.mjs` copies blobs into the artifact. `src/libs/render-build.js` shares collect/diagrams/build preparation with CLI preview. `.github/workflows/pages.yml` separately drives collect/static build. `action.yml` installs a pinned published engine. Both source and packaged paths need coverage. |
| Sharp can be a shared renderer dependency | Root `package.json` already lists Sharp, but `scripts/stage-engine.js` explicitly excludes it from staged engine dependencies. Lite must remain free of native dependencies under `specification/engine-profiles/spec.md`. A working source checkout is insufficient proof of packaged support. |
| Production consumer | Follow-up inspection of the remote HomeSmartMesh `main` workflow confirms the packaged engine `@microwebstacks/md-render@0.0.24`, Action SHA `fc0d7d2314abcb46830708dde46de9b0d90049db`, Node 24 and static Pages publication. The local HomeSmartMesh checkout is stale. The latest successful deployment run was not checked. |

The handoff reports 49.71 MB across 52 live images and a 44-image, 640px WebP
experiment at 0.57 MB. Those remain source-reported observations, not newly
validated results or a promise about LCP. The gallery's current CSS uses 10rem
grid cells with spans or 20rem masonry columns: `sizes` must account for actual
layout and device pixel ratio rather than treating every image as 640px wide.

## Goal and proposed scope

Make cards and gallery previews substantially cheaper to download while keeping
originals available for PhotoSwipe and downloads. Share rendering across all
three supported deployments: full/json/static, full/sqlite/server and
lite/json/server. Native generation may be specific to full deployments; lite
must retain usable images without importing Sharp.

Agreed first delivery:

- Version-aware original resolution and a shared derivative descriptor API
  exposing original URL/dimensions plus available preview URLs/actual dimensions.
- Bounded 320/640/1280 widths, WebP near quality 75, auto-orientation and no
  enlargement, subject to fixture/visual validation. SVG and animated originals
  pass through initially; alpha handling and unsupported/corrupt input fallback
  must be explicit.
- Shared responsive markup for cards/gallery, accurate `sizes`, intrinsic
  dimensions, alt text, async decoding and layout-aware loading priority.
- Automatic preparation/export for static output and a defined full SSR
  preparation path. No repeated transforms on every page render.
- Original fallback in lite and when derivatives are unavailable; preserve
  gallery IDs, deep links and preview-to-parent PhotoSwipe handoff.

Non-goals: ordinary Markdown/Panzoom integration in the first delivery, AVIF or
arbitrary transform parameters, changing original content, redesigning storage,
asset pruning, unrelated parity work, publication cutover or deployment.

## Agreed preparation, storage and logging

- Full `collect` automatically prepares previews after writing source blobs and
  before reporting completion. Keep generation in a reusable internal module;
  CLI build/preview and the publishing workflow already invoke collection.
  Astro rendering consumes the prepared index without transforming images.
- Store preview files and `index.json` under `image-previews/` in the resolved
  generated dataset/store, never under content or in the installed engine.
  A normal local store would use `dataset/image-previews/`; CLI/Action builds
  use their isolated temporary store instead. Static build copies the required
  preview files to `dist/image-previews/`, alongside original `dist/blobs/`
  files. SSR serves prepared previews; lite retains originals without Sharp.
- Identity includes source hash, normalized settings and pipeline version.
  Reuse matching files; generate missing files and regenerate previews when
  source/settings/pipeline change. New hash-named output replaces the index
  reference rather than overwriting an immutable old URL.
- Initial settings: WebP quality 75, widths 320/640/1280, auto-orientation and
  no upscaling. Preserve SVG/animation; unsupported inputs use originals.
  Generation failures warn with a summary and retain original-image fallback.
- Persistent cache across fresh CLI builds or GitHub runs is deferred. Each
  isolated run can generate from scratch; existing files in a retained local
  store can be reused. Generated files are not committed. The Action uploads
  the completed static artifact and its temporary data is disposable.
- Log a compact summary of a few lines, with no per-image success messages.
  Report source images considered, preview files generated, regenerated and
  reused, skipped source images, failed source images, and total bytes of the
  current referenced preview set (including reused files, excluding originals
  and stale cache files). Include a human-readable size and elapsed time.
  Count an output as regenerated only when a prior indexed variant of the same
  source asset and width is rebuilt; otherwise count it as generated. Counts
  are preview files, not source images, except where explicitly labeled.
  A fresh temporary run reports generated files and zero regenerated/reused.
  Failure details may be bounded separately; do not dump one line per image.

Illustrative output (not measured):

```text
Image previews: 52 source images; 140 generated, 4 regenerated, 12 reused
Image previews: 2 skipped sources, 0 failed sources; originals retained
Image previews: 156 preview files, 2.34 MB total (2340000 bytes); 1.8s
```

The remote consumer workflow is recorded at
<https://github.com/HomeSmartMesh/homesmartmesh.github.io/blob/main/.github/workflows/deploy.yml>.
Delivery requires a new engine release and consumer pin update after implementation;
neither is part of this planning change.

## Main stakes and dependencies

1. **Visitor performance versus artifact size.** Smaller selected previews and
   lazy loading reduce navigation traffic; retaining originals plus derivatives
   increases exported storage. Measure these separately. Cache hits should avoid
   repeat CPU cost, including across CLI builds if persistent reuse is selected.
2. **Published engine compatibility.** Choose how full builds obtain Sharp
   without making the extension depend on it. Account for staging, dependency
   resolution and installed-package verification, not just development imports.
3. **Correct originals and dimensions.** Resolve the requested asset version
   before transforming. `getImageInfo(uid)` is currently not version-parameterized;
   do not assume it matches version-resolved bytes or EXIF-oriented dimensions.
   Keep PhotoSwipe dimensions and originals consistent.
4. **Cache and output ownership.** Use source hash plus normalized settings and
   pipeline version for identity; generated bytes belong outside content and
   workflow folders. Decide persistent cache versus disposable output explicitly:
   CLI preparation currently uses a fresh temporary build root. Use atomic writes,
   bounded concurrency and request/job coalescing where applicable.
5. **Existing asset work.** Coordinate with the open
   [HomeSmartMesh parity packet](../../../2026-07/25/homesmartmesh-parity/plan.md):
   WP-14/WP-21 pruning must retain `srcset` candidates and original viewer links;
   WP-25 changes JSON blob staging; WP-23 owns source path resolution. Do not
   duplicate or silently absorb those work items. They are coordination risks,
   not prerequisites to invent new routing.
6. **Actual delivery.** Improving this checkout will only improve the public
   site when its publisher uses the updated engine. Identify consumer pins,
   release/backport needs and cutover separately.

## Open points for an implementation-ready plan

The maintainer accepted the defaults below; packaging and validation details remain.

| ID | Decision needed | Proposed direction / completion evidence |
| --- | --- | --- |
| OP-001 | Which delivery is first? | Resolved: cards/gallery first, with static preparation/export, full SSR prepared-image support and lite original fallback. Ordinary Markdown images follow later. |
| OP-002 | Generator dependency and packaging | Full-only optional/lazy Sharp loading or a separate preparation dependency; demonstrate a clean installed engine can optimize and lite never loads native modules. |
| OP-003 | Derivative API and storage | Storage resolved above; persistent cross-run caching deferred. Finalize the descriptor/index schema and safe stale-output handling during implementation. |
| OP-004 | Automatic preparation entry points | Resolved: hook into full collection after blobs are written. CLI/Action collect automatically; direct Astro builds consume prepared data. Verify orchestration does not omit collection. |
| OP-005 | Fallback and failure policy | Resolved: original fallback and warnings summarized in a few lines, with generated/regenerated/reused counts and total preview bytes as defined above. |
| OP-006 | Quality, loading and budgets | Defaults accepted: WebP 75, 320/640/1280, no upscaling; lazy below fold. Validate `sizes`, eager/LCP candidates and fixture byte budget during implementation. |
| OP-007 | Production consumer | Workflow identified: full/json/static packaged engine 0.0.24 on Node 24. New engine release and consumer pin update required; successful live deployment verification remains separate. |

## Proposed milestones

1. **Finalize implementation details.** Resolve Sharp packaging (OP-002),
   finalize descriptor/index schema, identify fixture bytes and baseline, and
   validate loading priorities/budgets against the agreed defaults.
2. **Implement generation and pipeline wiring.** Version-correct byte access,
   bounded transforms, cache/index, automatic full build preparation and static
   materialization. Keep lite original fallback; verify installed-package support.
3. **Integrate cards and gallery.** Reuse a shared component/helper, preserve
   original anchors, orientation, layout and gallery navigation behavior. Invalidate
   cached HTML as needed. Keep existing missing-asset behavior explicit.
4. **Verify and document delivery.** Record functional and browser evidence,
   build/storage costs and supported modes. Identify the consumer release/cutover
   work; deployment remains a separate maintainer instruction.

## Validation and exit criteria for implementation

- Isolated fixtures cover version selection/replacement, duplicate bytes,
  cache reuse, concurrency/atomic output, portrait EXIF, transparency, SVG,
  animation, tiny images, corrupt input and derivative fallback.
- Cards/gallery HTML references valid candidates with actual width descriptors,
  correct MIME, accurate `sizes`, intended loading priorities and intrinsic
  dimensions. Original viewer links and gallery deep-link/preview behavior work.
- Full static export works on a plain static server at `/` and a sub-path base;
  no runtime image endpoint is required. Full SQLite SSR works; lite renders
  originals without native dependency loading. Verify the packaged engine in a
  clean consumer, accounting for Sharp's platform binaries.
- Repeat preparation and demonstrate avoided transforms; report cold preparation
  time, cache storage and exported artifact size, including retained originals.
- Verify the compact log distinguishes first generation, regeneration and reuse,
  reports failed/skipped sources, and totals the referenced preview bytes without
  counting originals, stale files or duplicate references. No per-image success log.
- Compare cold-cache navigation at identical viewport/network settings: selected
  image bytes, initial requests and LCP, separately from scrolling/viewer loads.
  The handoff's under-1-MB gallery budget applies only to the validated set of
  44 previews at 640px, not every device's chosen candidates.
- Run focused tests plus appropriate source static/SSR builds and the existing
  preview-gallery check. Do not run destructive fetch against the working manifest.
- Implementation complete means the agreed framework scope is delivered. Live
  deployment verification belongs to the separately authorized publisher update;
  local success must not be described as a production fix.

## Assessment validation

This packet is based on source/document inspection only. No content fetch,
collection, benchmark, runtime build, package install or deployment was performed.
`pnpm check:plans` could not launch: pnpm is absent from PATH and the Corepack
shim points at a missing pnpm module. Running its exact package-script target,
`node scripts/check-plans.js`, passed: 46 packets checked, indexes consistent.
The archived handoff was verified byte-identical before removing the original
from `C:\dev\MicroWebStacks\handoff.md`. These notes describe the original
planning assessment; subsequent implementation validation is in `test.md`.
