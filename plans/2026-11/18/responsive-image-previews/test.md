# Validation

## Automated checks

- Full unit suite: `node --test "test/**/*.test.js"`: 231 passed, one optional
  parity test skipped (232 total at that run). A subsequent added JSON/SQLite
  byte-resolution test also passed with all five preview tests.
- `node scripts/check-plans.js`: 46 packets checked, indexes consistent.
  Also passed `pnpm check:plans` using the cached pnpm 10.20.0 executable.
- `git diff --check`: passed.
- Actual generator tests cover dimensions, alpha, EXIF portrait orientation,
  animation/SVG pass-through, tiny images/no upscaling, identical-source coalescing,
  reuse, missing-output repair, source/settings/pipeline invalidation, bounded
  failures, missing Sharp, version-distinct originals, compressed SQLite sidecars,
  base-aware URLs, private index rejection and export totals.

## Isolated integration fixture

All scratch scripts, logs, images and outputs are under
`.tmp/image-preview-tests/`. No manifest fetch or source-content changes.

- Real `md-render build --workspace <fixture> --out-dir <fixture>/dist --base
  /docs/` passed. Automatic collect generated four preview files, 2,994 bytes;
  HTML contains width descriptors, intrinsic dimensions, lazy/async attributes
  and base-prefixed previews, with original gallery anchors retained.
- Full SQLite collect passed; second collect reported zero generated, zero
  regenerated, four reused. Full SQLite SSR production build passed.
- Full SQLite SSR runtime: rendered page, WebP GET/HEAD, conditional 304,
  immutable caching and 404 for the private `index.json` all passed.
- Edge browser at 390x844 and 1440x1000: responsive preview selection, every
  candidate served as WebP, no original blob request before interaction, card
  aspect ratio, PhotoSwipe opening/navigation/closing passed. Mobile and desktop
  screenshots inspected; the inspection exposed and led to the card CSS fix.
- Local staging with `--no-vendor` confirmed `optionalDependencies.sharp` and
  the included generation/render modules. Full vendoring passed its size gate:
  436.6 MB, 27,997 files; the bundle contains neither Sharp nor better-sqlite3.
  Packed tarball: 116,268,954 bytes. Installed that tarball into an isolated npm
  consumer with `--omit=dev` (optional dependencies included). The installed
  engine's real CLI build passed, generated all four previews (2,994 bytes) and
  exported responsive HTML. This verifies the packaged dependency path used by
  the Action, without a publish or consumer pin update.
- Lite collect and production SSR build passed. A runtime loader forbidding
  Sharp/SQLite imports still allowed the page/cards/gallery to render with original
  blob URLs. The existing collector reported its handled missing-Sharp metadata
  fallback; the preview generator itself was skipped.
- `scripts/check-static-artifact.js` did not finish scanning the synthetic static
  artifact's large client bundle after several minutes and was stopped. No gate
  success is claimed. Candidate fetch/MIME checks and browser navigation completed
  independently. Its artifact composition report now recognizes `image-previews`.

## Environment and limits

- The default pnpm/Corepack shim was broken. Used the cached pnpm 10.20.0
  executable to restore dependencies with `--frozen-lockfile`. Offline restore
  lacked archives; registry restore completed. Restored files needed elevated
  tool access for verification due to sandbox EPERM reads.
- Playwright's matching bundled Chromium was unavailable; browser validation
  used the installed Edge channel.
- No engine release, consumer version update, deployment, live-site performance
  measurement, or full HomeSmartMesh 44-image byte-budget rerun. Synthetic fixture
  success does not prove a production LCP improvement or production delivery.
