# Validation

## Passed Before Source Commit

- `corepack pnpm install --frozen-lockfile`
  - Reconstructed the incomplete local dependency tree without changing the
    lockfile.
- `corepack pnpm test`
  - 195 tests: 194 passed, one expected artifact-dependent skip, zero failed.
- `corepack pnpm check:plans`
- `git diff --check`
- Empty-workspace lite `corepack pnpm build` with
  `MICROWEBSTACKS_WORKSPACE_ROOT=.tmp/release-0-0-28-empty-workspace`.

## Packaging

- The first `corepack pnpm ext:package` attempt stopped as designed at the
  staged-engine size guard: 504.9 MB against a 460 MB limit.
- Registry metadata and the installed package layout identified roughly 80 MB
  of duplicate vis-network build families; the engine uses only
  `vis-network/standalone` -> `standalone/esm/vis-network.mjs`.
- Focused `node scripts/stage-engine.js --out
  .tmp/release-0-0-28-stage --version 0.0.24` passed at 427.5 MB across 27,859
  files, below the 460 MB guard.
- A direct ESM import of the retained
  `_modules/vis-network/standalone/esm/vis-network.mjs` passed before the
  disposable staging tree was removed.
- Final `corepack pnpm ext:package` passed from clean commit `3d177db`:
  - extension 0.0.28 and bundled engine 0.0.24;
  - staged engine 427.5 MB across 27,859 files;
  - authenticated `engine.tgz` 112,722,279 bytes;
  - 27,332 vendored dependency files;
  - 22 VSIX entries, including the two expected bundled-engine entries.

## Artifact

- Path: `packages/vscode-extension/markdown-site-preview.vsix`
- Size: 112,802,996 bytes (107.58 MiB)
- SHA-256:
  `22225E9044465BB76148F263E383D08E1B3B25D0DD0C9C976448AD94A5DFE0A0`

## Not Performed

- No npm engine publication.
- No Marketplace upload or installed-extension manual smoke test.
