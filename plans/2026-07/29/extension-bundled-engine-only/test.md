# Validation

## Passed

- `node --check packages/vscode-extension/extension.js`
- `node --test test/vscode-extension-manifest.test.js test/vscode-extension-engine-acquisition.test.js`
  - 5 tests passed.
- `node scripts/diagnose-extension-hydration.cjs`
  - 13 diagnostic checks passed, including concurrent activation, direct
    vendored-module extraction, returned timing fields, cleanup, and automatic
    filesystem diagnostics.
- `corepack pnpm check:plans`
- Source guard confirms the extension has no npm registry URL, `https`
  dependency, `fetchBuffer()`, `installEngine()`, or `engineSource` setting.
- Scoped `git diff` across Pages, Action, and engine publish/package/stage
  scripts was empty.

## Broader Suite

`corepack pnpm test` reached 114 tests: 98 passed, 1 skipped, and 15 failed
before exercising application behavior because the existing installation
cannot resolve `glob/index.js` from the root and
`packages/content-structure/node_modules`. The two new engine-acquisition tests
and the existing extension-manifest tests passed within that run. No dependency
installation or unrelated workspace repair was attempted.

