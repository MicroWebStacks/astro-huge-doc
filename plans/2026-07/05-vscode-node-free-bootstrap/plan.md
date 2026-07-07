# VS Code Node-Free Bootstrap Plan

## Problem Summary

`plans/2026-06/28-vscode-marketplace-readiness` (BLK-002) records a hidden
constraint: the extension spawns a child `node`/`node.exe` process to run
`collect.js`, `diagrams.js`, and `server.js`, and shells out to `npm`/`npm.cmd`
to install the `@microwebstacks/md-render` engine package. Both require a
system Node (and npm) on PATH. True no-Node zero-config was explicitly
deferred past the first preview release on the assumption that native modules
(`better-sqlite3`, `sharp`) need an ABI-matched system Node.

A 2026-07-05 review of the actual built output found that assumption is
stale for the extension's configuration (`DOCS_PROFILE=lite`,
`DOCS_BACKEND=json`):

- `content-structure/src/sqlite_utils/index.js` (`import Database from
  'better-sqlite3'`) is only reached via a dynamic
  `await import('./structure-db-sqlite_*.mjs')` gated on `DOCS_BACKEND`
  (`dist/server/chunks/Layout_Dp1jrjXf.mjs:63-68`). It is never loaded in
  `json` mode.
- `sharp` has no reference anywhere in `dist/server/`.
- Every other runtime import in `dist/server/` (`astro/app/node`, `express`
  bits, `react`/`react-dom`, `shiki`, `katex`, `marked`,
  `mdast-util-to-hast`/`hast-util-to-html`, `js-yaml`, `@tanstack/react-table`)
  is pure JS.

So the lite engine has zero native modules at runtime, which removes the
reason a real system Node was assumed necessary. The remaining requirement is
just *some* JS engine to run the scripts - and VS Code's own extension host
already is one, since `extension.js` itself runs inside it without any
system Node.

## Goal

Run the engine's collect/diagrams/server scripts, and install the engine
package, using only VS Code's own bundled runtime - no system Node or npm
required on the user's machine.

## Scope

In scope:

- How the extension spawns `collect.js`/`diagrams.js`/`server.js`.
- How the extension installs `@microwebstacks/md-render`.

Non-goals (unchanged from the marketplace-readiness plan):

- macOS/Linux platform validation (still gated on that plan's OP-002).
- Remote-SSH/WSL/Containers extension host scenarios.
- Changing the lite/full backend split itself.

## Open Points

### OP-001 - Does `process.execPath` + `ELECTRON_RUN_AS_NODE=1` reliably replace system Node for spawning scripts?

Status: resolved and implemented; clean-profile validation is tracked by
`plans/2026-06/28-vscode-marketplace-readiness`.

Replace the `node`/`node.exe` PATH lookup in `findNodeExecutable` /
`runNodeScript` / `startServer` with VS Code's own binary
(`process.execPath`) run with `ELECTRON_RUN_AS_NODE: '1'` in the child env.
Keep `MICROWEBSTACKS_NODE_PATH` / system Node as an explicit fallback if this
spawn fails, rather than a hard assumption - some hardened Electron builds
disable the `runAsNode` fuse.

### OP-002 - How should engine install avoid shelling out to npm?

Status: resolved and implemented.

`installEngine()` currently runs `npm.cmd install ...`, and npm's CLI is
itself a Node script - a second, currently undocumented Node dependency.
Decision: fetch the published tarball via HTTPS in-process and extract it with
a small bundled tar reader in the extension. The published engine package is
prepared with its production dependency tree vendored under a disguised folder
name so npm's packer keeps it; the installer renames that folder back to
`node_modules` after extraction.

### OP-003 - What is the fallback when `runAsNode` is unavailable?

Status: resolved and implemented.

Decision: keep `MICROWEBSTACKS_NODE_PATH` as the highest-priority explicit
override, then fall back from `process.execPath` + `ELECTRON_RUN_AS_NODE=1` to
system `node` if the VS Code/Electron build has the `runAsNode` fuse disabled.
If neither route works, raise a clear error.

## Implementation Phases

### Phase 1 - Script execution without system Node

- Implemented in `packages/vscode-extension/extension.js`:
  `resolveNodeRunner()` probes `process.execPath` with
  `ELECTRON_RUN_AS_NODE=1`, keeps `MICROWEBSTACKS_NODE_PATH` as an explicit
  override, and falls back to system `node` with a clear error path.
- Validation hand-off: end-to-end collect/diagrams/server proof in a clean VS
  Code profile with no Node/npm on PATH remains part of
  `plans/2026-06/28-vscode-marketplace-readiness`.

### Phase 2 - Engine install without npm

- Implemented in `packages/vscode-extension/extension.js`:
  `installEngine()` downloads the published tarball over HTTPS, extracts it
  in-process, and restores the vendored dependency tree.
- Implemented in `scripts/stage-engine.js` / release flow: staged engine
  packages now vendor their production dependency tree under `_modules`, and
  the extension installer restores it after extraction.
- Validation hand-off: first-run install proof in the same Node-free
  environment as Phase 1 remains part of
  `plans/2026-06/28-vscode-marketplace-readiness`.

### Phase 3 - Trim unnecessary transitive weight (optional, size only)

- Check whether the full `astro` package (pulling `esbuild`/`rollup`
  transitively) is needed at runtime beyond the small `astro/app/node` shim
  used by the built server, and prune if not.

### Phase 4 - Fold back into marketplace-readiness plan

- Completed: `plans/2026-06/28-vscode-marketplace-readiness/plan.md` and the
  extension README now match the landed bootstrap and keep the remaining
  validation gap under the broader publish-readiness packet.

## Dependencies And Risks

- Depends on Option B engine packaging from
  `plans/2026-06/28-vscode-marketplace-readiness` and the lite/json
  zero-native-deps design from `plans/2026-06/29-vscode-lite`.
- Risk: `runAsNode` fuse disabled on some distribution - needs graceful
  fallback, not a hard assumption.
- Risk: reimplementing tarball fetch/extract must work cross-platform without
  native dependencies (defeats the purpose otherwise).

## Exit Criteria

- Preview install, collect, and serve work end to end on a clean VS Code
  profile with zero Node/npm anywhere on the machine or PATH.
- `plans/2026-06/28-vscode-marketplace-readiness` is updated so its Node
  requirement caveat matches the resolved behavior.
