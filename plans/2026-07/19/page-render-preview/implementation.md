# Page Render Preview — Implementation

## Progress

[#-----] Phase 0 (concept gate) done and **passed** — build work (phases 2-5)
not started.

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
