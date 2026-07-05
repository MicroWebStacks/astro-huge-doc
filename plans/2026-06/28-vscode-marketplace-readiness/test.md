# Validation

## 2026-06-28 - Planning Packet Review

Expected:

- Create a publish-readiness plan without changing extension runtime code.
- Keep the packet under `plans/` and avoid creating `implementation.md` before
  implementation work starts.
- Identify hard Marketplace blockers and maintainer design decisions.
- Ground the plan in current repo state and official VS Code publishing docs.

Actual:

- Created `plans/2026-06/28-vscode-marketplace-readiness/plan.md`.
- Created this planning validation record.
- Did not create `implementation.md` because no implementation work happened.
- Confirmed the current VSIX contains only:
  - `extension.vsixmanifest`
  - `[Content_Types].xml`
  - `extension/package.json`
  - `extension/extension.js`
- Confirmed the extension package is still marked `"private": true`.
- Confirmed the extension code still supports `enginePath` and repo-relative
  engine discovery.
- Confirmed public README extension examples still include local `C:\dev\...`
  paths.

Commands run:

```txt
Get-Content WORKFLOW.md
Get-ChildItem -Force plans
Get-Content plans\2026-06\27-vscode-ext\plan.md
Get-Content plans\2026-06\27-vscode-ext\test.md
rg -n "vscode|extension|marketplace|publish|vsce|enginePath|VSIX" C:\Users\wassi\.codex\memories\MEMORY.md
```

Prior audit evidence reused from the same session:

```txt
Get-Content packages\vscode-extension\package.json
Get-Content packages\vscode-extension\extension.js
Get-ChildItem -Force packages\vscode-extension
rg -n "C:\\|/Users/|/home/|wassi|enginePath|localhost|127\.0\.0\.1|shell:\s*true|enableScripts|unsafe-inline|private|microwebstacks\.preview" -S .
[System.IO.Compression.ZipFile]::OpenRead('packages/vscode-extension/microwebstacks-docs-preview.vsix').Entries
```

Official references reviewed:

```txt
https://code.visualstudio.com/api/working-with-extensions/publishing-extension
https://code.visualstudio.com/api/references/extension-manifest
https://code.visualstudio.com/api/extension-guides/webview
```

Known gaps:

- `vsce` is not on this shell's PATH, so `vsce package` warnings were not
  captured in this packet.
- `pnpm` is not on this shell's PATH, so a fresh app build was not run.
- No clean-profile VS Code install was performed for this planning packet.
- No cross-platform native-module validation has been run.

## 2026-06-28 - Maintainer Decision Update

Expected:

- Record maintainer decisions without starting implementation work.
- Clarify that zero-config Marketplace install should not break this repository.
- Keep unresolved questions only where a decision is still actually needed.

Actual:

- Added accepted decisions for desktop-only launch, opt-in hosted diagrams,
  local Docker-based diagram renderer examples, repository identity, and the
  zero-config public install promise.
- Clarified that zero-config means no local `astro-huge-doc` checkout is
  required for Marketplace users.
- Clarified that standalone repo workflows should remain intact by staging a
  release package from this repo.
- Added a conditional repository-split decision: stay in this repo unless
  packaging forces conflicting source, dependency, or release constraints.
- Did not create `implementation.md` because no implementation work happened.

Commands run:

```txt
Get-Content plans\2026-06\28-vscode-marketplace-readiness\plan.md
Get-Content plans\2026-06\28-vscode-marketplace-readiness\test.md
```

Known gaps:

- No implementation or packaging validation was run for this decision update.
- OS/CPU support is still open beyond the accepted desktop VS Code scope.

## 2026-06-28 - Open Decisions Resolved

Expected:

- Close the three still-open design decisions (OP-002, OP-003, OP-005) and the
  selected runtime direction in BLK-002, without starting implementation.
- Ground the choices in the actual extension code and dependency surface.

Actual:

- Reviewed `packages/vscode-extension/package.json`,
  `packages/vscode-extension/extension.js`, and root `package.json`.
- Confirmed the extension spawns a child `node` process and falls back to
  system `node` (hidden zero-config constraint, now documented in BLK-002).
- Confirmed the heavy native/runtime stack: `better-sqlite3`, `duckdb`,
  `sharp`, plus React/MUI/Mantine/three/plotly SSR deps.
- Maintainer decisions recorded:
  - BLK-002 / OP-003: Option B - separate versioned Node engine package the
    extension installs/spawns; thin platform-neutral VSIX.
  - OP-005: Marketplace release flagged as preview/pre-release.
  - OP-002: Windows x64 only at launch, explicitly labeled.
- Updated plan.md: Accepted Maintainer Decisions, BLK-002, OP-002, OP-003,
  OP-005, Phase 2 (now "Engine Package + Extension Bootstrap"), Phase 6.
- Did not create `implementation.md` because no implementation work happened.

Known gaps:

- No bootstrap/packaging code written or validated yet.

## 2026-06-28 - Engine Package Name + Install Mechanism

Expected:

- Finalize the engine package name and the first-run install mechanism.

Actual:

- Engine package name set to `@microwebstacks/md-render`.
- First-run mechanism set to npm registry install; bundled-tarball offline
  install deferred as a later optimization (post cross-platform / size work).
- Updated plan.md BLK-002, OP-003, and Phase 2 accordingly, including a note
  that registry install fetches engine code only and does not transmit user
  documentation.

Known gaps:

- `@microwebstacks/md-render` is not yet published to npm.
- No bootstrap/packaging code written or validated yet.
- Registry-install requires network + npm tooling on the user machine at first
  run; offline path not yet available.

## 2026-06-28 - Phase 2 Implementation (Bootstrap + Stage Script)

Expected:

- Add Option B engine bootstrap to the extension while keeping the local
  workspace checkout as a guaranteed, always-available fallback.
- Add a script that stages the @microwebstacks/md-render engine package.
- Do not move any repo source files; do not break standalone repo flows.

Actual:

- Created `plans/2026-06/28-vscode-marketplace-readiness/implementation.md`.
- Refactored `packages/vscode-extension/extension.js`: replaced
  `resolveEngineRoot()` with async `resolveEngine(context)` implementing the
  tiered order enginePath -> local repo -> installed storage -> registry
  install, plus `installEngine()` and `isEngineRoot()` helpers.
- Added `microwebstacks.preview.engineSource` setting (auto|local|registry)
  with `local` guaranteeing offline/local-only resolution.
- Bumped extension version 0.0.2 -> 0.0.3 and added pinned `engineVersion`.
- Added `scripts/stage-engine.js` and `pnpm ext:stage-engine`.
- Ignored `packages/md-render/` staging output in `.gitignore`.

Commands run:

```txt
node --check packages/vscode-extension/extension.js      # OK
node scripts/stage-engine.js                              # staged @0.0.1
ls -la packages/md-render/                                # config.js, server, scripts, dist, package.json
rg resolveEngineRoot packages/vscode-extension            # no matches (old fn fully removed)
```

Verified:

- Stage script validates the SSR build, copies config.js/server/scripts/dist,
  generates a package.json with 47 prod deps, and warns that
  `content-structure: ../content-structure` is an unpublishable local-path dep.
- Local fallback is intact: the repo root satisfies isEngineRoot (config.js +
  server/server.js + scripts/collect.js), so tier 2 resolves without network.

Known gaps:

- Tier 4 (registry install) is unexercised end to end because
  `@microwebstacks/md-render` is unpublished (blocked on `content-structure`).
- Full bootstrap not yet run inside a real VS Code host / clean profile.
