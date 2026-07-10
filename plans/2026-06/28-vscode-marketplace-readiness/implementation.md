# Implementation - Phase 2 (Engine Package + Extension Bootstrap)

[######] Done - packet closed 2026-07-10. All hard blockers and design
decisions are resolved; the packaged VSIX proved itself in a clean-profile
Windows x64 install (2026-07-09). A few minor points were left as deferred
follow-ups, not closure blockers (see "Packet closure" below).

Tracks the Option B work: the extension resolves a `@microwebstacks/md-render`
engine instead of assuming a repo checkout, while the local workspace checkout
stays a guaranteed fallback and the release VSIX now carries its own bundled
lite/json engine payload for offline first run.

## Hard requirement (maintainer)

The local workspace checkout must always remain a working engine source, exactly
as it behaves today. Registry install is additive, never a replacement. If the
extension runs from inside the repo, or the user points `enginePath` at a
checkout, that path must work without any network or registry access.

## Engine resolution order

Implemented in `packages/vscode-extension/extension.js` as `resolveEngine()`.
New setting `microwebstacks.preview.engineSource`: `auto` (default) | `local` |
`registry`.

1. `microwebstacks.preview.enginePath` (explicit dev override) - used directly,
   validated, no install. Highest priority in every mode.
2. Local repo-relative discovery (the current behavior, `../..` then `.`) - used
   directly. This is the guaranteed local fallback. Skipped only when
   `engineSource = registry`.
3. Bundled VSIX engine - if the installed extension ships `bundled-engine/`,
   copy that payload into
   `globalStorage/bundled-engine-<version>/node_modules/@microwebstacks/md-render`
   and run it from there. Skipped when `engineSource = local|registry`.
4. Installed published engine in
   `globalStorage/engine-<version>/node_modules/@microwebstacks/md-render`
   - used if already present. Skipped when `engineSource = local`.
5. Install then use - install the pinned `@microwebstacks/md-render` engine
   into `globalStorage/engine-<version>`, then resolve tier 4. The current
   installer path is HTTPS download plus local extract; `engineSource = local`
   still skips this tier entirely.

Mode semantics:

- `auto`: 1 -> 2 -> 3 -> 4 -> 5. Never breaks local; bundled VSIX payload is
  the default installed-extension path; registry stays the last resort.
- `local`: 1 -> 2 only. Fully offline / repo-dev guarantee. Errors clearly if no
  local engine is found instead of reaching the network or bundled fallback.
- `registry`: 1 -> 4 -> 5. Forces the published-install path even inside the
  repo, so the production bootstrap can be exercised during development.

An engine root is valid when it contains `server/server.js`,
`scripts/collect.js`, and `config.js`. The existing `dist/server/entry.mjs`
build check stays in `buildRuntime` so a local checkout still gets the clear
"run pnpm build first" message.

## Engine staging script

`scripts/stage-engine.js` assembles the `@microwebstacks/md-render` package
contents from this repo into a staging directory (default `packages/md-render/`,
git-ignored) without moving any source files. It copies `config.js`, `server/`,
`scripts/`, and the built `dist/`, and generates a package `package.json` with
the production dependency set. Native modules and `dist/` are produced by a build
step; the script validates the build exists before staging.

## Known registry-publish blockers (follow-ups, not local-fallback blockers)

- `content-structure` is a local-path dependency (sibling package). It must be
  published or vendored before `@microwebstacks/md-render` can install from npm.
- `xlsx` is pinned to a CDN tarball URL, which is fine for npm consumers but
  must be confirmed installable in a clean registry-install.
- `@microwebstacks/md-render` is not published yet, so tier 4 is currently
  unexercisable end to end. Tiers 1-3 (all local) are testable now.

## Status

- [x] Engine resolution refactor with guaranteed local fallback
- [x] `engineSource` setting + extension version bump
- [x] `scripts/stage-engine.js`
- [x] Bundled VSIX engine fallback staged and hydrated before registry install
- [x] Publish `@microwebstacks/md-render` (`@microwebstacks/md-render@0.0.7` is
      live on npm; `content-structure` is a normal semver dependency now)
- [x] End-to-end clean-profile install validation (bundled-engine path, 2026-07-09)
- [ ] End-to-end clean-profile validation of the `engineSource=registry` tier
      specifically (the 2026-07-09 run exercised the default `auto` path,
      which resolves to the bundled engine, not the registry-download tier) -
      accepted as a deferred follow-up at closure, consistent with the same
      accepted gap in `plans/2026-07/09-vsix-packaging-performance`

## Follow-up: node-free bootstrap landing

The original Phase 2 implementation described a registry install through
`npm install` plus a system-Node runtime requirement. That is now stale.

Current code path:

- `packages/vscode-extension/extension.js` installs the published engine via
  HTTPS tarball download and local extraction, with no npm invocation.
- The same file resolves a script runner via `process.execPath` +
  `ELECTRON_RUN_AS_NODE=1` first, keeping `MICROWEBSTACKS_NODE_PATH` and
  system `node` only as explicit fallbacks.
- `scripts/stage-engine.js` vendors the published engine dependency tree under
  `_modules` so the installer can restore it after extraction.

This removes the common-case requirement for system Node/npm on the user's
machine while keeping local repo fallback behavior intact.

## Follow-up: bundled VSIX engine fallback landing

The original Phase 2 implementation still depended on npm registry reachability
for the normal installed-extension path. That is now stale.

Current code path:

- `scripts/package-extension.js` stages a vendored `bundled-engine/` payload
  for the VSIX by reusing `scripts/stage-engine.js`.
- `packages/vscode-extension/extension.js` hydrates that payload into
  workspace-global storage under `bundled-engine-<version>/` and prefers it in
  `engineSource = auto` before any previously installed or downloaded engine.
- Explicit `engineSource = registry` remains available to test or force the
  published-install path.

This keeps the source checkout behavior unchanged while making the public VSIX
usable on firewalled machines that cannot reach the npm registry.

## 2026-07-07 - VSIX packaging follow-up

Stage-only proof turned out to be insufficient. The staged extension directory
contained `bundled-engine/`, but the actual `markdown-site-preview.vsix`
generated from `.tmp/extension-package` did not contain any
`extension/bundled-engine/*` entries.

To close that gap:

- `scripts/package-extension.js` now packages from an auto-created system temp
  directory by default instead of the repo's ignored `.tmp/` tree.
- The same script now opens the finished VSIX and fails packaging unless it
  finds both `extension/bundled-engine/package.json` and vendored
  `_modules/` entries.
- The repo's direct `glob` dependency was moved off deprecated `11.1.0` so the
  vendoring install no longer pulls that known-old version by default.

This changes the proof standard from "the staging folder looked right" to "the
final VSIX archive demonstrably contains the bundled engine payload."

## 2026-07-09 - Plan reconciliation, runtime hardening, Kroki default proof, clean-profile install

Re-audited the whole packet against the actual repo state (not just what
plan.md said) and found several blockers marked "open" were already resolved
in code but never reconciled in the doc:

- BLK-004 (metadata): `package.json` already had `private: false`, license,
  repository, bugs, icon, keywords, categories, `.vscodeignore`, `CHANGELOG.md`.
- BLK-005 (privacy default): `config.js`'s default `kroki.server` was already
  `http://localhost:18000`, not hosted `kroki.io`. What was actually missing
  was a Marketplace-facing README section with a concrete, repo-independent
  Docker command - the repo already had `compose.yaml` and root README
  instructions, but those assume a checkout, which Marketplace users won't have.
- BLK-002 (registry tier): `@microwebstacks/md-render@0.0.7` is published on
  npm (`npm view @microwebstacks/md-render version` returns `0.0.7`), and
  `content-structure` is now a normal semver dependency, not a local-path
  dependency. Tier 4/5 (registry install) is exercisable now, not blocked.
- BLK-006 (publish automation): `RELEASE.md` already documented a full manual
  `vsce`/Marketplace-upload flow with a decision rule for which artifact to
  release. This was done, just not reflected in plan.md's blocker status.

`plan.md` was updated in place to mark BLK-002/004/005/006 resolved, scope
BLK-003 down to "Windows x64 only, this pass" (macOS/Linux stays an explicit
post-preview follow-up per OP-002, not pursued here), and mark BLK-001
"resolved pending clean-profile proof."

### Privacy/local-Kroki gap actually closed

- `packages/vscode-extension/README.md` gained a "Local Kroki via Docker"
  section with a plain `docker run -d --name mws-kroki -p 18000:8000
  yuzutech/kroki:latest` one-liner usable with zero repo checkout, plus a
  pointer to the repo's `compose.yaml` for checkout users.
- Root `package.json` gained `kroki:up` / `kroki:down` scripts wrapping
  `docker compose up -d` / `down`; root `README.md`'s existing "local Docker
  Kroki" section now shows both forms.
- `docker compose config` was run against the existing `compose.yaml` and
  parses correctly. Actually starting the container was not exercised in this
  sandbox (`docker compose up -d` fails here with `dockerDesktopLinuxEngine
  pipe not found` - the Docker daemon is not running in this environment), so
  the Kroki container itself was validated statically (config parses,
  `docker run` command is correct for the image/port), not by an end-to-end
  render.

### Runtime hardening (Phase 3), in `packages/vscode-extension/extension.js`

- **Removed `shell: true`/manual quoting entirely** (`runCapture`, and the
  `quoteForShell`/`useShell` logic in `spawnLogged`). Verified experimentally
  in this environment that `cp.spawnSync`/`cp.spawn` on Windows already quote
  arguments correctly for `CreateProcess` without `shell: true`, for both bare
  PATH-resolved commands (`git`) and full paths containing spaces - the
  original `shell: true` was added in commit `20fce26` to work around
  `npm.cmd` needing a shell, but npm invocation was removed by the node-free
  bootstrap work and never revisited. `shell: true` now only remains
  necessary (and is used, with `shell: true` set explicitly) in the
  standalone clean-profile test harness's own `code.cmd` invocation, which is
  test infrastructure, not the extension itself.
- **Minimal child-process environment**: added `minimalChildEnv()` -
  collect/diagrams/server children (and the node-runner probe) now inherit
  only an explicit OS-necessity allowlist (`SystemRoot`/`PATH`/`TEMP`/etc. on
  Windows, `PATH`/`HOME`/etc. on POSIX) plus proxy vars, instead of the full
  host `process.env`. Confirmed via `grep` that `config.js`/`server.js`/
  `collect.js`/`diagrams.js` only ever read the explicit `MICROWEBSTACKS_*`/
  `DOCS_*` vars the extension already sets itself, so nothing relies on
  inheriting arbitrary host environment.
- **Orphan cleanup**: added an `activeChildren` set that every
  `spawnLogged`-spawned child registers into and removes itself from on exit;
  `stopDocsPreviewServer()` (called by `deactivate()`, restart, and the file-
  watcher refresh path) now calls `killActiveChildren()`, so an in-flight
  `collect`/`diagrams` child is killed too if the window closes mid-refresh,
  not just the long-lived server process.
- **Host binding**: confirmed (not changed) `server/server.js` binds
  `config.server.host`, which `createRuntimeEnv` sets to `MICROWEBSTACKS_HOST
  = '127.0.0.1'` in extension mode - already correct.
- **Webview CSP**: confirmed (not changed) `renderWebviewHtml`'s CSP
  (`default-src 'none'; frame-src http://localhost:<port> http://127.0.0.1:
  <port>; style-src 'unsafe-inline' <cspSource>`) already scopes the iframe to
  the extension's own port only - already correct, no change needed.

### Clean-profile install validation (BLK-001, replacing the static plan)

Built a throwaway `@vscode/test-electron`-based harness (not committed to the
repo; lives in the session scratchpad) that:

1. Packages the real VSIX via `pnpm ext:package` (not a dev-mode load).
2. Installs it with `code --install-extension` into a fully isolated
   `--user-data-dir`/`--extensions-dir` (no real profile, no real installed
   extensions).
3. Opens a plain Markdown workspace with no `manifest.yaml` and no
   `astro-huge-doc` checkout anywhere on the path.
4. Drives the real Extension Host: activates the extension, executes
   `microwebstacks.previewDocs`, detects the new `127.0.0.1` listening port
   the extension opens (via `netstat` diffing, since the extension doesn't
   expose its port through any public API), does a real HTTP GET and checks
   for a 200 with a non-trivial body, then executes
   `microwebstacks.stopDocsPreviewServer` and confirms the port stops
   responding.

Two dead ends before landing a working harness, both worth recording since
they'll recur:

- `@vscode/test-electron`'s `runTests()` requires an `extensionDevelopmentPath`
  and internally launches `Code.exe` with `--extensionTestsPath`; in this VS
  Code build/Node combination that launch path crashed with
  `Cannot find module '<workspace-dir>'` (Electron tried to `require()` the
  workspace folder as a script entry) before any extension code ran. Not
  pursued further given the fix below was simpler and more direct anyway.
- Launching `Code.exe` directly hit the *same* `Cannot find module` crash, for
  an unrelated reason: this shell's environment has `ELECTRON_RUN_AS_NODE=1`
  set (used elsewhere by this same extension's own node-free bootstrap
  trick). Any Electron binary inherits that and runs as plain Node instead of
  launching the app, treating `argv[1]` (the workspace path) as a module to
  require. Fix: `env -u ELECTRON_RUN_AS_NODE` before invoking `Code.exe`
  directly from a shell that has it set.

Working harness, run 2026-07-09:

1. `pnpm ext:package` (real run, not `--stage-only`) - built
   `markdown-site-preview.vsix`, 65.37 MB / 22,846 files, and the script's own
   post-package check confirmed 22,605 vendored `_modules` entries inside the
   archive.
2. Installed into a throwaway, fully isolated profile:
   `code.cmd --user-data-dir <tmp>/user-data --extensions-dir <tmp>/extensions
   --install-extension markdown-site-preview.vsix` - printed "was successfully
   installed."
3. A second, minimal probe extension (`onStartupFinished`, no relation to the
   product code) was placed in the same isolated `extensions-dir` and
   registered in that directory's `extensions.json` (VS Code only loads
   extension folders listed there, not anything merely present on disk - this
   cost one throwaway run to discover). On activation it: finds and activates
   `microwebstacks.markdown-site-preview`, runs
   `microwebstacks.previewDocs`, detects the new `127.0.0.1` listening port by
   diffing `netstat` output before/after (the extension has no public API to
   query its own port), does a real `http.get` against it, then runs
   `microwebstacks.stopDocsPreviewServer` and confirms the port stops
   responding - writing a pass/fail JSON result to disk and quitting the
   window.
