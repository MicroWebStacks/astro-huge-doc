# Implementation

## Progress

[####] Done - extension engine acquisition is bundled/local-only, cold and warm resolution timings are logged, and publishing/deployment surfaces remain unchanged.

## Changes

- Removed the extension's `https` import, npm tarball URL construction,
  `fetchBuffer()`, `installEngine()`, registry cache resolution, and registry
  test exports.
- Removed `microwebstacks.preview.engineSource`. An explicitly configured
  `enginePath` and source-checkout discovery remain available for development;
  installed VSIX builds otherwise require and activate their bundled payload.
- A missing, corrupt, or unusable bundled payload now fails directly with a
  packaging/activation error instead of reaching a network tier.
- Added first-use logs for archive size, the fact that no network request is
  made, read/digest/extract/validate/activate timings, and total local
  resolution including old-engine cleanup. Warm resolution logs a cache hit.
- Updated the extension manifest, README, changelog, integration fixture,
  release guidance, focused manifest tests, and the offline hydration
  diagnostic.

## Preserved Boundaries

- `.github/workflows/pages.yml`, `action.yml`, `scripts/release-engine.js`,
  `scripts/release-extension.js`, `scripts/package-extension.js`, and
  `scripts/stage-engine.js` were not changed.
- Engine publication remains coordinated and available for Action, CLI,
  Pages, and standalone consumers. The extension simply no longer uses that
  publication as a runtime acquisition source.
- Pre-existing unrelated working-tree changes were left untouched.

