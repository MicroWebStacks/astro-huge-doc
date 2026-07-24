# Preview Lock — App Bar Button — Implementation

## Progress

[######] Done.

## Changes

- `packages/vscode-extension/package.json` — removed the
  `lockDocsPreview`/`unlockDocsPreview` entries from `menus["editor/title"]`.
  Commands remain in `contributes.commands` and stay hidden from
  `commandPalette` (unchanged).
- `packages/vscode-extension/extension.js`
  - `handlePreviewMessage` is now `async` and handles a new
    `microwebstacks.previewLock` message (`{locked}`) by calling the new
    `applyPreviewLocked(session, locked)`.
  - `setActivePreviewLocked(locked)` (used by the still-registered commands)
    now delegates to `applyPreviewLocked(activePreviewSession(), locked)`
    instead of duplicating the state mutation.
  - `applyPreviewLocked` additionally calls the new `postPreviewLockState`
    after mutating `session.locked`, so any open panel is told the new state
    regardless of whether the change came from a command or a webview click.
  - `updatePreviewPanel` now passes `session.locked` into `renderWebviewHtml`
    so a fresh panel render (route change, reveal) carries the current lock
    state as the iframe wrapper's initial state.
- `packages/vscode-extension/preview-webview.js` — `renderWebviewHtml` gained
  a `locked` parameter, embeds an `initialLockState` alongside
  `initialHistoryState`, and the relay script forwards
  `microwebstacks.previewLock` (page → host) and `previewLockState` (host →
  page) using the same `sendHistoryState`/`sendLockState` pattern.
- `src/layout/AppBar.astro` — new `showPreviewLock` prop; a `nav-toggle`
  button (`data-preview-lock-toggle`) with a padlock icon whose shackle
  swaps open/closed via `aria-pressed` (CSS only, no JS-driven path swap).
- `src/layout/preview_lock.js` — new client script, structural twin of
  `preview_history.js`: relays clicks up as `previewLock` messages and
  applies incoming `previewLockState` messages to `aria-pressed`/title/label.
  Hides the button entirely if `window.parent === window` (not embedded).
- `src/layout/Layout.astro` — wires `showPreviewLock={liveReload}` into
  `<AppBar>` and loads `preview_lock.js` next to `preview_history.js`, both
  gated on `liveReload` (`extensionPreviewEnabled()`).
- `packages/vscode-extension/test/suite/index.js` — the "follow/lock
  behavior" integration case now toggles the lock via
  `testPreviewMessage(..., {type: 'microwebstacks.previewLock', locked})`
  instead of executing the removed commands directly, so it exercises the
  actual new path.
- `test/vscode-extension-manifest.test.js` — replaced the editor/title lock
  assertions with an assertion that no lock/unlock entries exist there (only
  `previewDocs`), plus a note that the commands remain registered.
- `test/preview-history-navigation.test.js` — added two new tests
  (`app-bar lock toggle relays clicks and applies pushed lock state`,
  `...hides itself when not embedded`) mirroring the existing
  `preview_history.js` coverage, and extended the webview-relay test to
  assert the lock message/state round trip alongside the existing history
  one (the relay now sends two messages on frame `load`, not one).

## Verification

- `pnpm test` — 71/71 passing (was 69; +2 new lock tests), including the
  updated manifest and webview-relay tests.
- `MICROWEBSTACKS_DOCS_ROOT=demo pnpm build` — static build completes clean
  with the AppBar/Layout changes (button does not render in static output,
  as expected — `showPreviewLock` is `liveReload`-gated).
- `pnpm ext:stage-engine` — re-run so `packages/md-render` picks up the
  `src/` changes before the extension is next packaged.

## Not covered

- No interactive click-through inside a real VS Code Extension Development
  Host — same category of gap as several other recent packets
  (client-puml, page-render-preview, vscode-lite-parity). Automated coverage
  is the relay logic (unit) and the follow/lock state machine
  (`test/suite/index.js`, runs in the real extension host via
  `pnpm test:extension`, not executed this session).
