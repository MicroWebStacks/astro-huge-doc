# Active Tracking Improvements — Implementation

## Progress

[#####] Done - all five phases implemented; Windows extension-host baseline,
focused tests, production build, and CI runtime reporting are in place.

## What landed

- Added the extension-only `/__lite/source-route` endpoint. It validates a
  content-relative `.md` path and returns the renderer's canonical route from
  persisted or live source entries.
- Preview opening now selects the active Markdown file's workspace and route,
  with single-folder fallback and a multi-root QuickPick. Existing panels
  navigate instead of reopening.
- Added follow mode and a native VS Code webview-title lock/unlock control.
  `.mdx`, alternate Markdown extensions, non-files, and out-of-root documents
  do not drive navigation.
- Replaced global preview state with workspace-URI-keyed sessions containing
  their own server, port, storage, panel, watcher, timer, operation queue,
  route, and lock state. Panel close, stop, folder removal, and deactivation
  share idempotent cleanup.
- Declared restart-sensitive settings resource-scoped. Effective per-folder
  snapshots restart only changed sessions, coalescing rapid events while
  preserving route and lock state.
- Removed the external-browser command and `.mdx` watcher boundary; documented
  the command removal in the extension changelog.
- Added pinned `@vscode/test-electron@3.0.0` / VS Code 1.100.3 fixtures and
  tests, JSON/Markdown timing reports, and a Windows/Ubuntu Actions matrix
  with visible summaries and named downloadable artifacts.

## Main files

- `packages/vscode-extension/extension.js` and `package.json`
- `packages/vscode-extension/test/`
- `src/libs/extension-preview.js`, `src/middleware.js`, and
  `src/layout/source_navigation.js`
- `test/extension-preview-endpoints.test.js` and
  `test/vscode-extension-manifest.test.js`
- `.github/workflows/vscode-extension-tests.yml`
- `scripts/publish-extension-test-summary.js`

## Implementation decisions and deviations

- The effective content root is read from `/__lite/runtime` after readiness,
  keeping manifest parsing in the engine and containment correct for nested
  manifest render folders.
- Two internal toolbar commands with mutually exclusive conditions provide
  one stateful lock icon. Both are hidden from the Command Palette; no
  rendered-page bridge was introduced.
- Lifecycle snapshots use commands registered only in non-production
  extension modes and are not contributed to the manifest.
- Same-workspace coordination across VS Code windows remains unsupported, and
  macOS remains outside the CI matrix.

## Follow-up risk

- The first Ubuntu timing artifact will exist after the new workflow runs in
  GitHub Actions. The local Windows baseline is in `test.md`.
- The unrelated broad Node suite remains partially blocked in this checkout
  by the pre-existing incomplete `glob` installation; focused tests and the
  production build complete successfully.

## Post-closure correction — 2026-07-23

- Corrected the lock/unlock title action contribution after runtime inspection
  showed that VS Code did not render it. Webview panels use the
  `editor/title` menu with the `activeWebviewPanelId` context key; the original
  implementation incorrectly used `webview/title` with `webviewId`.
- Added a manifest regression test that rejects the invalid menu location and
  verifies both state-dependent actions target the
  `microwebstacksDocsPreview` panel.
- Renamed the mutually exclusive actions to `Preview Lock` and
  `Preview Unlock`, giving them a shared sort prefix so toggling state does not
  move the title-bar icon.
