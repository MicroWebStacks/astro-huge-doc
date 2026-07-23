# Link index bar shows "Link index unavailable: index start returned 403"

## Status

**Closed 2026-07-23.** Fixed and verified. See
[implementation.md](implementation.md) for the change record. The one-line
header change below has
been applied to `src/layout/lite_relation_indexer.js`. Verified against a
built production SSR server (`npm run build` + `node server/server.js`,
the same `server/server.js` Express wrapper the extension runs):

```
POST /__lite/index-control?action=start, no headers          -> 403
POST ... -H "Origin: http://evil.example.com"                 -> 403
POST ... -H "Content-Type: application/json"                  -> 200
```

All four actions (`start`, `pause`, `resume`, `stop`) return 200 with the
header. This confirms the exemption mechanism exactly as analyzed: the
origin check is active and blocking in the built server, and the
`Content-Type: application/json` header alone (no `Origin` needed) routes
around it via `hasFormLikeHeader → false → next()`.

Note: a plain `astro dev` session was *not* usable for this repro — Astro
5.18.2 has a dev-mode timing quirk where `pipeline.resolvedMiddleware` gets
cached on first request before the file-watcher's `rebuildManifest` call
confirms `manifest.checkOrigin`, so the check can end up permanently
skipped for that dev-server process. This doesn't affect production/SSR
builds, where `checkOrigin` is computed once and statically at build time
(`build/generate.js`) — the code path the extension actually runs.

Rewritten 2026-07-23 after review: the original analysis correctly
identified Astro's origin-check middleware as the source of the 403, but
misattributed *why* the check fails, and the recommended fixes (disable
`checkOrigin` / convert to GET) are not the cleanest option. The middleware
has a designed exemption that solves this with a one-line client change.

## Problem (user-visible)

On page load, the link-index status bar (bottom of the doc view) briefly
shows progress UI, then flips to:

```
Link index unavailable: index start returned 403
```

Seen in the VS Code extension's preview webview. Everything else on the
page (Mermaid, navigation, the other `/__lite/*` data) works.

## Root cause

