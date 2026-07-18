# Engine changelog

Release notes for the `@microwebstacks/md-render` npm package. The VS Code
extension has a separate changelog at `packages/vscode-extension/CHANGELOG.md`.

## 0.0.16 - 2026-07-18

### Fixed

- Fixed `ERR_MODULE_NOT_FOUND: Cannot find package 'content-structure'` in
  published `@microwebstacks/md-render` installations.
- The collector now falls back to the engine's bundled
  `_modules/content-structure` package when the private workspace package is
  unavailable through normal Node resolution.
- The GitHub Action materializes the bundled private `content-structure`
  package into its isolated engine installation while keeping
  registry-installed dependencies authoritative.
- Updated `actions/setup-node` from v4 to v5, removing the deprecated Node 20
  action runtime. The renderer itself continues to use the configured Node 22+
  version.
