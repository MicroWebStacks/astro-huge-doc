# Implementation

## Progress

[######] Steps 9-11 done - static blobs, lite engine staging, extension package/install, and DuckDB confirmation complete.

## 2026-07-02 — Marketplace-blocker fix (dispatcher bypass) + extension hardening

Root cause of the broken marketplace install, found by smoke-testing the registry-installed
engine (`--omit=optional`, no repo tree above it): `src/layout/layout_utils.js` statically imported
`content-structure/src/sqlite_utils/index.js` (top-level `import 'better-sqlite3'`) and queried
SQLite directly — the one consumer that bypassed the structure-db dispatcher. Every SSR page
500'd with ERR_MODULE_NOT_FOUND in the lite engine. Local tests never caught it because
better-sqlite3 always resolves inside the repo tree.

- Added `getDocuments(versionId)` / `getSourceEntries(versionId)` to both structure-db backends
  (json: documents from `content.json`, source entries `[]` → layout falls back to the
  docs-derived menu) and re-exported them through the dispatcher.
- `layout_utils.js` now imports only from `@/libs/structure-db.js`; no direct DB access remains
  outside the sqlite backend.
- extension.js: installed engine is now reused only when its version matches `engineVersion`
  (`isUsableInstalledEngine`); previously an old engine was kept forever.
- extension.js: win32 spawns quote paths with spaces (`spawnLogged`), npm/node spawn errors say
  Node.js 18+/npm on PATH is required, first-run install/collect/server-start shows a progress
  notification, `waitForServer` timeout 10s → 30s.
- Extension `package.json`: version 0.0.5, `engineVersion` 0.0.2, accurate `engineSource`
  descriptions (local discovery for an installed extension requires `enginePath`).
- Extension README: Requirements section (Node 18+/npm; Kroki optional).
- Stale fixes: root `manifest.yaml` html_cache exclude `/assets/` → `/blobs/`;
  structure-db-json missing-dataset error now suggests the json collect, not only export-json.
- Publish chain note: `content-structure` shipped as **2.2.4** (not the planned 2.3.0);
  `@microwebstacks/md-render@0.0.1` is live; the local-path-dependency blocker below is resolved.

## Changes

- Added `src/libs/blob-files.js` with the shared `<hash>.<ext>` filename and `/blobs/...` URL formula.
- Added `getAssetUrl(assetUid, versionId)` to both structure-db backends and re-exported it through the dispatcher.
- Updated the JSON backend to read content-addressed blob files, with a compatibility fallback for older blob-UID exports.
- Added production `/blobs` static serving in `server/server.js`.
- Added Astro dev middleware in `src/middleware.js` for `/blobs/*` GET/HEAD responses with immutable cache headers and ETags.
- Switched Markdown images, diagrams, gallery, links, cards, table asset loading, and model-viewer assets from hand-built `/assets/...` URLs to `getAssetUrl`.
- Changed the highlighter copy action to copy from rendered DOM text instead of fetching `/assets/<uid>`.
- Updated `scripts/export-json.js` to emit `blob_store` metadata and content-addressed blob files.
- Replaced the SQLite-only `scripts/diagrams.js` with a format-aware version:
  - SQLite mode still updates SQLite rows and now writes `<hash>.svg` files.
  - JSON mode reads `content.json`, renders diagrams through Kroki, appends diagram asset rows, writes `<hash>.svg`, and rewrites `content.json`.
- Removed the legacy dynamic route `src/pages/assets/[...uid].js`.
- Updated default HTML-cache bypasses from `/assets/` to `/blobs/`.
- Replaced the production `express.static` blob mount with an explicit local file handler because the smoke test returned `200` rather than `304` for conditional requests through the stock mount.
- Updated `scripts/stage-engine.js` for the lite engine:
  - Added `src/libs` to staged runtime files because `config.js`, `server/server.js`, and scripts import those helpers.
  - Excluded native/heavy/full-only dependencies: `better-sqlite3`, `sharp`, `three`, `@google/model-viewer`, `xlsx`, `@octokit/rest`, `adm-zip`, `passport`, `passport-github`, and `express-session`.
- Updated `packages/vscode-extension/extension.js` so the extension runtime sets `DOCS_PROFILE=lite` and `DOCS_BACKEND=json`.
- Rebuilt the engine with `DOCS_PROFILE=lite`, staged `packages/md-render`, packaged the VS Code extension with `npm exec @vscode/vsce`, and installed it with `code.cmd --install-extension --force`.
- Confirmed DuckDB/dataset SQL did not reappear in package or runtime surfaces.
- Updated `readme.md` with `.env`-based Kroki configuration for local Docker, public `https://kroki.io`, and custom/internal Kroki URLs, including the commands to run for each mode.
- Shortened visible blob filenames from full SHA-512 strings to 12-character hash prefixes while keeping the full hash in `blob_store` metadata.
- Added `scripts/clean-diagrams.js` and the `pnpm clean:diagrams` command to remove generated diagram asset rows, unreferenced diagram blobs, static SVG files, and SQLite html-cache entries.
- Updated the sibling `content-structure/src/blob_files.js` helper to use the same 12-character blob filename formula as this engine, so collect output and runtime URL resolution stay aligned.
- Updated `readme.md` with diagram-cache cleanup commands for local Docker, public/custom Kroki, and lite/JSON test flows.

## Notes

- After Docker Desktop was started, fresh JSON collect plus local Kroki diagram rendering succeeded against `http://localhost:18000`.
- The public Kroki endpoint was verified with a synthetic Mermaid diagram. Running repository diagram sources against `https://kroki.io` was rejected by the approval layer as workspace-data disclosure, so no workspace diagram content was sent to the public service.
- `pnpm clean:diagrams` was verified on the JSON/lite path by rendering 6 diagrams, cleaning them to 0 rows/files, then rerendering 6 diagrams through local Docker Kroki with 12-character SVG filenames.
- A SQLite/full clean-plus-rerender proof was attempted but the approval layer rejected the escalated local-Kroki command because the session hit its usage limit. The SQLite cleanup code parses, and the JSON/lite behavior is verified live.
- `packages/md-render/package.json` still carries `content-structure: ../content-structure`; this remains the known blocker before publishing the engine package.
- `handoff.md` was deleted because it was a stale resume snapshot; the current status now lives in `plan.md`, `implementation.md`, and `test.md`.
