# Validation

## Passed

- `corepack pnpm install --no-frozen-lockfile`
  - synchronized the stale XLSX importer entry without downloading packages.
- `corepack pnpm test`
  - 161 tests: 160 passed, 1 expected artifact-dependent skip, 0 failed.
- `corepack pnpm check:plans`
- `git diff --check`
- Empty-workspace lite `corepack pnpm build`
- `corepack pnpm ext:package`
  - extension 0.0.27 and engine 0.0.23 stamps identify commit `d9f20ec`;
  - package verification passed for manifest, digest, archive layout, required
    runtime paths, and vendored dependency count.

## Artifact

- Path: `packages/vscode-extension/markdown-site-preview.vsix`
- Size: 104,680,212 bytes (99.83 MiB)
- SHA-256:
  `74D20528B3EF028FFE9AAFAABC0E97833121102B98DC43FEBBB7EF92B4E729D3`
- Bundled engine archive: 104,624,790 bytes
- VSIX entries: 22 total; 2 bundled-engine entries

## Not Performed

- No npm engine publication.
- No Marketplace upload or installed-extension manual smoke test.
