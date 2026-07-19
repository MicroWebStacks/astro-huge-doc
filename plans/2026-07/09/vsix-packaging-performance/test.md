# Test / Validation: VSIX Packaging Performance

## 2026-07-10 - Phase 1: single-tarball packing and AD-004 verification

Expected:

- `scripts/package-extension.js` stages the engine as one authenticated
  `manifest.json` + `engine.tgz` pair (AD-001), packed via `npm pack` against
  the complete `scripts/stage-engine.js` output (AD-002).
- Nested-tarball semantic validation passes right after packing (stage-time),
  independent of the final VSIX check.
- A real (non-`--stage-only`) `pnpm ext:package` run succeeds and
  `verifyVsixBundledEngine()` passes the new AD-004 checks against the actual
  `.vsix` bytes.
- Packaging wall-clock time and VSIX entry counts drop by an order of
  magnitude from the 2026-07-09 baseline (22,846 total / ~22,608
  bundled-engine entries, 20-30 minutes).

Actual:

- `node scripts/package-extension.js --stage-only --out .tmp/pkg-stage-test`
  produced exactly two files under `bundled-engine/`: `manifest.json` and
  `engine.tgz` (77,398,916 bytes), confirming AD-001's two-file layout and
  that no loose `package.json`/`build-meta.json` copies are kept alongside
  the tarball. Stage-time `verifyEngineTarballBytes()` passed (digest, size,
  required runtime paths, non-trivial `package/_modules/` payload, and
  matching nested `package/package.json` name/version/`vendoredModulesDir`).
- A real `pnpm ext:package` run succeeded end to end and
  `verifyVsixBundledEngine()` passed against the final `.vsix`:
  - **12 total VSIX entries** (down from 22,846 baseline).
  - **2 bundled-engine entries** (`manifest.json` + `engine.tgz`, down from
    ~22,608 loose `_modules`/`dist`/etc. entries).
  - `engine.tgz`: 77,398,920 bytes containing **24,336 vendored dependency
    files** (`package/_modules/*`), confirming the full dependency tree
    survived packing intact.
  - Final VSIX size: 73.9 MB (vsce's own "large file" notice on
    `engine.tgz` is expected and matches AD's noted risk that a single
    already-gzip-compressed tarball doesn't shrink total bytes much - the win
    is entry count and packaging time, not artifact size).
  - Stage timings: engine staging/vendoring 16.3s, `npm pack` 36.5s, `vsce
    package` 5.2s, final verification 1.0s, **total 62.4s**.
- Result: packaging time dropped from the 20-30 minute 2026-07-09 baseline to
  about **1 minute**, and both VSIX entry counts dropped from tens of
  thousands to single digits, matching the plan's expected outcomes.

Bug found and fixed during this run: `npm pack --json` emits a full
per-packed-file listing (needed for a ~24k-file vendored tree), which
overflowed `spawnSync`'s default 1MB stdout/stderr `maxBuffer` and silently
truncated/corrupted the thrown error message (a wall of `npm notice` lines
where a clean error should have been). Fixed by dropping `--json` (plain
`npm pack --loglevel=error` prints just the resulting filename) and raising
`maxBuffer` to 64 MB as a defensive margin. A second latent bug in the same
area: the original `finally` block's cleanup (`fsp.rm` on the temp staging
dir) could itself throw `EBUSY` on Windows (AV/indexer scanning the
freshly-written `_modules` tree) and silently replace/mask whatever real
error the `try` block had thrown; fixed with a bounded-retry
`bestEffortRm()` that warns and moves on instead of throwing, mirroring
`scripts/stage-engine.js`'s existing `retryFsOp` pattern.

Commands run:

```txt
node --check scripts/package-extension.js
node --check scripts/lib/tar-entries.js
node scripts/package-extension.js --stage-only --out .tmp/pkg-stage-test
pnpm ext:package
```

Known gaps:

- Phase 2 (shared extraction/activation refactor in `extension.js`) and
  Phase 3 (clean-profile `engineSource=auto`/`registry` runtime exercises)
  are not yet done as of this entry; see later entries in this file.

## 2026-07-10 - Phase 2: shared extraction/activation fault-injection checks

Expected:

- `hasBundledEnginePackage()` becomes a presence-only check against the new
  manifest.json + engine.tgz pair (AD-003), no longer calling `isEngineRoot()`
  on an unexploded directory.
- `hydrateBundledEngine()` and `installEngine()` share one internal
  `extractAndActivateEngine()` extract-into-temp / validate / promote path.
- Focused checks cover: valid payload, bad manifest metadata, digest
  mismatch, corrupt gzip/tar data, missing runtime files, wrong package
  version, missing `_modules`, and failure cleanup (no leftover temp dirs, a
  prior good install survives a failed re-hydrate attempt).

Actual:

- Added a guarded test-only export (`module.exports.__testInternals`, gated
  on `MWS_TEST_INTERNALS=1`, never set by a real activated extension) so a
  harness could exercise the internals directly without a VS Code host.
