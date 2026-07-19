# Page Render Preview — Implementation

## Progress

[######] Done - Phase 0 (concept gate) passed and phases 2-5 (build work)
implemented. Smoke-tested against the built SSR server. Outstanding before ship: the
manual F5 Extension Development Host click-through (Phase 0's caveat) and a
static-build browser smoke pass with a non-root `base`.

## Phases 2-5 — build work

### Post-implementation preview-card refinements (2026-07-19)

- Replaced the accent outline with a theme-aware raised surface, neutral
  one-pixel panel boundary, and deeper elevation shadow. Popup controls and
  the modal shell now use dark surfaces in dark mode and light surfaces in
  light mode instead of the always-light image-lightbox token.
- Added an explicit top toolbar with **Open page** and **Open preview**.
  Direct navigation no longer requires entering the large modal; clicking
  the page image remains a convenient Open preview shortcut.
- Rendered the compact iframe at a larger logical viewport and scaled it to
  55%, producing a page thumbnail rather than a one-to-one crop.
- Removed the warm-cache instant-popup exception. Warm entries still avoid
  iframe loading, but now respect the same one-second hover deferral as cold
  entries to prevent incidental popups. Every sustained hover now shows the
  circular progress indicator, warm or cold.
- Restricted pointer-leave dismissal to pending/loading/mini-popup states and
  re-checks that state when its grace timer fires. Promotion cancels any
  pending dismissal, so the large modal remains until outside click, Escape,
  or close. This fixes a race where hiding the mini popup during promotion
  emitted `pointerout`, closed the modal, and left a stale `?preview=` URL;
  that stale URL could then legitimately trigger direct-modal restoration.

Refinement validation:

- `node --check src/layout/link_preview.js` passed.
- `node scripts/check-plans.js` no longer reports this packet; the repository-
  wide check remains blocked by the unrelated, concurrently present
  `2026-07-19-details-directive-collapse-bug` packet missing from both indexes.
- The full test suite/build could not run in this checkout because installed
  dependencies are incomplete (`glob/index.js` and `esbuild/index.js` are
  missing). These failures occur during module resolution before exercising
  the preview changes.

### What shipped

- **Preview-mode flag (AD-002)**: `src/layout/Layout.astro` gained an early
  `is:inline` head script (same pattern as the existing theme-flash script)
  that reads `location.hash` for `#__preview` (optionally
  `#__preview&<section>`), with a `window.frameElement.dataset.mwsPreview`
  fallback, and sets `data-preview-mode`/`data-preview-section` on `<html>`
  before first paint. Scoped CSS in the same file hides header/side-menus/
  TOC/resize gutters when the flag is set, leaving only `.article-slot`.
- **Overlay markup**: `src/components/linkpreview/LinkPreviewOverlay.astro`
  — the popup card, the modal shell (lightbox tokens, 90vw/90vh per OP-003),
  and an always-in-document "cache shelf" div that warm iframes park in
  (moving an iframe keeps its browsing context alive; fully detaching it
  does not). Rendered once, unconditionally, from `Layout.astro`.
- **Hover engine + modal + caching**: `src/layout/link_preview.js` — a
  single always-loaded script (self-disables via the preview-mode flag,
  which is the whole no-recursion mechanism, AD-005). Implements the AD-003
  intent-delay/spinner/1s-deferred-popup timeline, AD-004 popup->modal
  promotion by re-parenting the same iframe (no reload), the AD-005/OP-004
  click-through end-game (any link click inside the preview navigates
  `window.location`, not the iframe), AD-007/OP-007 warm cache (N=3, LRU),
  AD-008 `?preview=` query-param sync via `pushState`/`popstate`, OP-001's
  absolute-positioned spinner (`a.link-preview-loading::after`), OP-006
  `focusin`/`focusout` parity, and the OP-002/OP-008 section-scroll
  best-effort (`ENABLE_SECTION_SCROLL_PREVIEW` constant — the configurable
  toggle the plan called for; flip to `false` if it ever misbehaves).

### A real bug the smoke test caught

Initial click-through used `iframe.dataset.mwsClickThroughAttached` (a flag
on the element) to avoid double-attaching the listener on the iframe's
`load` event. In practice a freshly-inserted iframe with `src` already set
still fires an initial `load` for its implicit `about:blank` document before
the real navigation lands. The element-scoped flag latched "attached" on
that throwaway document, so the *real* document never got the click-through
listener — link clicks inside the modal fell through to a real iframe-
internal navigation (visible as a 404 inside the frame) instead of
navigating the top window. Fixed by keying attachment on the `Document`
object itself via a `WeakSet` (`clickThroughDocs`), so every distinct
document the iframe ever holds gets exactly one listener. Caught by an
end-to-end Playwright harness (see below), not by static reading — worth
noting for future iframe-lifecycle work in this codebase.

### How it was verified

- `pnpm test` (31 node:test cases) passes unchanged.
- `astro build` (SSR) succeeds; a plain static build
  (`DOCS_OUTPUT=static astro build --config astro.config.static.mjs`) hits a
  pre-existing, unrelated crash (`Cannot read properties of null (reading
  'gallery')` in `AstroMarkdown`) confirmed via `git stash` to reproduce
  identically on `main` without any of this work — not caused by this
  feature, not fixed here.
- A throwaway Playwright script (built server on `127.0.0.1:4321`, no Vite
  HMR client in the loop) drove the real flow end-to-end and all 23 checks
  passed: preview-mode chrome stripping, hover -> spinner -> 1s popup,
  popup -> modal promotion with iframe reuse, modal sizing, click-through
  end-game navigation + modal teardown, Escape dismissal, warm-cache
  instant re-show (subsequently changed by the refinement above), and
  back/forward syncing the modal via `?preview=`.
  Deleted after use per the plan's "throwaway harness" convention — this
  section is the record.

### Not yet done

- The Phase 0 caveat (manual click-through inside a real `F5` Extension
  Development Host) is still open — exit criteria calls for it before
  Phase 4 ships to users, not before starting the build.
- No browser pass yet against a static build with a non-root `base` (GitHub
  Pages style deployment) — the static build itself is blocked by the
  pre-existing unrelated crash above; worth a rebuild once that's fixed
  independently, or a targeted build excluding the offending page.
- `focusin`/`focusout` keyboard parity and the OP-002/OP-008 section-scroll
  best-effort are implemented but were not separately exercised by the
  Playwright pass (only pointer-driven flows were scripted).

## Phase 0 — concept gate result: PASS

Ran the throwaway harness the plan called for: a real browser (Playwright/
Chromium) driving the iframe-in-iframe nesting under the exact conditions
the VS Code webview imposes, plus a plain-browser sanity check on a real
static build. Not a visual check inside the actual Extension Development
Host (out of reach from this session) — instead the webview's precise
constraints were reproduced and driven programmatically, which is the part
that was actually in doubt (CSP, framing, same-origin behavior), so the
result is trustworthy for the go/no-go decision.

### Harness — extension webview scenario

- Started `server/server.js` with the same environment
  `packages/vscode-extension/extension.js` (`createRuntimeEnv`) gives the
  real child process: `DOCS_PROFILE=lite`, `DOCS_BACKEND=json`,
  `MICROWEBSTACKS_EXTENSION_MODE=true`, `MICROWEBSTACKS_HOST=127.0.0.1`,
  serving this repo's real content.
- Built a wrapper HTML document byte-identical to `renderWebviewHtml()`'s
  output (same `Content-Security-Policy` meta tag: `default-src 'none';
  frame-src http://localhost:<port> http://127.0.0.1:<port>; style-src
  'unsafe-inline' <cspSource>`), served it from the same origin (a routed
  path, since Chrome blocks top-level navigation to `data:` URLs — that
  block isn't a real constraint of the VS Code webview host document, which
  never uses `data:`).
- Loaded that wrapper (outer iframe → `/home`, the real previewed page),
  then, from **inside** that previewed page's own document, injected a
  second nested iframe pointing at `/protocols/thread` — exactly what
  `link_preview.js` will do on hover. This is the grandchild frame the CSP's
  `frame-src` does not govern (frame-src applies to the document that
  declares it, not to nested documents further down), matching the
  Explore-agent research done before the harness was written.

### Results (extension-webview scenario)

```
PASS - outer iframe (webview -> preview server) loaded
PASS - outer iframe has real page content
PASS - grandchild iframe (iframe-in-iframe) attached
PASS - grandchild iframe renders real content (body text length=27600)
PASS - grandchild iframe follows theme (data-theme=dark via shared localStorage)
PASS - grandchild iframe is scrollable
PASS - grandchild iframe scrollTop actually moves (0 -> 200)
PASS - grandchild iframe receives input (click navigates)
```

Theme propagation works because nested frames are same-origin: `ThemeToggle.
astro` persists via `localStorage.setItem('theme-pref', ...)`, and
`localStorage` is shared across same-origin frames regardless of nesting
depth — no explicit wiring needed for AD-002's chrome-strip flag to also
inherit the right theme.

### Harness — plain-browser static-build sanity check

- Built a real static site (`runBuildCommand` from `src/libs/render-build.
  js`, i.e. the same `astro build --config astro.config.static.mjs` path CI
  uses) from a two-page fixture workspace, served the output as plain
  static files (no Express, no SSR, no CSP), and ran the identical
  iframe-in-iframe injection in a normal browser tab.

```
PASS - outer page (static build) loaded in plain browser tab
PASS - nested iframe (static build, plain browser) attached
PASS - nested iframe renders real content (body text length=16520)
PASS - nested iframe follows theme (shared localStorage)
PASS - nested iframe is scrollable
PASS - nested iframe scrollTop moves (0 -> 200)
PASS - nested iframe receives input (click navigates)
```

### Decision

**Gate passed in both scenarios tested.** Per the plan's outcome table:
proceed with the design as ruled — AD-001 (same-origin iframe of the real
target URL) stays closed, no reopen, no fetch-and-inject fallback needed.
Phases 2-5 (preview-mode flag, hover engine, modal promotion, caching/
polish) can start.

### Caveat

This harness reproduces the webview's CSP and framing rules faithfully but
runs in a real Chromium tab, not literally inside the VS Code Extension
Development Host. The two known differences between that environment and
what was tested — Electron's embedded Chromium version, and any extra
`portMapping`/resource-scheme rewriting VS Code applies to iframe `src`
loads inside a webview — were not exercised. Nothing in the researched
mechanism (plain `frame-src`, `localhost`-origin `src`) depends on either,
so this is not expected to change the result, but it's the one gap between
"gate passed" and "verified in the literal target environment." Worth a
quick manual click-through in a real `F5` Extension Development Host before
phase 4 ships, not before starting the build.

### Harness disposal

The harness scripts, fixture workspace, and temp servers used for this test
were throwaway (per the plan's "minimal throwaway harness" instruction) and
have been deleted; this file is the record.
