# VSIX Packaging Performance Plan

## Problem Summary

`pnpm ext:package` (and, by the same mechanism, the resulting VSIX's own
install-time footprint) is dominated by file *count*, not data volume. The
bundled `bundled-engine/_modules` vendored dependency tree currently ships as
~22,605 loose files (192.96 MB) inside the VSIX. Packaging a real (non-
`--stage-only`) build on 2026-07-09 took on the order of 20-30 minutes end to
end, while the `npm install` vendoring step that writes a comparable number of
raw files to disk took about 1 minute in the same run. That gap points at the
per-file overhead in `vsce package`'s own zip writer and this repo's own
`verifyVsixBundledEngine()` (`scripts/package-extension.js`, using `AdmZip` to
enumerate every entry) rather than at disk I/O or data size in general - both
walk the archive one entry at a time, and Windows Defender real-time scanning
of tens of thousands of small files plausibly compounds it further. `vsce`
itself already warns about this on every run:

> This extension consists of 22846 files, out of which 9836 are JavaScript
> files. For performance reasons, you should bundle your extension.

This packet is about fixing the file-count problem specifically without
touching how any of the shipped code runs - see Non-Goals.

## Goal

Cut the VSIX's entry count from ~22,846 to a small handful, so packaging time
drops from tens of minutes back to roughly what the vendoring step alone
already costs (about a minute), and so a real end user's VSIX install/first
activation isn't paying per-file overhead either - without changing, moving,
or transforming a single byte of the vendored dependency code.

## Non-Goals

- **No JS bundler** (esbuild/webpack/rollup) over the vendored dependency
  tree. The engine's dependency graph includes React, MUI, Mantine, three,
  plotly, Astro's own SSR output, Shiki, and KaTeX; several of these load
  assets or grammars via dynamic/runtime-computed `require()`/file paths that
  a bundler can silently fail to trace, producing a build that packages
  cleanly and then breaks a specific feature nobody happened to exercise
  in testing. That risk is exactly what this packet is trying to avoid, so
  bundling is explicitly out of scope here (it can be its own, separately
  evaluated packet later if the tarball approach below isn't enough).
- Not re-architecting the engine-resolution tiers (`enginePath` / local
  checkout / bundled / installed / registry) - only how the bundled tier's
  *payload* is stored inside the VSIX and hydrated from it.
- Not changing `@microwebstacks/md-render`'s published npm tarball format or
  the registry-install tier's wire format.

## Current Pipeline (for reference)

1. `scripts/stage-engine.js` copies `config.js`/`server/`/`scripts/`/`src/libs`
   `/src/assets`/`dist` into a staging dir, then vendors production
   dependencies via `npm install --omit=dev --omit=optional` into
   `node_modules`, renamed to `_modules` (npm's packer always strips a
   directory literally named `node_modules` from a tarball, hence the
   rename/restore dance already used for the registry tier).
2. `scripts/package-extension.js` copies the extension source, calls
   `stage-engine.js` again to produce `bundled-engine/` inside the staged
   extension folder, then runs `vsce package` (via `npm exec`) and finally
   `verifyVsixBundledEngine()`, which opens the resulting `.vsix` with
   `AdmZip` and asserts `extension/bundled-engine/package.json` plus at least
   one `extension/bundled-engine/_modules/*` entry exist.
3. At runtime, `packages/vscode-extension/extension.js`'s
   `hydrateBundledEngine()` does a plain recursive `fsp.cp()` of the exploded
   `bundled-engine/` directory (already unzipped onto disk by VS Code's own
   VSIX installer) into `globalStorage/bundled-engine-<version>/`, then
   renames the vendored dir back to `node_modules`.
4. Separately, the **registry** tier (`installEngine()` in the same file)
   already downloads `@microwebstacks/md-render`'s real published npm
   tarball over HTTPS and extracts it in-process with a from-scratch
   USTAR/PAX tar reader (`parseTarEntries`/`extractTarGz`, ~lines 610-686),
   because npm registry tarballs are exactly that format.

The registry tier already solved "how do we explode a tarball into a target
directory without npm/system tar" - the bundled tier just isn't using that
solution yet, and instead ships the exploded form directly.

## Proposed Approach: ship one tarball, reuse the existing reader

Instead of staging `bundled-engine/` as loose files inside the packaged
extension folder, pack it into a single tarball with `npm pack` (the same
packer `npm publish` already uses for the real registry release - identical
format to what `extractTarGz` already parses, so this is format-compatible
with zero new parsing logic) and ship *that one file* inside the VSIX. Keep a
small unpacked `package.json` (and `build-meta.json`) alongside it, unpacked,
so version/build-metadata checks that don't need the full payload
(`hasBundledEnginePackage()`, `loadEngineBuildMetadata()`) stay cheap.

At runtime, change `hydrateBundledEngine()` to read the bundled tarball and
call the already-implemented `extractTarGz()` - the exact function the
registry tier already uses - instead of `fsp.cp()`-ing thousands of loose
files. This converges the bundled and registry tiers onto one extraction code
path instead of two.

Why this is low-risk:

- It is a repackaging change, not a code transformation. Every byte inside
  the tarball is identical to what ships today; only the container changes
  (thousands of loose zip entries -> one file that itself contains an
  untouched copy of those same bytes).
- The packer (`npm pack`) and the reader (`extractTarGz`) both already exist
  and are already relied on in production for the registry tier - this
  packet does not introduce new tar-handling code, it extends reuse of code
  that's already shipping.
- No dynamic-`require()` or asset-resolution risk: nothing about how the
  vendored packages resolve modules at runtime changes, since they land on
  disk in `globalStorage` in exactly the same shape they do today, just
  reached via tar-extraction instead of a recursive directory copy.

Known gap to close as part of this work: the registry tier's `extractTarGz`
path has not actually been exercised in a real clean-profile VS Code install
in this repo's current validation history (only earlier local/manual
testing, before `@microwebstacks/md-render` was published) - see
`plans/2026-06/28-vscode-marketplace-readiness/test.md` (2026-07-09 entry).
Reusing it for the bundled tier makes proving it end-to-end part of this
packet's exit criteria, not optional.