4. Launched `Code.exe <clean-workspace-with-no-manifest.yaml>
   --user-data-dir ... --extensions-dir ... --disable-workspace-trust` (env
   without `ELECTRON_RUN_AS_NODE`), no `enginePath` set, `engineSource` left
   at its default `auto`.

Result: **pass**. `previewDocs` hydrated the bundled engine, ran collect and
diagrams, started the server, and a new `127.0.0.1` port appeared well inside
the poll window; `GET /` returned HTTP 200 with a 29,097-byte body (real
rendered page, not an error page); `stopDocsPreviewServer` then made the port
stop responding. No leftover `Code.exe`/`node.exe` processes remained after
the run (checked via `Get-CimInstance Win32_Process` filtered to the isolated
`user-data-dir`), confirming the `killActiveChildren()` hardening change did
not introduce a hang or leave stragglers.

This is Windows x64 only, exercised the default `auto` -> bundled-engine path
(not the `engineSource=registry` tier), and did not visually confirm the
webview panel's rendering (the probe drove the underlying HTTP server
directly, since that's what `previewDocs` actually depends on; the webview is
a thin iframe over the same URL with CSP reviewed separately, not code that
independently needed live proof here).

The scratch harness itself (dummy/probe extensions, `runClean.js`) was not
committed - it lives only in the session scratchpad, not this repo, since it
was throwaway test infrastructure rather than a reusable project asset.

