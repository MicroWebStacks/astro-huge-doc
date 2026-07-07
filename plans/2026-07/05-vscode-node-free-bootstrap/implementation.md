# Implementation Log: VS Code Node-Free Bootstrap

## Progress

```text
[######] Done - implementation finished; follow-up validation moved to the Marketplace packet.
```

## Changes landed

- `packages/vscode-extension/extension.js` now resolves a script runner with
  `resolveNodeRunner()`:
  - `MICROWEBSTACKS_NODE_PATH` remains the highest-priority explicit override.
  - The default path probes VS Code's own runtime via `process.execPath` with
    `ELECTRON_RUN_AS_NODE=1`.
  - If that probe fails, the extension falls back to system `node` and then to
    a clear error instead of assuming Node is present up front.
- `packages/vscode-extension/extension.js` no longer shells out to `npm` for
  engine install. `installEngine()` now downloads the published engine tarball
  over HTTPS, extracts it in-process, validates the vendored dependency marker,
  and restores the vendored tree as `node_modules`.
- `scripts/stage-engine.js` now prepares published engine artifacts for the
  npm-free installer path by vendoring production dependencies and renaming the
  tree to `_modules` before packing so npm's tarball filter does not strip it.
- `scripts/release-engine.js` / `RELEASE.md` already align with that release
  shape: the engine is staged from this repo, published first, then the
  extension release pins the new `engineVersion`.
- `plans/2026-06/28-vscode-marketplace-readiness/plan.md` and
  `packages/vscode-extension/README.md` now describe the bundled-runtime,
  npm-free bootstrap as the normal install path, so this packet's document
  reconciliation is complete.

## Decisions recorded

- The lite/json extension engine is treated as the installed runtime contract:
  no native modules at runtime, no system npm required, and no system Node
  required on the common path.
- The degraded path remains intentional: some Electron builds can disable the
  `runAsNode` fuse, so explicit `MICROWEBSTACKS_NODE_PATH` and system `node`
  remain valid fallbacks rather than being removed.

## Follow-up hand-off

- Clean-profile and zero-Node end-to-end validation remain under
  `plans/2026-06/28-vscode-marketplace-readiness`, where package, platform,
  privacy, and publish-readiness checks already belong.
- Phase 3 size trimming remains optional future work; it is not required to
  close this implementation packet.
