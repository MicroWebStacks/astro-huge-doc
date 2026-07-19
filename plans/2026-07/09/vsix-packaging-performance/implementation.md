# Implementation Log: VSIX Packaging Performance

## Progress

```text
[###] Done - released as 0.0.13, installed and confirmed working by the
      maintainer in their real VS Code profile. engineSource=registry was
      not separately exercised end-to-end; accepted as a deferred gap (see
      test.md) since registry-tier behavior is unchanged by this packet.
```

## Changes made

- `scripts/lib/tar-entries.js` (new): build-time-only USTAR/PAX tar entry
  reader, mirroring the parser already embedded in
  `packages/vscode-extension/extension.js` (which stays self-contained since
  it ships inside the VSIX).
- `scripts/package-extension.js`:
  - `packBundledEngine()` replaces `stageBundledEngine()`: stages the engine
    into a throwaway temp dir, runs `npm pack` against it, writes
    `bundled-engine/engine.tgz` + `bundled-engine/manifest.json`
    (schemaVersion, package, version, tarball filename, byteLength, sha256)
    per AD-001/AD-002, and asserts the staged payload is exactly those two
    files.
  - `verifyEngineTarballBytes()`: shared digest/size/content check reused
    both right after packing (stage-time) and against the exact bytes pulled
    out of the final `.vsix` (AD-004).
  - `verifyVsixBundledEngine()` rewritten per AD-004: checks the final VSIX
    for the manifest+tarball pair, absence of loose `_modules`/`dist`/
    `server`/`scripts`/`src` payload trees, manifest parse/shape, digest
    match, nested tarball contents, and reports total/bundled-engine entry
    counts.
  - `main()` now records and prints per-stage timings (engine
    staging/vendoring, `npm pack`, `vsce package`, final verification, total).
- `packages/vscode-extension/extension.js` (AD-003):
  - `hasBundledEnginePackage()` is now presence-only (manifest.json +
    engine.tgz exist), not `isEngineRoot()` against an unexploded directory.
  - New `extractAndActivateEngine()`: extract into a temp sibling directory,
    validate expected package/version, require+rename the declared
    `vendoredModulesDir` to `node_modules`, require
    `isUsableInstalledEngine()`, then promote into the versioned install
    location only after all validation succeeds; cleans up the temp
    directory on both success and failure.
  - `hydrateBundledEngine()` now reads and authenticates the outer
    `manifest.json` (schema/package/version fields) and the exact
    `engine.tgz` bytes (size + SHA-256) before handing them to
    `extractAndActivateEngine()`; any invalid manifest/digest/tarball fails
    loudly with a "repackage the extension" message instead of silently
    falling back to the registry tier.
  - `installEngine()` (registry tier) refactored onto the same
    `extractAndActivateEngine()` path, unchanged download behavior.
  - New `retryFsOp()` bounded-retry helper (mirrors
    `scripts/stage-engine.js`'s pattern) guards the promotion rename/rm
    against transient Windows `EPERM`/`EBUSY`.
  - Added a guarded `module.exports.__testInternals` seam (only populated
    when `MWS_TEST_INTERNALS=1`) so the internals above could be
    fault-injection tested without a VS Code host; never active in a real
    activated extension.

## Decisions recorded

- `npm pack` is invoked without `--json` and with `--loglevel=error` plus a
  64 MB `maxBuffer`, after discovering `--json`'s full per-file listing
  overflows spawnSync's default 1MB buffer for a ~24k-file vendored tree.
- Temp-dir cleanup in `packBundledEngine()` uses a bounded-retry
  best-effort helper instead of a bare `fsp.rm` in `finally`, so a
  transient Windows file lock on cleanup can't mask a real packaging error.
- The outer manifest does not duplicate the engine's own `package.json`/
  `build-meta.json` next to the tarball (per AD-001) - only the fields needed
  to locate/verify the payload before extraction.
- `hasBundledEnginePackage()` deliberately stays presence-only; any deeper
  content invalidity (bad schema, wrong version, digest mismatch) is treated
  as a corrupt bundled payload that must fail loudly in
  `hydrateBundledEngine()`, not as "no bundled engine" silently falling
  through to the registry tier (AD-003's explicit requirement).

## Follow-up risks

- `engineSource=registry` was never exercised end-to-end in a live VS Code
  host (network reachability alone was confirmed). It shares
  `extractAndActivateEngine()` with the now-confirmed bundled tier, but
  that is shared-code coverage, not independent proof. Low risk since this
  packet's diff changed nothing about `installEngine()`'s download step or
  the registry tarball format (both explicit non-goals) - if it regresses,
  it would be from unrelated causes, not this packet.
- The isolated-harness runs (test.md, 2026-07-10 Phase 3 entry) hit an
  environment-specific `child_process.spawn` `ENOTCONN` inside unrelated,
  unchanged code (`spawnLogged`/`resolveNodeRunner`) on a heavily-loaded
  dev machine (126+ concurrent `Code.exe` processes) - not reproduced in
  the maintainer's real profile, so treated as a throwaway-harness
  environment issue, not a product defect.