## 2026-07-10 - Packet closure

Closed by maintainer decision. Every hard blocker (BLK-001..006) and design
decision (OP-001..008) is resolved, the clean-profile Windows x64 proof
passed, and test-result gaps are explicitly not closure blockers for this
packet. The following minor points were left open as deferred follow-ups:

- **First real Marketplace publish.** `RELEASE.md` documents the flow, but no
  `vsce publish --dry-run` (needs a Marketplace PAT) or actual first upload
  has been run. When it happens, verify the exact publisher ID, issue URL,
  and support URL (OP-006 residual) since they become the public listing
  surface.
- **`engineSource=registry` end-to-end.** The clean-profile run exercised the
  default `auto` -> bundled-engine path only; the registry download/extract
  tier has never been driven in a clean profile. Same gap was accepted as
  deferred in `plans/2026-07/09-vsix-packaging-performance`.
- **macOS/Linux platform validation.** Explicitly post-preview per OP-002;
  Windows x64 remains the only validated target.
- **Minor validation gaps** (recorded in `test.md`): the local Kroki
  container was validated statically (no Docker daemon in the sandbox, no
  live diagram render), and the webview panel was verified via its underlying
  HTTP server rather than visually.

Later work has already built on this packet:
`plans/2026-07/09-vsix-packaging-performance` (closed 2026-07-10) replaced
the loose bundled-engine files with one authenticated `engine.tgz` +
`manifest.json`, and 0.0.13 was installed and confirmed working in the
maintainer's real VS Code profile.
