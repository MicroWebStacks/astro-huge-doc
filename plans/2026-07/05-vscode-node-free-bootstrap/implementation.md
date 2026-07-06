# Implementation Log: VS Code Node-Free Bootstrap

## Progress

```text
[####--] Phase 2/4 - node-free bootstrap landed in code; clean-machine validation remains.
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

## Decisions recorded

- The lite/json extension engine is treated as the installed runtime contract:
  no native modules at runtime, no system npm required, and no system Node
  required on the common path.
- The degraded path remains intentional: some Electron builds can disable the
  `runAsNode` fuse, so explicit `MICROWEBSTACKS_NODE_PATH` and system `node`
  remain valid fallbacks rather than being removed.

## Remaining work

- Prove the full clean-machine path in a VS Code profile with no Node/npm on
  PATH.
- Reconcile the older Marketplace packet and public docs so they stop claiming
  the extension requires Node/npm on the common install path.