## Complementary, Separately-Safe Step: prune inert vendored files

Independent of the tarball change, `scripts/stage-engine.js`'s vendoring step
(or a post-processing pass over `_modules` before packing) can delete files
that are provably never read at runtime, without touching any file that is:

- `*.md`, `*.markdown` (docs)
- `*.map` (source maps - not consumed by the running lite/json engine)
- `*.d.ts`, `*.d.mts`, `*.d.cts` (TypeScript type declarations - types are not
  read at runtime by plain Node)
- `test/`, `tests/`, `__tests__/`, `*.test.js`, `*.spec.js`, `example/`,
  `examples/`, `.github/` directories inside vendored packages
- `CHANGELOG*`, `*.flow` (Flow type files)

This is deletion of clearly non-runtime file *categories*, not a rewrite of
any file that ships - the risk profile is "did we accidentally delete a file
some package reads at runtime" (checked by the existing clean-profile smoke
test), not "did a bundler silently drop reachable code."

Caution: do **not** strip nested `LICENSE`/`LICENSE.md`/`NOTICE` files from
vendored packages - some open-source licenses require preserving attribution
files in redistributed copies, and pruning those would trade a size win for a
license-compliance regression. Keep the allowlist above scoped to what's
clearly safe.

## Open Points

### OP-001 - Does `vendoredModulesDir`'s existing rename dance still apply once tarball'd?

Status: needs a decision during implementation, not before

Today, `installEngine()` (registry tier) extracts the downloaded tarball,
then renames `installedPkg.vendoredModulesDir` (i.e. `_modules`) back to
`node_modules`. If the bundled tier reuses the identical tarball format, the
same rename step applies unchanged - `hydrateBundledEngine()` should end up
doing the same "extract, then rename `_modules` -> `node_modules`" sequence
`installEngine()` already does. This strongly suggests the two functions can
share a single `extractAndActivateEngine(buffer, installRoot)` helper rather
than staying as two near-duplicate implementations - a simplification to make
during implementation, not a new open design question.

### OP-002 - Where does the single bundled tarball live inside the VSIX, and how does packaging still verify it?

Status: needs a decision during implementation