- Built a throwaway fault-injection harness (scratchpad, not committed):
  stubs `vscode` via `Module._resolveFilename`, calls the real `activate()`
  with a fake context to initialize the `output` channel/log(), builds tiny
  synthetic USTAR tarball fixtures, and runs 21 checks against
  `hasBundledEnginePackage`, `hydrateBundledEngine`, and
  `extractAndActivateEngine`. **All 21 passed**:
  - presence-only `hasBundledEnginePackage()` (4 checks: missing manifest,
    missing tarball, missing both, both present).
  - valid payload: correct name/version, `node_modules` restored from
    `_modules`, `_modules` not left behind, `isUsableInstalledEngine()` true,
    no leftover `.tmp-` sibling.
  - invalid manifest: bad `schemaVersion`, manifest version mismatch, byte
    length mismatch, digest mismatch - all rejected with the expected
    "manifest is invalid" / "digest verification" messages.
  - corrupt gzip data with a self-consistent (recomputed) digest - rejected
    at extraction with "Could not extract".
  - wrong nested package name/version, missing `vendoredModulesDir`, missing
    `server/server.js` - all rejected with the expected messages.
  - failure cleanup: a digest-mismatch failure after a prior good install
    left that install byte-identical and untouched, with no leftover
    `.tmp-` sibling directory.
- Confirmed no stray files were left in the repo after the harness ran
  (`git status --short packages/vscode-extension/` shows only the intended
  `extension.js` edit).

Commands run:

```txt
node --check packages/vscode-extension/extension.js
MWS_TEST_INTERNALS=1 node <scratchpad>/run-checks.js
git status --short packages/vscode-extension/
```

Known gaps:

- These are synthetic-fixture checks against the internal functions
  directly, not a real VS Code host - see the Phase 3 entry below for
  clean-profile proof.

## 2026-07-10 - Phase 3: clean-profile validation

Expected:

- `engineSource=auto`, isolated profile, no `enginePath`: the installed VSIX
  reads, authenticates, extracts, and runs its bundled `engine.tgz` without
  registry access, ending in a real HTTP 200 from the preview server.
- A distinct `engineSource=registry` exercise in a fresh profile against the
  pinned published engine.
- Both exercises confirm no leftover isolated `Code.exe`/child processes.

Actual:

- Rebuilt the VSIX (`pnpm ext:package`) so it included the Phase 2
  `extension.js` changes, then followed the isolated-profile method recorded
  in `plans/2026-06/28/vscode-marketplace-readiness/test.md` (2026-07-09
  entry): real `code --install-extension` into a fully isolated
  `--user-data-dir`/`--extensions-dir`, a throwaway probe extension
  (`onStartupFinished`) registered in that profile's own `extensions.json`,
  and `Code.exe <clean-workspace>` launched directly with
  `env -u ELECTRON_RUN_AS_NODE` (this shell has it set to `1`, same
  land-mine noted in that prior packet).
- Ran two clean-profile installs (default `engineSource=auto`, no
  `enginePath`, no workspace `manifest.yaml`). Both times the extension
  activated and engine resolution reached and ran
  `hydrateBundledEngine()` -> `extractAndActivateEngine()` with **no**
  manifest/digest/tarball errors. Verified this directly on disk (not just
  by absence of an error) in the isolated profile's `globalStorage`:
  - `bundled-engine-0.0.7/node_modules/@microwebstacks/md-render/package.json`
    has the expected name/version.
  - `node_modules` was restored from `_modules` (455 top-level vendored
    packages present).
  - all required runtime files present: `config.js`, `server/server.js`,
    `scripts/collect.js`, `dist/server/entry.mjs`.
  - no leftover `.tmp-` sibling directory next to the promoted install.
  - the second run (engine already hydrated from the first) skipped
    hydration entirely and went straight to using the cached install, as
    expected.
  This is real, positive proof that AD-001/AD-002/AD-003's new
  manifest+tarball payload is read, authenticated, and extracted correctly
  by a real installed VSIX in a real (if throwaway) VS Code host - the part
  of the runtime this packet actually changed.
- Both runs then failed at the *next*, unrelated step: `collect.js` (spawned
  via `spawnLogged`/`resolveNodeRunner`, code this packet did not touch)
  threw `Error: read ENOTCONN` inside `child_process.spawn` itself (see
  `exthost.log`), before a preview server ever started, so neither run
  produced an HTTP 200. The second run hit the identical error within
  ~0.2s of activation (engine already cached, so this cannot be a
  hydration-time issue).
- Isolated this as environment-specific, not a regression from this
  packet's diff: `git diff` confirms `spawnLogged`/`resolveNodeRunner` are
  unchanged; a plain `node -e` child-process spawn *outside* the extension
  host succeeded 3/3 times on this same machine; and this machine had
  **126+ concurrent `Code.exe` processes already running** at the time
  (`(Get-Process Code).Count`), strongly suggesting resource pressure
  specific to spawning from within an Electron extension-host utility
  process on this loaded box, not a code defect.