The 403 comes from **Astro's built-in CSRF origin-check middleware**
(`node_modules/astro/dist/core/app/middlewares.js`, Astro 5.18.2), which
runs before `src/middleware.js`, so the app's
[`/__lite/index-control` handler](../../../../src/middleware.js#L67-L76)
never sees the request.

The client call in
[lite_relation_indexer.js:17](../../../../src/layout/lite_relation_indexer.js#L17)
is:

```js
fetch(`/__lite/index-control?action=${action}`, {method: 'POST', cache: 'no-store'})
```

— a POST with **no body and no `Content-Type` header**. Astro's check
(verbatim from the vendored source):

```js
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
if (SAFE_METHODS.includes(request.method)) return next();
const isSameOrigin = request.headers.get("origin") === url.origin;
const hasContentType = request.headers.has("content-type");
if (hasContentType) {
  const formLikeHeader = hasFormLikeHeader(request.headers.get("content-type"));
  if (formLikeHeader && !isSameOrigin) return 403;
} else {
  if (!isSameOrigin) return 403;   // <-- our request lands here
}
```

Two conditions combine:

1. **No `Content-Type` header** puts the request in the strict `else`
   branch, where the `Origin` request header must *exactly* equal the
   server-computed `url.origin` — a missing/`null` Origin is an automatic
   403.
2. **The `Origin` header does not arrive matching** in the webview
   context. The extension loads the preview as a plain iframe pointing at
   `http://localhost:<port>`
   ([extension.js:1746](../../../../packages/vscode-extension/extension.js#L1746))
   with `portMapping` routing it to the server on `127.0.0.1:<port>`
   ([extension.js:1610](../../../../packages/vscode-extension/extension.js#L1610)).
   VS Code implements `portMapping` by intercepting webview network
   requests and rewriting them at the network layer; requests that go
   through that interception can lose or null their `Origin` header, and
   the `localhost` ↔ `127.0.0.1` rewrite means even a preserved Origin can
   differ textually from the `Host` the server uses to compute
   `url.origin`. Either way the strict equality fails.

### Why the "genuinely different webview origin" theory was wrong

The original analysis proposed the webview document has a
`vscode-webview://…` origin. That is inconsistent with the observed
behavior: the same document successfully **reads** the `/__lite/*` GET
endpoints (the bar polls `index-status`, navigation data loads). If the
document were genuinely cross-origin to the server, those responses carry
no CORS headers and the browser would block reading them — every `/__lite`
fetch would fail, not just the POST. The document *is* same-origin
(`http://localhost:<port>` iframe); only the `Origin` request header on
the POST is mangled/dropped in transit. That is also why only this
endpoint breaks: `index-control` is the app's **only in-app POST** (the
other POST in `src/`, [diagram-render.js:27](../../../../src/libs/diagram-render.js#L27),
targets an external Kroki server and never touches this middleware).

### Reproducible without the webview

Any client that omits `Origin` hits the same wall — this confirms the
mechanism against a running preview server:

```
curl -i -X POST "http://127.0.0.1:<port>/__lite/index-control?action=start"
# → 403 "Cross-site POST form submissions are forbidden"

curl -i -X POST -H "Content-Type: application/json" \
  "http://127.0.0.1:<port>/__lite/index-control?action=start"
# → 200 (after no code change at all — the exemption already exists)
```

### Scope correction: which run modes are affected

The original plan said the check applies "in every run mode". More
precisely (verified in `astro/dist/vite-plugin-astro-server/plugin.js:108`
and `core/base-pipeline.js:51`):

- **SSR builds** (`astro.config.mjs` → `server/server.js` Express wrapper
  → `dist/server/entry.mjs`) — check active. This is what the extension
  runs, and where the bug bites.
- **`astro dev`** — check active only because `buildOutput === "server"`
  with the SSR config; same behavior as production, good.
- **Static builds** (`astro.config.static.mjs`) — prerendered responses
  skip the check (`isPrerendered` early-return), and the `/__lite`
  endpoints don't exist there anyway.

No config sets `security.checkOrigin`, so the default (`true`) applies —
and should stay that way (see below).

## Fix

**One line in `control()`
([lite_relation_indexer.js:17](../../../../src/layout/lite_relation_indexer.js#L17)):
declare a non-form `Content-Type` on the POST.**

```js
const response = await fetch(`/__lite/index-control?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {'content-type': 'application/json'}
});
```

This is not a workaround — it is the exemption Astro's CSRF check is
built around. CSRF forgery only works through HTML form submissions,
which can only produce `application/x-www-form-urlencoded`,
`multipart/form-data`, or `text/plain`. Any other content type cannot be
sent cross-site without a CORS preflight, so it is CSRF-safe by
construction, and Astro's middleware passes it through **without
consulting `Origin` at all** (`hasFormLikeHeader → false → next()`).
Declaring the request as JSON is the standard way for a programmatic API
call to distinguish itself from a form post.

Properties:

- One client-side line; no server change, no config change.
- `security.checkOrigin` stays enabled app-wide — no CSRF regression.
- Works identically in dev, preview, the Express wrapper, and the
  extension webview; immune to any proxy/interceptor mangling `Origin`
  or `Host`, because the origin comparison is skipped entirely.
- Semantically honest: the endpoint already responds with JSON; the
  request now declares itself part of a JSON API. (No body is needed —
  the header alone selects the branch; the action stays in the query
  string as today.)

## Rejected alternatives (from the original plan)

- **`security: { checkOrigin: false }`** — disables CSRF protection for
  every non-GET route app-wide to fix one endpoint. Strictly worse than
  the one-line header.
- **Convert `index-control` to GET** — sidesteps the check but gives a
  state-changing endpoint GET semantics; prefetchers, link crawlers, or
  future caching layers could then trigger index runs as a side effect.
- **App-level origin validation in `src/middleware.js`** — unreachable:
  Astro's check runs first and would still 403 before the app code runs
  (it would require disabling `checkOrigin` too, i.e. option 1 plus extra
  code).
- **Change how the webview loads the page** — nothing to change; the
  webview already navigates the server's own URL directly via iframe.
  The Origin mangling happens in VS Code's port-mapping layer, outside
  this codebase's control.

## Verification plan

1. `curl` repro above against a running preview server: 403 without the
   header, 200 with it (can be done before touching code — proves the
   mechanism).
2. Apply the one-line change, rebuild the extension engine, open the
   preview webview: the index bar must progress to
   `Link index complete · N/N pages` instead of the 403 error.
3. Regression check in a plain browser tab against `astro dev` and
   `server/server.js`: bar still works (same-origin path was never
   broken, must stay that way).
4. Confirm pause/resume/stop buttons (same `control()` path) work in the
   webview.

## Files referenced

- `src/layout/lite_relation_indexer.js` — the only file that changes.
- `src/middleware.js` — app-level `/__lite/*` handling (unchanged;
  unreachable for the failing POST until the fix lands).
- `packages/vscode-extension/extension.js` — iframe + portMapping preview
  surface where the Origin header gets mangled (unchanged).
- `astro.config.shared.mjs` / `astro.config.mjs` /
  `astro.config.static.mjs` — unchanged; `checkOrigin` default stays on.
- `node_modules/astro/dist/core/app/middlewares.js` — Astro 5.18.2
  origin-check middleware (vendored, read-only).
