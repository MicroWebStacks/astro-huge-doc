# Validation

## 2026-06-28 - Planning Packet Review

Expected:

- Create a publish-readiness plan without changing extension runtime code.
- Keep the packet under `plans/` and avoid creating `implementation.md` before
  implementation work starts.
- Identify hard Marketplace blockers and maintainer design decisions.
- Ground the plan in current repo state and official VS Code publishing docs.

Actual:

- Created `plans/2026-06/28/vscode-marketplace-readiness/plan.md`.
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
Get-Content plans\2026-06\27\vscode-ext\plan.md
Get-Content plans\2026-06\27\vscode-ext\test.md
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
Get-Content plans\2026-06\28\vscode-marketplace-readiness\plan.md
Get-Content plans\2026-06\28\vscode-marketplace-readiness\test.md
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

- Created `plans/2026-06/28/vscode-marketplace-readiness/implementation.md`.
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

## 2026-07-06 - Node-Free Bootstrap Reconciliation

Expected:

- Recheck the Marketplace packet after the follow-up node-free bootstrap work.
- Confirm whether the earlier "system Node + npm required" notes are still
  true.

Actual:

- Confirmed the earlier requirement notes are now stale for the installed
  lite/json preview path.
- `packages/vscode-extension/extension.js` now:
  - probes `process.execPath` with `ELECTRON_RUN_AS_NODE=1`
  - falls back to `MICROWEBSTACKS_NODE_PATH` / system `node` only if needed
  - downloads the engine tarball over HTTPS and extracts it locally instead of
    shelling out to `npm install`
- `scripts/stage-engine.js` now vendors production dependencies under
  `_modules`, matching the installer's restore path.
- Updated this packet's plan/implementation wording so BLK-002 and Phase 2 no
  longer claim that system Node/npm are part of the normal first-run contract.

Commands reviewed:

```txt
Get-Content packages\vscode-extension\extension.js
Get-Content scripts\stage-engine.js
Get-Content scripts\release-engine.js
Get-Content RELEASE.md
Get-Content plans\2026-07\05\vscode-node-free-bootstrap\plan.md
```

Known gaps:

- The clean-profile, no-Node/no-npm machine validation is still not captured in
  this packet and remains required before closure.

## 2026-07-07 - Bundled VSIX Engine Fallback

Expected:

- Make the release VSIX self-carry a lite/json engine fallback so installed
  preview does not require npm registry access on first run.
- Keep local checkout behavior intact and leave `engineSource=registry`
  available for explicit production-path testing.
- Prove the extension staging output now includes a vendored bundled engine.

Actual:

- `scripts/package-extension.js` now stages `bundled-engine/` into the
  extension package by reusing `scripts/stage-engine.js` with vendored deps.
- `packages/vscode-extension/extension.js` now hydrates that bundled payload
  into VS Code storage under `bundled-engine-<version>/` and prefers it in
  `engineSource=auto` before any registry-installed engine.
- `packages/vscode-extension/package.json`, `packages/vscode-extension/README.md`,
  `readme.md`, and `RELEASE.md` now describe bundled-first behavior honestly.
- Stage-only packaging proved the staged extension contains:
  - top-level `bundled-engine/`
  - `bundled-engine/package.json`
  - vendored dependency tree at `bundled-engine/_modules`
  - bundled engine build metadata at `bundled-engine/build-meta.json`

Commands run:

```txt
node --check packages/vscode-extension/extension.js
node --check scripts/package-extension.js
node --check scripts/stage-engine.js
node scripts/package-extension.js --stage-only --out .tmp/extension-package-smoke
Get-ChildItem .tmp\extension-package-smoke
Get-ChildItem .tmp\extension-package-smoke\bundled-engine
Get-Content .tmp\extension-package-smoke\bundled-engine\package.json
```

Notes:

- The first `package-extension.js --stage-only` attempt timed out inside the
  sandbox during the vendoring `npm install`.
- Re-running the same command with escalated network access completed in about
  52 seconds and wrote the expected `bundled-engine/_modules` payload.

Known gaps:

