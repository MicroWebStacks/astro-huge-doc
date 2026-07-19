# Test / Validation: VS Code Node-Free Bootstrap

## 2026-07-06 - Takeover Review And Packet Reconciliation

Expected:

- Confirm whether this packet is ready for takeover.
- Verify whether the planned bootstrap work is still unimplemented or already
  present in the codebase.
- Record the current validation gap honestly before any packet closure.

Actual:

- Confirmed the packet is structurally ready for takeover:
  - listed in `plans/open.md`
  - has a `plan.md`
  - had no `implementation.md` / `test.md` yet
- Confirmed the core Phase 1 and Phase 2 runtime work is already in tree:
  - `packages/vscode-extension/extension.js` contains
    `probeNodeRunner()`, `resolveNodeRunner()`, HTTPS tarball download,
    tar extraction, and vendored-module restoration logic.
  - `scripts/stage-engine.js` vendors production dependencies under
    `_modules` for the published engine package.
  - `scripts/release-engine.js` and `RELEASE.md` already describe the staged
    engine publish flow that this installer expects.
- Confirmed the packet state was stale:
  - `plans/open.md` had to be updated because it still said
    "no implementation started yet".
  - `packages/vscode-extension/README.md` still said Node.js 18+ with npm on
    PATH was required.
  - `plans/2026-06/28/vscode-marketplace-readiness/plan.md` still described
    true no-Node zero-config as deferred.
- Ran two focused smoke checks against the landed code:
  - `node --check packages/vscode-extension/extension.js` succeeded.
  - `node scripts/stage-engine.js --no-vendor --out .tmp/node-free-stage-smoke`
    succeeded, proving the stage script can still assemble the engine package
    without invoking npm. The temporary staging folder was then removed.

Commands run:

```txt
Get-Content WORKFLOW.md
Get-Content plans\open.md
Get-Content plans\closed.md
Get-Content plans\2026-07\05\vscode-node-free-bootstrap\plan.md
Get-ChildItem plans\2026-07\05\vscode-node-free-bootstrap -Force
git status --short
rg -n "findNodeExecutable|runNodeScript|startServer|installEngine|MICROWEBSTACKS_NODE_PATH|npm\.cmd|node\.exe|ELECTRON_RUN_AS_NODE" packages/vscode-extension scripts RELEASE.md readme.md src -S
Get-Content packages\vscode-extension\extension.js
Get-Content scripts\stage-engine.js
Get-Content scripts\release-engine.js
Get-Content RELEASE.md
Get-Content packages\vscode-extension\README.md
Get-Content plans\2026-06\28\vscode-marketplace-readiness\plan.md
Get-Content plans\2026-06\28\vscode-marketplace-readiness\implementation.md
Get-Content plans\2026-06\28\vscode-marketplace-readiness\test.md
node --check packages\vscode-extension\extension.js
node scripts\stage-engine.js --no-vendor --out .tmp\node-free-stage-smoke
Remove-Item -LiteralPath .tmp\node-free-stage-smoke -Recurse -Force
```

Known gaps:

- No clean-profile VS Code runtime proof was run in this takeover pass.
- No zero-Node machine repro was run in this shell environment.
- At takeover time, this left the packet open pending a later closure review.

## 2026-07-07 - Closure Review

Expected:

- Confirm whether the packet's document-reconciliation work is now complete.
- Close the packet if only broader publish-readiness validation remains.

Actual:

- Confirmed `packages/vscode-extension/README.md` now documents the common path
  honestly: no system Node/npm on the normal install path, first run downloads
  the pinned engine, and `MICROWEBSTACKS_NODE_PATH` / PATH `node` are fallback
  paths only.
- Confirmed `plans/2026-06/28/vscode-marketplace-readiness/plan.md` already
  carries the remaining clean-profile, platform, package, privacy, and publish
  validation work for the installed extension.
- Confirmed this packet's implementation scope is complete and the remaining
  gap is validation that belongs to the broader Marketplace packet, so this
  packet can close under the repository workflow definition of done.

Commands run:

```txt
Get-Content WORKFLOW.md
Get-Content packages\vscode-extension\README.md
Get-Content plans\2026-06\28\vscode-marketplace-readiness\plan.md
Get-Content plans\2026-07\05\vscode-node-free-bootstrap\plan.md
Get-Content plans\2026-07\05\vscode-node-free-bootstrap\implementation.md
Get-Content plans\2026-07\05\vscode-node-free-bootstrap\test.md
Get-Content plans\open.md
Get-Content plans\closed.md
```

Known gaps:

- No new runtime validation was run in this closure pass.
- Clean-profile and zero-Node end-to-end proof still belong to
  `plans/2026-06/28/vscode-marketplace-readiness`.
