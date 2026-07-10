# VSIX Packaging Performance Plan

## Problem Summary

The bundled engine currently enters the VSIX as an exploded directory. The
2026-07-09 release build contained 22,846 VSIX entries, including 22,605 loose
files under `extension/bundled-engine/_modules/`, and the staged dependency
tree occupied 192.96 MB before VSIX compression. A real `pnpm ext:package` run
took roughly 20-30 minutes even though the `npm install` vendoring step that
created the loose dependency tree took about one minute.

The evidence points to per-file work in `vsce package`, final-archive
verification, VSIX installation, and Windows real-time scanning as the main
cost. `vsce` reports the same issue directly:

> This extension consists of 22846 files, out of which 9836 are JavaScript
> files. For performance reasons, you should bundle your extension.

The staged engine must remain self-contained and must still be verified in the
final VSIX. A previous packaging failure proved that a correct staging folder
is not sufficient evidence: the shipped archive itself is the release
artifact that must be checked.

## Goal

Ship the complete bundled engine as one npm-format `.tgz` plus one small outer
manifest instead of thousands of loose VSIX entries. Preserve the extracted
engine's file contents and runtime layout while substantially reducing VSIX
entry count, packaging time, and VSIX install-time file operations.

Expected outcomes:

- reduce the bundled-engine contribution from about 22,608 VSIX entries to
  two (`manifest.json` and the `.tgz`);
- reduce the total VSIX entry count from 22,846 to roughly the existing
  non-engine entry count plus those two entries, with the exact result recorded
  during validation;
- reduce `pnpm ext:package` from tens of minutes to low minutes, subject to a
  measured result rather than an assumed one;
- retain the same engine files and `_modules` dependency tree after hydration.

## Scope

- Package the entire output of `scripts/stage-engine.js`, including `dist/`
  and `_modules/`, into one npm-format tarball.
- Add an outer bundled-engine manifest that identifies and authenticates the
  tarball without duplicating the engine's own package metadata.
- Verify both the nested tarball and the final VSIX semantically.
- Reuse the extension's existing npm-tarball extraction path for bundled
  hydration.
- Validate the bundled and registry resolution tiers independently.
- Measure the packaging stages and final artifact shape.

## Non-Goals

- No JavaScript bundler such as esbuild, webpack, or rollup over the engine or
  vendored dependencies.
- No deletion or pruning of files from vendored dependencies. Filename-based
  pruning of Markdown, examples, tests, source maps, declarations, notices, or
  similar categories requires separate dependency-specific evidence and a
  separate plan; a single preview smoke test cannot prove those files are
  universally inert or safe to redistribute without them.
- No change to the engine-resolution order (`enginePath`, local checkout,
  bundled engine, installed engine, registry engine).
- No change to the published `@microwebstacks/md-render` registry tarball
  format or registry transport.
- No attempt to reduce the extracted engine's on-disk file count in VS Code
  global storage. The runtime still needs the normal dependency tree after
  first hydration.

## Current Pipeline

1. `scripts/stage-engine.js` copies the runtime files into a staging directory,
   runs `npm install --omit=dev --omit=optional`, and renames `node_modules` to
   `_modules` so npm's packer will include the vendored dependencies.
2. `scripts/package-extension.js` copies the extension source and stages that
   complete engine as loose files under `bundled-engine/`.
3. `vsce package` writes every staged engine file as an individual VSIX entry.
4. `verifyVsixBundledEngine()` enumerates the final VSIX and checks for the
   unpacked engine package plus `_modules` entries.
5. `hydrateBundledEngine()` recursively copies the VSIX-installed loose engine
   into versioned global storage and renames `_modules` to `node_modules`.
6. Separately, `installEngine()` downloads the published npm tarball and uses
   `extractTarGz()` before performing the same dependency-directory rename.

## Accepted Design

### AD-001 - Bundled artifact layout

The staged extension will contain exactly these bundled payload entries:

```text
bundled-engine/
  manifest.json
  engine.tgz
```

`engine.tgz` contains the complete npm-packed staged engine, including its
authoritative `package/package.json`, `package/build-meta.json`, runtime files,
`dist/`, and `_modules/` tree.

