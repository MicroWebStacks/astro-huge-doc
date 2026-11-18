# Implementation

## Progress

[####] Done - collection previews, responsive rendering, serving/export and packaging implemented; validation recorded separately.

## Changes

- Full collection runs the new reusable image preview generator after source
  blobs are written. Lite skips generation without loading Sharp.
- Preview files/index live in the resolved generated store's `image-previews/`;
  static output receives only current indexed WebP files, never the private index.
  Astro middleware serves hash-addressed previews in dev and full SSR; the HTML
  cache bypasses preview routes.
- Transform identity uses actual source bytes, settings and pipeline version.
  Two workers bound decoding concurrency; identical jobs coalesce. Atomic file
  and index writes, orientation, animation pass-through, original fallback and
  a compact aggregate log are implemented.
- Cards and galleries share responsive markup; gallery original anchors, IDs and
  PhotoSwipe links remain intact. Lazy images use automatic rendered-width sizing
  with explicit layout fallbacks. First card is eager, remaining previews lazy.
- Staged packages declare Sharp as optional. Registry installs include native
  platform support; existing `--omit=optional` vendoring keeps lite native-free.
- Added real-image generation/cache/rotation/animation/fallback/export tests.
- Browser inspection caught intrinsic dimensions stretching card images; explicit
  `height: auto` preserves the original ratio under the card's max-width rule.
- Gallery alt text falls back to the collector's image name. Original oriented
  dimensions come from the exact prepared source rather than an unversioned
  metadata lookup when previews are available.

## Decisions and deviations

- Persistent cache across fresh CLI/Action runs remains deferred. Retained local
  stores reuse outputs; CLI/Action temporary stores are regenerated as agreed.
- No package version, consumer pin or deployment changes in this packet.
- Dependency verification initially found an incomplete workspace install.
  Offline lockfile restoration lacked required archives; registry restoration
  completed with the frozen lockfile. No tracked dependency versions changed.
- OP-002 resolved using optional Sharp in registry packages and existing
  `--omit=optional` vendor installation for the native-free lite bundle. Missing
  Sharp in a full install produces the agreed aggregate warning/original fallback.
- The first static CLI fixture generated four preview files totaling 2,994 bytes.
  A repeat full SQLite collect reused all four. These are synthetic fixtures,
  not a measurement of HomeSmartMesh production performance.
- Fully vendored staging and a tarball installed into a fresh npm consumer were
  verified. The installed CLI generated and exported previews successfully with
  optional dependencies included, matching the Action's installation policy.

## Follow-up risks

- Old hash-named preview files remain in retained local stores; only the current
  index is exported and counted. Persistent cache retention/pruning is deferred.
- The existing static artifact scanner stalled on the large client bundle and
  was stopped; see `test.md`. Candidate URL/MIME and browser checks passed.
- Full HomeSmartMesh visual/byte-budget and controlled LCP measurements were not
  repeated. Publishing the new engine and updating the consumer pin are separate
  maintainer-owned steps.
