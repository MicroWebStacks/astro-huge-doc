# Implementation - Phase 2 (Engine Package + Extension Bootstrap)

Tracks the Option B work: the extension resolves a `@microwebstacks/md-render`
engine instead of assuming a repo checkout, while the local workspace checkout
stays a guaranteed fallback.

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
3. Installed engine in `globalStorage/engine/node_modules/@microwebstacks/md-render`
   - used if already present. Skipped when `engineSource = local`.
4. Install then use - `npm install @microwebstacks/md-render@<pinned>` into
   `globalStorage/engine`, then resolve tier 3. Skipped when
   `engineSource = local` (local mode never touches the registry).

Mode semantics:

- `auto`: 1 -> 2 -> 3 -> 4. Never breaks local; registry is the last resort.
- `local`: 1 -> 2 only. Fully offline / repo-dev guarantee. Errors clearly if no
  local engine is found instead of reaching the network.
- `registry`: 1 -> 3 -> 4. Forces the published-install path even inside the
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
- [ ] Publish `@microwebstacks/md-render` (blocked on content-structure)
- [ ] End-to-end clean-profile registry install validation
