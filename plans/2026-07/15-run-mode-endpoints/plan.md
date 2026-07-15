# Plan: Run-Mode-Safe Extension-Preview Endpoints

## Problem

The demo under `pnpm dev` showed "Pages could not be loaded." in the side
menu (reported 2026-07-14). Root cause chain:

- `Layout.astro` emits the lazy-navigation client whenever
  `MICROWEBSTACKS_EXTENSION_MODE=true` (set by the workspace `.env` following
  `.env.example` guidance), but `/__lite/navigation` and `/__lite/version`
  were registered only in the express wrapper (`server/server.js`);
- `astro dev` has no express wrapper, so the fetch fell through to the
  SSR catch-all, which answered the not-found page as `200 text/html`;
- `response.ok` therefore passed and `response.json()` threw a generic parse
  error, surfacing as the menu error message;
- the failure was hard to attribute because `astro dev` had silently
  auto-incremented from the configured port 4321 to 4323, hiding which kind
  of server owned the tab.

## Scope

1. Move the `/__lite/*` endpoints into the Astro app (`src/middleware.js`,
   payloads in a new `src/libs/extension-preview.js`) so every mode that
   renders pages also answers them; delete the express-only registrations.
2. Single shared gate `extensionPreviewEnabled()` consumed by both
   `Layout.astro` (UI emission) and the middleware (endpoint answers); drop
   the server-only extra `dataBackend === 'json'` condition.
3. Honest responses: the SSR catch-all sets status 404 for unknown URLs; the
   lazy-menu client verifies the response content type before parsing.
4. Port behavior: the express wrapper fails fast on `EADDRINUSE` with an
   actionable message instead of crashing with an unhandled `error` event.
5. Exclude `/__lite/` from the HTML cache; refresh `.env.example` guidance.
6. Capture the durable contract in `specification/run-modes/spec.md`
   (run-mode inventory, endpoint ownership, gate rules, env precedence, port
   strategy) so the bug class — not just this instance — is closed.

## Exit criteria

- `pnpm dev` with `MICROWEBSTACKS_EXTENSION_MODE=true` serves
  `/__lite/navigation` and `/__lite/version` as JSON and the side menu loads.
- `pnpm server` (built dist) serves the same payloads from the same code.
- Unknown URLs answer 404 in SSR modes.
- Unit tests cover the gate and both payload builders; `pnpm test` passes.
- Spec published and cross-referenced from `specification/engine-profiles/`.

## Risks

- The bundled extension engine only picks the fix up with the next staged
  engine release (0.0.11+ packaging); until then installed previews run the
  old express-owned endpoints, which keep working there.
- Middleware now answers `/__lite/*` before the HTML cache in full/sqlite
  runs with extension mode on — mitigated by the cache exclusion entry.