`manifest.json` is the cheap pre-extraction contract and contains at least:

- a manifest schema version;
- engine package name and expected version;
- tarball filename;
- tarball byte length;
- tarball SHA-256 digest.

Do not keep unpacked copies of the engine's `package.json` or
`build-meta.json` next to the tarball. The tarball copies remain authoritative,
while the outer manifest provides only the fields needed to locate and verify
the payload before extraction.

### AD-002 - Packing boundary

Run `npm pack` against the complete engine staging directory produced by
`scripts/stage-engine.js`. Write the resulting archive outside that source
directory, normalize its staged extension filename to `engine.tgz`, then
compute the manifest from the exact bytes that will enter the VSIX.

Nothing under the staged engine, including `dist/`, remains loose in the
extension package. No staged engine file is transformed or intentionally
removed by this packet.

### AD-003 - Extraction and activation

Refactor the common post-download work into one internal extraction-and-
activation path used by both bundled hydration and registry installation:

1. extract the npm tarball into a fresh temporary sibling directory;
2. read the extracted package metadata;
3. require the expected package name and engine version;
4. require the declared `vendoredModulesDir` and rename it to `node_modules`;
5. require the resulting directory to satisfy the existing usable-engine
   checks;
6. promote the completed directory into the versioned install location only
   after all validation succeeds;
7. clean up the temporary directory on success or failure.

This avoids treating a partially extracted directory as a valid cached engine.
The bundled path first verifies the outer manifest's size and digest. The
registry path continues to trust the registry transport but receives the same
post-extraction package and layout validation.

If the installed extension contains a manifest but that manifest, digest, or
tarball is invalid, bundled activation must fail loudly with an actionable
repackage message. It must not silently reinterpret a corrupt bundled payload
as a normal registry fallback condition.

### AD-004 - Final-artifact verification

`verifyVsixBundledEngine()` must inspect the completed `.vsix`, not only the
staging tree. Verification succeeds only when all of the following are true:

- the final VSIX contains `extension/bundled-engine/manifest.json` and
  `extension/bundled-engine/engine.tgz`;
- it contains no loose `extension/bundled-engine/_modules/`, `dist/`,
  `server/`, `scripts/`, or `src/` payload trees;
- the manifest parses, names the expected engine package/version and
  `engine.tgz`, and reports the actual nested entry byte length;
- the SHA-256 digest of the exact nested `engine.tgz` bytes matches the
  manifest;
- the nested tarball is readable and contains the expected
  `package/package.json`, `package/build-meta.json`, `package/config.js`,
  `package/server/server.js`, `package/scripts/collect.js`,
  `package/dist/server/entry.mjs`, and a non-trivial
  `package/_modules/` payload;
- the nested `package/package.json` has the expected name, version, and
  `vendoredModulesDir` value;
- the total VSIX entry count and bundled-engine entry count are reported.

The size threshold and entry count are diagnostic evidence, not substitutes
for parsing, metadata validation, and digest verification.

## Implementation Phases

### Phase 1 - Package the staged engine as one authenticated tarball

- Add the packing step around the existing `stage-engine.js` output.
- Produce `bundled-engine/engine.tgz` and its outer manifest.
- Ensure temporary packing artifacts live under the existing packaging temp
  location or system temp directory, never the workspace root.
- Replace the current loose-payload VSIX verifier with the AD-004 checks.
- Record timings separately for engine staging/vendoring, `npm pack`,
  `vsce package`, final verification, and total elapsed time.

Exit criteria:

- stage-only output contains only the accepted two-file bundled payload;
- nested-tarball semantic validation passes;
- a real `pnpm ext:package` succeeds and final-artifact verification passes;
- the measured VSIX counts, byte size, and stage timings are recorded in
  `test.md`.

### Phase 2 - Share safe extraction and activation

- Change `hasBundledEnginePackage()` to validate the outer manifest and
  tarball presence instead of calling `isEngineRoot()` on an unexploded
  directory.
- Change `hydrateBundledEngine()` to read and authenticate `engine.tgz` before
  invoking the shared extraction-and-activation path.
- Refactor `installEngine()` to use the same post-extraction validation and
  activation path without changing its download behavior.