- Registry reachability was checked directly (bypassing the extension host):
  a plain HTTPS GET of the published tarball
  (`https://registry.npmjs.org/@microwebstacks/md-render/-/md-render-0.0.7.tgz`)
  returned `200` with a 77,445,679-byte body, so network access is not the
  blocker. A full `engineSource=registry` clean-profile exercise was not
  attempted, since its `collect.js` step would hit the identical
  `spawnLogged` `ENOTCONN` seen in both bundled-tier runs on this machine.
- Cleaned up both throwaway isolated `Code.exe` process trees
  (`Stop-Process` filtered strictly to processes whose command line
  referenced the throwaway `clean-profile` paths) and confirmed the user's
  actual VS Code windows (e.g. the `evidence-engine` window) were untouched
  throughout.

Commands run:

```txt
pnpm ext:package
code --user-data-dir <isolated> --extensions-dir <isolated> --install-extension markdown-site-preview.vsix
env -u ELECTRON_RUN_AS_NODE Code.exe <clean-workspace> --user-data-dir <isolated> --extensions-dir <isolated> --disable-workspace-trust --disable-telemetry --new-window
Get-Process Code | Where-Object MainWindowTitle -ne ''
Get-CimInstance Win32_Process -Filter "Name='Code.exe' OR Name='node.exe'" | Where-Object CommandLine -like '*clean-profile*'
node -e "https.get('https://registry.npmjs.org/@microwebstacks/md-render/-/md-render-0.0.7.tgz', ...)"
Stop-Process (scoped to the isolated clean-profile process tree only)
```

Known gaps (honest, per AD-003's own "don't claim shared-code coverage as
proof" instruction):

- Neither `engineSource=auto` run reached an actual HTTP 200 from the
  preview server - blocked by a `child_process.spawn` `ENOTCONN` inside
  unrelated, unchanged code (`spawnLogged`/`resolveNodeRunner`), reproduced
  twice on this specific, heavily-loaded machine (126+ concurrent
  `Code.exe` processes). Exit Criterion 5 (bundled auto-tier preview HTTP
  200) is **not** met yet.
- `engineSource=registry` was not exercised end-to-end in a real VS Code
  host (network reachability alone was confirmed). Exit Criterion 6 is
  **not** met and remains explicitly unverified, as the plan allows.
- Recommended follow-up: re-run the same clean-profile harness on a machine
  without ~126 other `Code.exe` processes already running, to get the
  HTTP-200 proof for both tiers. The packaging-side work (Phases 1-2) does
  not depend on this follow-up; only the Phase 3 runtime exit criteria do.
- The scratch probe extension and harness scripts were not committed (same
  convention as the marketplace-readiness packet) - throwaway validation
  infrastructure, not a reusable project asset.

## 2026-07-10 - Release (0.0.13) and real-profile confirmation

Actual:

- Bumped the extension to 0.0.13 (`packages/vscode-extension/package.json`,
  `CHANGELOG.md`), committed alongside the Phase 1-2 implementation
  (`325612c`).
- `pnpm ext:release` confirmed the pinned engine `@microwebstacks/md-render
  @0.0.7` is live on npm, then packaged the release VSIX: **12 total
  entries, 2 bundled-engine entries**, `engine.tgz` 77,398,913 bytes
  containing 24,336 vendored dependency files (AD-004 verification passed).
  Total packaging time 97.6s.
- Compared against the 2026-07-09 baseline recorded in
  `plans/2026-06/28/vscode-marketplace-readiness/test.md` (65.37 MB VSIX,
  22,846 files, 20-30 min packaging): entry count and packaging time both
  dropped by an order of magnitude or more; the final `.vsix` size went
  **up** slightly (65.37 MB -> 73.9 MB, +~13%), an explicitly anticipated
  tradeoff (`npm pack`'s gzip output doesn't meaningfully re-compress a
  second time inside the outer VSIX zip) - size reduction was never this
  packet's goal.
- `pnpm ext:install` installed the 0.0.13 VSIX into the maintainer's real,
  everyday VS Code profile (not an isolated harness profile).
- **User-confirmed**: ran the real "Markdown Site Preview: Open Preview"
  command against this build in their normal daily-driver editor and
  reported it works. This closes the gap the 2026-07-10 Phase 3 entry above
  left open (the isolated-harness runs proved hydration/authentication/
  extraction on disk but never got a live HTTP 200 due to an
  environment-specific spawn issue on the throwaway profile's host
  process). A real user, in a real profile, running the real command is
  stronger end-to-end proof for the `engineSource=auto` bundled tier than
  the throwaway isolated-profile harness would have been.

Known gaps at closure:

- `engineSource=registry` was still not exercised end-to-end in a live VS
  Code host. Registry reachability itself was confirmed earlier (direct
  HTTPS GET of the published tarball returned 200), and the shared
  `extractAndActivateEngine()` path is the same code the bundled tier just
  proved works - but that is shared-code coverage, not an independent live
  run, per AD-003's own instruction not to claim one as the other. Accepted
  as an explicit, deferred gap rather than a blocker to closing this packet
  (maintainer decision, 2026-07-10) - the packaging/verification work this
  packet is actually about (Phases 1-2) is complete and independently
  verified, and registry-tier behavior is unchanged by this packet's diff.
