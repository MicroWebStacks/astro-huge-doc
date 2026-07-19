# Implementation: In-Viewer Preview Runtime Observability

[######] Done - runtime endpoint, app-bar info dialog, launcher pass-through, spec section; verified in dev and built modes.

## Changes

- `src/libs/extension-preview.js`: `engineMetadata()` (build-meta.json →
  release identity; package.json → `source: 'workspace'`) and
  `runtimePayload({dev})` with launcher (`MICROWEBSTACKS_LAUNCHER` env),
  mode, profile/backend/output, paths, configured server, node/pid/uptime.
- `src/middleware.js`: `GET /__lite/runtime` behind the shared gate;
  `dev` flag from `import.meta.env.DEV`.
- `src/layout/AppBar.astro`: `showRuntimeInfo` prop renders an ⓘ button
  (`#runtime-info-toggle`) in the right cluster, reusing the `.nav-toggle`
  style.
- `src/layout/runtime_info.js` + `runtime_info.css` (new): dialog built on
  demand; fetches `/__lite/runtime`, live-probes navigation/version endpoints
  with latency, shows lazy menu's last result
  (`window.__mwsNavigationStatus`), flags configured-vs-tab port drift as a
  warning row, copy-diagnostics button; Esc/backdrop close; lightbox/token
  styling; mobile single-column layout.
- `src/layout/Layout.astro`: passes `showRuntimeInfo={liveReload}`, loads
  `runtime_info.js` under the same gate as `lazy_navigation.js`.
- `src/layout/lazy_navigation.js`: records last load result on
  `window.__mwsNavigationStatus`; error text now points at the ⓘ icon.
- `packages/vscode-extension/extension.js`: `createRuntimeEnv()` adds
  `MICROWEBSTACKS_LAUNCHER: vscode-extension@<version>`.
- `specification/run-modes/spec.md`: new "Observability — the tab must be
  able to explain itself" section; `/__lite/runtime` added to the app-owned
  endpoint list.
- `test/extension-preview-endpoints.test.js`: runtime payload test (mode
  flag, launcher pass-through, workspace fallback identity, configured port).

## Verification

- `pnpm test`: 25/25 pass.
- `astro dev --port 4555` + headless Chromium (playwright): lazy menu
  populated; dialog opens with all rows; the configured-port row correctly
  warned "4321 - but this tab is on 4555" (the exact incident scenario, now
  visible in-page); no page errors; screenshot captured.
- `pnpm build` + `server/server.js` on 4666 with
  `MICROWEBSTACKS_LAUNCHER=vscode-extension@0.0.18-dev`: `/__lite/runtime`
  answers `mode: "built"` with the launcher shown; info button present in the
  served HTML.

## Post-verification fixes (2026-07-15, maintainer report)

Two defects in the first drop, both found in real use, both design errors
with a shared lesson (now in the spec's Observability section: "observability
is never destructive"):

- **Dialog rendered light in dark theme.** It reused
  `--lightbox-surface-bg`, which colors.css deliberately keeps light
  (`#F4F4F4`) in dark mode for the image lightbox plate. Fixed: the dialog
  sits on the content tokens (`--content-bg-color`/`--content-color`) so it
  follows the page theme.
- **Close button (and Esc) did nothing.** The custom backdrop `<div>` was
  hidden via the `hidden` attribute, but its class set `display: flex`,
  which outranks the UA's `[hidden] { display: none }`. Fixed structurally:
  replaced the hand-rolled overlay with a native `<dialog>` +
  `showModal()` — top-layer rendering, native Esc/close state as the single
  source of truth, backdrop clicks close, `close` event syncs
  `aria-expanded`, and the toggle handler is fully error-contained so the
  surface can never break the page.

Re-verified in headless Chromium under `colorScheme: dark`: dialog computed
background `rgb(30,30,30)`, close button / Escape / backdrop click all close,
repeated open-close cycles work, zero page errors. `pnpm test` 25/25; dist
rebuilt.

## Extension 2 (2026-07-15): workspace stats + poller noise fix

- **Live-reload poller gated on launcher presence.** `pnpm dev` logged a
  `/__lite/version` request every second; only launchers bump the change
  stamps, so a manual run could never observe a change. `Layout.astro` now
  emits the poller only when `MICROWEBSTACKS_LAUNCHER` is set; the dialog's
  new "Live reload" row states which case is active. Spec rule added:
  recurring client work ships only where its trigger can occur ("a silent
  no-op, not a busy one"). Verified: 0 polls and no inline poller script
  without a launcher; script present with `MICROWEBSTACKS_LAUNCHER` set.
- **`/__lite/stats` endpoint + dialog sections.** `statsPayload()` stays
  inside the lazy contract (walk metadata + shallow listing of the two flat
  cache dirs; no content reads, no recursive scans): Workspace (files,
  folders, bytes, markdown documents, top extensions, newest change, walk
  duration) and Lazy cache & process (parsed pages "N of M (parsed on
  demand)" — the lazy design made visible — blob cache, rss/heap).
- Verification: 26/26 tests (new stats test); dark-theme Chromium smoke shows
  all sections and close paths; a "0 folders / 3 pages" reading that looked
  like a walker bug was confirmed correct — the maintainer had deleted
  `demo/one` minutes earlier; the surface reported the truth. Dist rebuilt.

## Extension 3 (2026-07-15): diagram routing, last-page-load, walk trend

Follow-up to the "other ideas worth considering" list from the first drop —
implemented under the constraint that nothing may add processing beyond what
the lazy pipeline already computes for itself:

- **This page → Diagrams.** `runtime_info.js`'s `diagramsOnPage()` reads
  `.diagram-shell[data-language]` from the already-rendered DOM (zero
  server round-trip) and cross-references it against `runtime.diagram.languages`
  (static config: which languages render client-side vs route to Kroki,
  exposed on `/__lite/runtime` since it never changes per request) to show,
  e.g., `plantuml ×8 (client)` — plus the configured Kroki server only when a
  diagram on the page actually uses it. Verified live on the PlantUML demo
  page (the one from the cache-collision incident): `plantuml ×8 (client)`.
- **Last page load.** `structure-db-lazy.js` now records `lastPageLoad`
  (`{path, url, hit: 'memory'|'disk'|'parsed', ms, at}`) at each of
  `loadOrParseDocument`'s three existing return points — nothing new is
  computed, `parse_ms` already existed on every record. Exposed via new
  `getLastPageLoad()`/`getWalkHistory()` exports, threaded through the
  `structure-db.js` dispatcher (`undefined` on the full/sqlite backends,
  guarded with `typeof === 'function'` at every call site) and surfaced in
  `statsPayload()`.
- **Tree walks (session).** `walkWorkspace()` appends
  `{at, ms, documents, entries}` to a capped (20-entry) in-memory array after
  computing `walkMs` it already had; never persisted to disk, resets on
  restart. Dialog shows a one-line summary (count/avg/last), not the full
  list — deliberately shallow per the "lazy character, don't venture into
  detail" guidance from the original ask.
- `test/extension-preview-endpoints.test.js`: new assertions for
  `runtime.diagram.languages`/`krokiServer`, and a test that calls `getEntry`
  twice to prove the second call reports `hit: 'memory'` (read back, not
  reprocessed) while walk history accumulates from earlier tests in the file.

Verified: 27/27 tests; headless Chromium against the live PlantUML demo page
showed `Diagrams: plantuml ×8 (client)`, `Tree walks (session): 1, avg 2 ms,
last 2 ms`, `Last page load: plantuml.md - disk cache, 94 ms`, dark theme,
zero errors. Dist rebuilt.

## Follow-ups

- Extension-side "Preview status" command for globalStorage engine-store
  state (installed/stale engines, failed cleanups) — deliberately out of the
  viewer per the spec boundary.
- The installed extension gains the surface with the next engine+extension
  release (engine build carries the endpoint; extension release carries the
  launcher env).