- This validation stops at the staged extension directory; it does not yet
  install the rebuilt VSIX into a clean VS Code profile.
- `engineSource=registry` remains dependent on the pinned npm package existing
  and reachable, as intended.

## 2026-07-09 - Plan reconciliation, runtime hardening, local-Kroki docs, real clean-profile validation

Expected:

- Re-check plan.md against actual repo state and mark genuinely-resolved
  blockers/decisions as resolved instead of leaving stale "open" statuses.
- Harden the extension runtime (Phase 3): drop unnecessary `shell: true`,
  narrow the child-process environment, add child-process cleanup on
  deactivate, and audit host binding / webview CSP.
- Make the local-Kroki privacy story concrete for Marketplace users with no
  repo checkout: a start command and README instructions.
- Run a real clean-profile VS Code install of the packaged VSIX (skip
  cross-platform/macOS/Linux validation, per explicit direction).

Actual:

- Updated `plan.md`: BLK-002, BLK-004, BLK-005, BLK-006 marked resolved;
  BLK-001 and BLK-003 marked resolved after the clean-profile run below;
  Current Evidence, Validation Matrix, and Publish Readiness Exit Criteria
  updated to match actual repo/npm state (`@microwebstacks/md-render@0.0.7` is
  published; `config.js`'s Kroki default is already `localhost:18000`; no
  `C:\dev\...` paths remain in either README; `RELEASE.md` documents a real
  publish flow).
- `packages/vscode-extension/extension.js`: removed `shell: true` and the
  `quoteForShell` workaround from `runCapture`/`spawnLogged` (verified
  experimentally that Node's `spawn`/`spawnSync` on Windows already quote
  arguments correctly for real `.exe` targets, so `shell: true` was pure added
  risk left over from a since-removed `npm.cmd` invocation); added
  `minimalChildEnv()` so collect/diagrams/server children get an explicit
  OS-necessity + proxy allowlist instead of the full host `process.env`;
  tracked all `spawnLogged` children in an `activeChildren` set and added
  `killActiveChildren()`, called from `stopDocsPreviewServer()`, so a
  still-running collect/diagrams child gets killed on deactivate/restart/
  refresh, not just the long-lived server process.
- Confirmed (no code change needed): `server/server.js` binds
  `config.server.host`, which is `127.0.0.1` in extension mode; the webview's
  CSP already scopes `frame-src` to the extension's own `127.0.0.1`/
  `localhost` port with `default-src 'none'`.
- Discovered `compose.yaml` (local Kroki) already existed at the repo root
  with root-README instructions, contrary to an earlier session's claim of a
  missing Docker example - the actual gap was Marketplace users have no repo
  checkout and thus no `compose.yaml`. Added `kroki:up`/`kroki:down` pnpm
  scripts (wrapping `docker compose up -d`/`down`) and a self-contained
  "Local Kroki via Docker" section with a plain `docker run` one-liner to
  `packages/vscode-extension/README.md`.
- Ran `docker compose config` against the existing `compose.yaml` - parses
  correctly. `pnpm kroki:up` itself failed in this sandbox
  (`dockerDesktopLinuxEngine` pipe not found - no Docker daemon running here),
  so the container was validated statically, not by actually rendering a
  diagram.
- Built the real VSIX (`pnpm ext:package`) and ran a genuine clean-profile
  install/exercise: isolated `--user-data-dir`/`--extensions-dir`, `--install-
  extension` of the built VSIX, a throwaway probe extension driving
  `microwebstacks.previewDocs`/`stopDocsPreviewServer` and checking real HTTP
  behavior via `netstat` port-diffing (see `implementation.md` for the two
  dead ends hit first: `@vscode/test-electron`'s bootstrap crashing, and this
  shell's inherited `ELECTRON_RUN_AS_NODE=1` making a direct `Code.exe` launch
  crash the same way until `env -u ELECTRON_RUN_AS_NODE` was used).

Verified:

- `node --check packages/vscode-extension/extension.js` passes after the
  hardening edits.
