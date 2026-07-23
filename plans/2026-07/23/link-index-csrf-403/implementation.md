# Link Index CSRF 403 — Implementation

## Progress

[######] Implemented + verified.

## Change

- `src/layout/lite_relation_indexer.js` — `control()`'s POST to
  `/__lite/index-control` now sends `Content-Type: application/json`. No
  server or config change; `security.checkOrigin` stays enabled app-wide.

## Why this works

Astro's built-in origin-check middleware
(`node_modules/astro/dist/core/app/middlewares.js`) only enforces the
`Origin === url.origin` comparison for form-like content types
(`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`)
or no `Content-Type` at all. `application/json` isn't in that list, so
`hasFormLikeHeader` returns `false` and the middleware calls `next()`
without consulting `Origin` — exactly the exemption the check is built
around, since JSON can't be sent cross-site without a CORS preflight. This
sidesteps the actual failure mode: the VS Code webview's `portMapping`
layer mangles/drops the `Origin` header on the POST, so the previous
strict-equality check 403'd every time.

## Verification

Built and ran the production SSR server (`npm run build` + `node
server/server.js` — the same Express wrapper the extension runs) and
curled the endpoint directly:

```
POST /__lite/index-control?action=start, no headers          -> 403
POST ... -H "Origin: http://evil.example.com"                 -> 403
POST ... -H "Content-Type: application/json"                  -> 200
```

All four actions (`start`, `pause`, `resume`, `stop`) return 200 with the
header present. This confirms the origin check is genuinely active in the
built server and that the JSON content-type routes around it as designed.

Note: `astro dev` was not usable for this repro — Astro 5.18.2 has a
dev-mode timing quirk where `pipeline.resolvedMiddleware` gets cached on
the first request before the file-watcher's `rebuildManifest` call
confirms `manifest.checkOrigin`, so the check can end up permanently
skipped for that dev-server process. Irrelevant to production, where
`checkOrigin` is computed once, statically, at build time
(`build/generate.js`).

Not independently re-verified inside the actual VS Code webview (no running
extension host in this session) — the curl repro against the same server
binary the extension launches is taken as sufficient proof, since the
extension's only difference is the `Origin` header arriving mangled, which
this fix stops depending on entirely.
