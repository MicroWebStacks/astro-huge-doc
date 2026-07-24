# Preview Lock — App Bar Button

Status: implemented and verified, closed 2026-07-24.

## Goal

Remove the native VS Code editor-title Lock/Unlock buttons and replace them
with a toggle in the web app's own `AppBar`, consistent with the project's
existing direction of keeping preview-affecting controls inside the rendered
page rather than in VS Code chrome (the Back/Forward history arrows in
`Breadcrumb.astro` already follow this pattern, see
[2026-07-23-preview-history-navigation](../../23/preview-history-navigation/plan.md)).

## Decision

- **No native VS Code button.** The `editor/title` menu contributions for
  `microwebstacks.internal.lockDocsPreview` / `unlockDocsPreview` are removed
  from `packages/vscode-extension/package.json`.
- **Commands stay registered**, hidden from the command palette (unchanged)
  and now reachable only via the webview's postMessage bridge and directly by
  tests (`microwebstacks.internal.testPreviewMessage`). This avoids touching
  the `session.locked` state machine or `followActiveEditor` gating in
  `extension.js`, which are unrelated to where the toggle affordance lives.
- **Bridge reuses the existing pattern** from `preview_history.js` /
  `preview-webview.js` (the two-hop relay: page → iframe wrapper →
  `vscode.postMessage` → extension host, and back). New message types:
  `microwebstacks.previewLock` (page → host, `{locked}`) and
  `microwebstacks.previewLockState` (host → page, `{locked}`), mirroring
  `previewRoute`/`previewHistoryState`.
- **New AppBar control**: a `nav-toggle`-style button gated by
  `showPreviewLock={liveReload}` (same gating as the runtime-info icon and the
  breadcrumb history arrows — i.e. only rendered when
  `extensionPreviewEnabled()`), hidden client-side by `preview_lock.js` if the
  page isn't actually embedded in the extension's iframe (`window.parent ===
  window`), matching `preview_history.js`'s guard. `AppBar` sits inside
  `<header>`, which is already hidden in the page-render-preview popup via
  `data-preview-mode`, so no separate preview-mode guard was needed here.

## Non-goals

- No change to the lock/follow behavior itself (`session.locked`,
  `followActiveEditor`) — only where the toggle lives.
- No change to `microwebstacks.previewDocs`'s editor-title button (globe
  icon) — that one opens the panel and has no in-page equivalent.
