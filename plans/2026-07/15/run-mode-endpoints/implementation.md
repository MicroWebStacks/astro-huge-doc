# Implementation: Run-Mode-Safe Extension-Preview Endpoints

[######] Done - endpoints moved into the app, gates unified, spec published, both run modes verified.

## Changes

- `src/libs/extension-preview.js` (new): `extensionPreviewEnabled()` — the
  single extension-preview gate — plus `navigationPayload(pathname)` and
  `versionPayload()`. Navigation prefers the persisted `filetree.json`
  snapshot and falls back to the live backend (`structure-db.js`), same logic
  the express route had.
- `src/middleware.js`: answers `GET /__lite/version` and
  `GET /__lite/navigation` as `application/json` + `no-store` when the gate
  is on, before the `/blobs/` handling. This makes the endpoints exist in
  every mode that renders pages, including `astro dev`.
- `server/server.js`: removed the express-only `/__lite/*` registrations
  (requests now reach the same handlers through `ssrHandler` → middleware);
  added a fail-fast `EADDRINUSE` handler naming the port and the knobs
  instead of the previous unhandled `error` event crash.
- `src/layout/Layout.astro`: `liveReload` now calls the shared gate instead
  of reading the env var directly.
- `src/layout/lazy_navigation.js`: rejects non-JSON responses with an error
  naming the run-mode mismatch (a 200 HTML answer means the request fell
  through to a page route).
- `src/pages/[...url].astro`: sets `Astro.response.status = 404` when the
  document is not found (was 200 with a not-found page).
- `config.js` + `manifest.yaml`: `/__lite/` added to `html_cache`
  exclusion defaults.
- `.env.example`: `MICROWEBSTACKS_EXTENSION_MODE` comment now describes the
  full surface it enables and that it works under `pnpm dev` too.
- `specification/run-modes/spec.md` (new): run-mode inventory, the three
  invariants (app-owned endpoints, single gate, honest statuses), env
  precedence rules, and the port strategy. Cross-referenced from
  `specification/engine-profiles/spec.md`.
- `test/extension-preview-endpoints.test.js` (new): gate re-evaluation per
  call, snapshot-preferred navigation, live-backend fallback, stamp mtimes.

## Decisions

- Middleware over `src/pages/` API routes: `/blobs/` already established the
  middleware pattern for root-scoped non-page URLs, and middleware keeps the
  endpoints out of the static build's route enumeration.
- The gate deliberately dropped the express route's extra
  `dataBackend === 'json'` condition: the UI side never checked it, and the
  navigation payload works on every backend via `getSourceEntries()`.
- The express wrapper keeps fail-fast port semantics (no auto-increment);
  `astro dev`'s auto-increment is accepted and documented, made safe by
  client port-blindness (origin-relative fetches only).

## Verification

- `pnpm test`: 24/24 pass, including the 4 new endpoint tests.
- `astro dev --port 4555` (workspace `.env`: lite + extension mode): home
  200; `/__lite/navigation?pathname=/` → JSON items (math/plantuml/readme),
  `application/json`; `/__lite/version` → `{"reload":0,"tree":0}`; unknown
  URL → 404.
- `pnpm build` then `server/server.js` on 4666 with the extension's env
  shape: identical JSON payloads; page HTML still carries the lazy skeleton.
- Second server on the same port: exits 1 with the new actionable message.

## Follow-ups / risks

- The installed VS Code extension serves the fix only after the next engine
  release is staged/bundled (0.0.11 packaging was found half-activated in
  globalStorage: empty `.mws-engine-activation-bundled-engine-0.0.11-*` temp
  dir + stale lock, while 0.0.15/0.0.17 extensions still run engine 0.0.8).
- `demo/one/readme.md` in the maintainer's working tree is a 0-byte file;
  harmless (renders empty), noted here because it was the suspected trigger
  during diagnosis and is not the cause.
