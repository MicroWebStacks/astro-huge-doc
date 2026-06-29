# Implementation

## Progress

[######] Steps 9-11 done - static blobs, lite engine staging, extension package/install, and DuckDB confirmation complete.

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

## Notes

- The top-level `handoff.md` note saying content-structure has uncommitted WIP appears stale in this checkout; `../content-structure` is clean and already contains the Step 9a blob materialization code.
- After Docker Desktop was started, fresh JSON collect plus local Kroki diagram rendering succeeded against `http://localhost:18000`.
- The public Kroki endpoint was verified with a synthetic Mermaid diagram. Running repository diagram sources against `https://kroki.io` was rejected by the approval layer as workspace-data disclosure, so no workspace diagram content was sent to the public service.
- `packages/md-render/package.json` still carries `content-structure: ../content-structure`; this remains the known blocker before publishing the engine package.
