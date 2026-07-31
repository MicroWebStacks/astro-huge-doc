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

VSIX packaging and archive verification will be recorded after the release
source commit exists so the artifact can carry clean commit provenance.