- Preserve versioned global-storage locations and existing old-engine cleanup.
- Ensure interrupted or failed extraction leaves no usable partial install.

Exit criteria:

- syntax/focused checks cover valid payloads, bad manifest metadata, digest
  mismatch, corrupt gzip/tar data, missing runtime files, wrong package
  version, and missing `_modules`;
- successful extraction produces the same required runtime layout as the
  current loose-copy hydration, including `node_modules` restored from
  `_modules`;
- failure cleanup is verified against a temporary install location.

### Phase 3 - Validate both runtime tiers

Run two separate clean-profile exercises using the established isolated VS
Code harness from the Marketplace-readiness packet:

1. `engineSource=auto`, with no `enginePath`, proves the installed VSIX reads,
   authenticates, extracts, and runs its bundled `engine.tgz` without registry
   access being required.
2. `engineSource=registry`, in a fresh storage/profile location, proves the
   actual download URL, registry transport, extraction, activation, and
   runtime path for the pinned published engine.

Each exercise must establish:

- the expected engine tier was selected, based on extension logs and resolved
  engine path rather than inference;
- preview startup completed and a real rendered page returned HTTP 200;
- the preview stopped cleanly;
- no isolated `Code.exe` or child runtime processes remained;
- the hydrated/installed engine passed the existing usable-engine checks.

If registry access is unavailable in the implementation environment, the
bundled proof may still be recorded, but the packet's registry criterion
remains explicitly unverified rather than being claimed through shared-code
coverage.

Exit criteria:

- both clean-profile runs pass, or any environment-blocked registry run is
  recorded as an unverified exit gap;
- `test.md` distinguishes bundled-tier proof, registry-tier proof, and shared
  helper checks.

## Dependencies and Risks

- `npm pack` requires npm on the maintainer's packaging machine. This is not a
  new release dependency because engine vendoring already invokes npm.
- `npm pack` still walks and compresses the staged files. The expected speedup
  is based on reducing work in the outer VSIX, so the actual improvement must
  be measured by stage rather than assumed.
- The `.tgz` is already gzip-compressed, so wrapping it in a VSIX may not reduce
  artifact bytes significantly. File-count and install-operation reductions
  are the primary goals.
- First bundled activation still writes the complete engine tree into global
  storage. This packet removes the earlier VSIX-install extraction and
  recursive-copy duplication; it does not eliminate the one extraction the
  runtime requires.
- Outer-manifest and inner-package disagreement can select or cache the wrong
  engine unless both are validated. The digest and post-extraction checks are
  mandatory controls.
- Windows file locks can interfere with promotion or cleanup. Use the repo's
  existing bounded retry pattern where appropriate and never treat cleanup
  failure as proof that activation succeeded.
- Tar parsing is security-sensitive. Preserve the existing destination-boundary
  protection and reject unsupported or malformed entries rather than writing
  outside the temporary install root.

## Exit Criteria

1. The final VSIX contains only `manifest.json` and `engine.tgz` under its
   bundled-engine payload, and AD-004 semantic verification passes against the
   final archive.
2. The final VSIX and bundled-engine entry counts are recorded and show the
   intended order-of-magnitude reduction from the 22,846-entry baseline.
3. Packaging stage timings and total wall-clock time are recorded against the
   2026-07-09 20-30 minute baseline; the result demonstrates a substantial
   reduction, with any missed target explained from measured stage data.
4. Extracted engine file contents and required runtime layout match the staged
   source, except for the intentional `_modules` to `node_modules` rename.
5. The bundled `engineSource=auto` clean-profile install and preview exercise
   passes without relying on the registry.
6. A distinct `engineSource=registry` clean-profile exercise passes against
   the pinned published engine; if network access prevents it, that gap remains
   explicit and the packet is not described as having registry-tier proof.
7. No JavaScript bundling, vendored-file pruning, registry-format change, or
   engine-resolution-order change is introduced.
8. When implementation begins, create `implementation.md`, change this
   packet's existing `plans/open.md` row from planning to implementation in
   progress, and run `pnpm check:plans` in the same turn. When implementation
   finishes, write the Done marker and move the row to `plans/closed.md`
   atomically, then run `pnpm check:plans` again.