- `pnpm ext:package` succeeds; its own post-package check confirms
  `extension/bundled-engine/package.json` and 22,605 vendored `_modules`
  entries inside the actual VSIX archive (65.37 MB, 22,846 files total).
- Clean-profile run result (`result.json` from the probe extension): `pass:
  true`. `previewDocs` hydrated the bundled engine and started the server
  with no `enginePath`/repo checkout; a new `127.0.0.1` port appeared well
  within the poll window; `GET /` returned HTTP 200 with a 29,097-byte body;
  `stopDocsPreviewServer` made the port stop responding.
- No leftover `Code.exe`/`node.exe` processes remained after the run
  (`Get-CimInstance Win32_Process` filtered to the isolated `user-data-dir`
  returned zero matches), i.e. shutdown/cleanup did not hang or orphan
  anything.

Commands run:

```txt
npm view @microwebstacks/md-render version
grep -n "process.env\." src/libs/load-env.js config.js server/server.js scripts/collect.js scripts/diagrams.js
node --check packages/vscode-extension/extension.js
docker --version
docker compose version
docker compose config
pnpm kroki:up            # failed: Docker daemon not running in this sandbox
pnpm ext:package
code --install-extension ... --user-data-dir <isolated> --extensions-dir <isolated>
Code.exe <clean-workspace> --user-data-dir <isolated> --extensions-dir <isolated> --disable-workspace-trust ...  (env -u ELECTRON_RUN_AS_NODE)
Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -like '*mws-clean-profile-run*' }
```

Known gaps:

- Cross-platform (macOS/Linux) native-module validation was explicitly not
  pursued, per direction - stays open, scoped to a post-preview pass (OP-002).
- The clean-profile run exercised `engineSource=auto` (bundled-engine path),
  not `engineSource=registry` end to end.
- The local Kroki container itself was not actually started/rendered against
  in this sandbox (no Docker daemon available); only config correctness was
  verified.
- The webview panel's own rendering was not screenshot/visually verified;
  the underlying HTTP server it iframes was verified directly.
- No real `vsce publish`/`vsce publish --dry-run` has been run.
- The scratch test harness (dummy/probe extensions) was intentionally not
  committed to the repo - it was throwaway validation infrastructure, not a
  reusable project asset, per this repo's plan-packet conventions.

## 2026-07-07 - VSIX payload verification gap

Expected:

- Confirm that the packaged VSIX, not just the staging directory, actually
  contains the bundled engine fallback.
- Explain the large `vsce` file-count warning against the real package output.

Actual:

- Inspected `packages/vscode-extension/markdown-site-preview.vsix` directly and
  confirmed it contained only 10 entries and zero
  `extension/bundled-engine/*` paths.
- Confirmed the staged directory under `.tmp/extension-package` contained
  `bundled-engine/` with `package.json`, `build-meta.json`, runtime folders,
  and vendored `_modules/`.
- Identified the packaging gap: stage-only success was not enough proof that
  the final VSIX carried the fallback payload.
- Updated `scripts/package-extension.js` so default packaging stages in a
  system temp directory and then verifies the finished VSIX contains
  `extension/bundled-engine/package.json` plus vendored `_modules/` entries.
- Updated the repo's direct `glob` dependency off deprecated `11.1.0`; the
  remaining `tsconfck@3.1.6` warning is still transitive and was not removed by
  this repo-local dependency change.

Commands run:

```txt
Get-Content scripts\package-extension.js
Get-Content scripts\stage-engine.js
Get-Content packages\vscode-extension\.vscodeignore
Get-Item packages\vscode-extension\markdown-site-preview.vsix
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::OpenRead((Resolve-Path 'packages\vscode-extension\markdown-site-preview.vsix')).Entries
Get-ChildItem .tmp\extension-package -Recurse -File
Get-ChildItem .tmp\extension-package\bundled-engine
Get-Content package.json
```

Known gaps:

- I have not yet rerun `vsce package` from the updated script in this sandbox;
  the previous direct `npm.cmd exec @vscode/vsce` attempt hit restricted
  registry/cache access here.
- Clean-profile VS Code install validation is still required before closing the
  packet.