`scripts/package-extension.js`'s `verifyVsixBundledEngine()` currently checks
for many loose `_modules/*` entries as proof the payload made it into the
archive (a lesson learned the hard way in the 2026-07-07 packaging-gap
follow-up in the Marketplace-readiness packet - staging-folder success was
not enough proof before). With a single tarball file, that check should
instead assert the tarball entry exists inside the VSIX at its expected size
(non-trivial, e.g. > some minimum byte threshold) - keeping the same "verify
the final archive, not just the staging directory" discipline, adapted to
the new shape.

## Implementation Phases

### Phase 1 - Single-tarball bundled engine

- Change `scripts/stage-engine.js` (or a new small step called from
  `scripts/package-extension.js`) to run `npm pack` against the staged engine
  directory, producing one `.tgz`.
- Change `scripts/package-extension.js` to stage `bundled-engine/package.json`
  + `bundled-engine/build-meta.json` (unpacked, for cheap metadata reads) plus
  the single packed tarball, instead of the whole exploded tree.
- Update `verifyVsixBundledEngine()` per OP-002.
- Change `packages/vscode-extension/extension.js`'s `hasBundledEnginePackage()`
  to check for the tarball's presence instead of `isEngineRoot()` against an
  unexploded directory (that check only makes sense post-extraction).
- Change `hydrateBundledEngine()` to extract the tarball via `extractTarGz()`
  into `globalStorage/bundled-engine-<version>/`, following OP-001.

Exit criteria:

- `pnpm ext:package` produces a VSIX with a bundled-engine entry count in the
  single digits (plus whatever the built `dist/` output already needs, if
  that stays unpacked - decide during implementation whether `dist/` joins
  the tarball too, since it's also many small files).
- Packaging wall-clock time is measured and compared against the 2026-07-09
  baseline (20-30 minutes) in `test.md`.
- The clean-profile validation from
  `plans/2026-06/28-vscode-marketplace-readiness/` is re-run against the new
  VSIX shape and still passes (real HTTP 200 from a rendered page, clean
  shutdown, no orphaned processes).

### Phase 2 - Prune inert vendored files

- Add the safe-deletion allowlist (see above) as a post-vendor cleanup step
  in `scripts/stage-engine.js`, applied before packing.
- Re-run the clean-profile validation to confirm nothing that mattered at
  runtime was deleted.
- Record the size delta (`_modules` byte size and file count, before/after)
  in `test.md`.

Exit criteria:

- Vendored tree size drops measurably with no regression in the
  clean-profile smoke test.
- The prune allowlist is documented in code (a comment next to wherever it's
  implemented) so a future dependency upgrade that adds a new "obviously
  inert" file category is easy to extend, and so nobody re-adds a license-file
  deletion without seeing this packet's caution note first.

## Dependencies and Risks

- `npm pack` requires npm on the maintainer's machine, which `pnpm build` and
  the existing vendoring step already require - no new tooling dependency.
- The one behavioral risk worth calling out explicitly: if `hydrateBundledEngine()`
  changes its directory-detection logic (`hasBundledEnginePackage()`) and gets
  it wrong, the bundled tier could silently fail closed (falls through to the
  registry-download tier instead of using the offline bundle) rather than
  loudly - the exit criteria above require a real clean-profile run
  specifically to catch that class of failure, not just a unit-level check.
- Reduced VSIX file count does not reduce `_modules`' actual byte size much
  by itself (gzip already compresses the tarball); the size win is smaller
  than the time win. Phase 2 (pruning) is where actual size drops.

## Exit Criteria

1. `pnpm ext:package` wall-clock time is measured before/after and shows a
   large reduction (target: low minutes, not tens of minutes).
2. The packaged VSIX still passes a real clean-profile install and preview
   exercise (reusing the method from
   `plans/2026-06/28-vscode-marketplace-readiness/test.md`'s 2026-07-09
   entry), including the previously-unexercised registry-tier extraction path
   now being shared code.
3. No JS bundler was introduced; every vendored file's content is unchanged
   from today except for the Phase 2 prune allowlist, which is documented.
4. `plans/open.md` is updated when implementation starts, and this packet is
   moved to `plans/closed.md` per `WORKFLOW.md` once `implementation.md`'s
   Progress marker reads Done.
