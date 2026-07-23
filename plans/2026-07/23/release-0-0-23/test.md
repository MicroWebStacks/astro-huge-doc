# Validation

## Registry version check

- `npm view @microwebstacks/md-render version --json`
- Result: `0.0.18`; engine version `0.0.19` is not yet published.

## Build and packaging

- `pnpm build`
- Result: passed with existing Astro route and bundle-size warnings.
- `node scripts/stage-engine.js --version 0.0.19`
- Result: staged the engine with 606 production packages and the bundled
  `content-structure` workspace dependency.
- `pnpm ext:package`
- Result: created and verified extension 0.0.23 with engine 0.0.19; 22 VSIX
  entries, two bundled-engine entries, and 26,915 vendored dependency files.
- `npm pack --pack-destination .` from `packages/md-render`
- Result: created `microwebstacks-md-render-0.0.19.tgz`.

## Focused validation

- `node --test test/preview-history-navigation.test.js
  test/vscode-extension-manifest.test.js
  test/mobile-navigation-interactions.test.js`
- Result: 9 tests passed.
- `git diff --check`
- Result: passed.
- `pnpm check:plans`
- Result before closure: 36 packets consistent.

## Notes

- The first workspace build attempt exposed an incomplete generated
  `node_modules` tree. `pnpm install --frozen-lockfile` repaired it without
  changing the lockfile, after which the build passed.
- No registry publish, Marketplace upload, extension installation, or
  installed-profile smoke test was performed.
