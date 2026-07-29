# Extension Bundled-Engine-Only Startup

## Problem

The VS Code extension still contains a registry download tier even though every
release already ships the exact pinned engine inside the VSIX. Corporate
networks can make that unused acquisition path slow or unavailable, and the
first local hydration of the large bundled archive is not timed clearly enough
to distinguish filesystem work from a network fetch.

## Goal

Make installed-extension startup network-independent by resolving only an
explicit/local development checkout or the engine bundled in the VSIX, and add
clear first-use hydration timing logs.

## Scope

- Remove the extension's HTTPS engine download and registry resolution mode.
- Remove the user-facing `engineSource` setting; retain `enginePath` as the
  explicit development override and source-checkout discovery for repository
  development.
- Fail clearly when the required bundled payload is absent or invalid.
- Log cache hits and first-use archive size, read, verification, extraction,
  validation, activation, and total timings.
- Update extension-facing documentation, tests, and release guidance.

## Non-goals

- No changes to the GitHub Pages workflow or static deployment behavior.
- No changes to staging or publishing `@microwebstacks/md-render` for the
  Action, CLI, Pages, or other standalone engine consumers.
- No change to the bundled engine archive format.

## Implementation

1. Simplify extension engine resolution and configuration.
2. Add bounded local hydration timing observability.
3. Update focused tests and documentation.
4. Run extension-focused tests, the offline hydration diagnostic, plan
   consistency checks, and source-level guards for the untouched publishing
   surfaces.

## Risks

- Existing workspaces with `engineSource=registry` will have that obsolete
  setting ignored after upgrade and use the bundled engine.
- First-use extraction remains proportional to archive size and endpoint
  scanning; logging makes that cost visible but does not remove it.

## Exit Criteria

- Extension code contains no registry URL or engine download function.
- Normal installed startup cannot contact npm to acquire the engine.
- A cached bundle and a cold bundled hydration both emit useful timing logs.
- Pages and standalone engine publishing files remain unchanged.

