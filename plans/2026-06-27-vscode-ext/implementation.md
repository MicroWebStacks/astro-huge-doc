# Implementation

## Progress

[######] Done - implemented and validated; follow-ups noted below.

## Changes

Implemented the first VS Code desktop extension pass in
`packages/vscode-extension`:

* Added extension manifest, commands, settings, and activation wiring.
* Added commands for VS Code preview, browser preview, restart, and stop.
* Added workspace detection, dynamic localhost port selection, server process
  management, and Markdown/asset file watching.
* Stored generated preview DB/cache/blob data under
  `ExtensionContext.storageUri`, keyed per workspace folder.
* Added a webview panel that displays the localhost preview through VS Code
  webview port mapping.

Updated the existing runtime so standalone and extension modes can coexist:

* `config.js` now preserves `process.cwd()`/`manifest.yaml` defaults for normal
  repo usage.
* `config.js` also accepts explicit `MICROWEBSTACKS_*` runtime paths for the
  extension flow.
* `server/server.js` now uses the shared resolved config for output directory,
  host, port, protocol, and cache DB path.
* `server/cache/htmlCache.js` now accepts an explicit DB path and exclude list.
* `pnpm-workspace.yaml` now includes `packages/*`.

Updated `readme.md` with local extension testing, VSIX installation, settings,
and usage notes.

## Decisions

Generated preview databases and caches are private extension runtime state by
default. They are stored in VS Code workspace-scoped extension storage instead
of the user's docs workspace or the extension install directory.

For V1, a locally installed VSIX still uses this repository checkout as the
rendering engine. Users can set `microwebstacks.preview.enginePath` if the
extension cannot infer the engine path.

If a workspace has `manifest.yaml`, the extension lets the engine honor that
manifest, including `output.content`. If no manifest exists, the workspace
folder itself is treated as the docs root unless
`microwebstacks.preview.docsRoot` is configured.

## Follow-Up Risks

* Native dependency packaging remains a later milestone; this pass is suitable
  for local development and local VSIX testing with an engine checkout.
* File-change refresh currently recollects and restarts the preview server. This
  is simple and reliable, but may be optimized later with finer cache/DB
  invalidation.
* Multi-root support is intentionally basic. The storage layout is ready for
  per-folder state, but selection UX can be improved later.

## Troubleshooting Update

After first manual testing showed a black VS Code webview/stale localhost URL,
the extension preview flow was hardened:

* The extension now waits for the local server to respond before opening the
  webview.
* The external browser URL remains `http://127.0.0.1:<port>/`.
* The webview iframe now uses `http://localhost:<port>/`, which matches VS Code
  webview port mapping expectations better.
* The webview wrapper now includes an explicit Content Security Policy allowing
  the mapped localhost frame.

## Debuggability Update

Manual testing in VS Code showed the preview server could exit before becoming
reachable while the user-facing Output panel was not on the extension output
channel. The extension now:

* Spawns `node.exe`/`node` from PATH instead of `process.execPath`, because
  `process.execPath` can point at the VS Code/Electron executable inside the
  extension host.
* Logs workspace root, docs root, engine root, storage root, DB path, SSR
  output directory, manifest path, and Node executable before running collect or
  server scripts.
* Automatically shows the `MicroWebStacks Docs` output channel when command
  execution fails.

## Manual Preview Update

Manual Extension Development Host testing reached a working rendered preview in
another workspace. Two renderer/runtime fixes supported that:

* Root/catch-all route handling now normalizes an undefined catch-all URL to the
  empty route.
* When a workspace has no explicit home document, the renderer falls back to the
  first collected document instead of showing `'undefined' Page not found`.

During debugging, the linked `content-structure` dev dependency also exposed a
`glob@13` package-main compatibility issue under Node 22. The app-level pnpm
override now pins `glob` to `11.1.0`; a fresh `pnpm install` is required for the
lockfile and installed dependency tree to reflect that override.

## Readonly DB Regression Fix

Manual VS Code extension testing against another workspace showed collection
could fail with `SQLITE_READONLY` when writing the `versions` table under VS
Code `workspaceStorage`.

Root cause:

* `config.js` resolved the latest collected version by calling
  `content-structure`'s cached `openDatabase(dbPath, {readonly: true})`.
* `content-structure` caches SQLite handles globally by file path.
* The collector then reused that cached read-only handle for the same DB path
  when it needed a writable connection.

Fix:

* `config.js` now resolves the latest version with a direct short-lived
  `better-sqlite3` read-only connection.
* The connection is closed immediately after the lookup and never enters the
  shared `content-structure` connection cache.
* Missing DB files now resolve to `null` without warning, which is expected for
  first-run extension storage.

## Diagram Generation Fix

Manual VS Code extension testing in another workspace showed diagram code
blocks rendered the `code/diagram` toggle but displayed a blank white diagram
panel.

Root cause:

* The extension startup path only ran `scripts/collect.js`.
* Diagram SVGs are generated by the separate `scripts/diagrams.js` step, which
  reads diagram-capable assets from the collected SQLite DB, renders them
  through Kroki, and writes `<asset_uid>.svg` assets back into the DB.
* Without that generated SVG row, the renderer built an asset URL from a null
  blob id.

Fix:

* The extension now runs `scripts/diagrams.js` immediately after
  `scripts/collect.js` and before starting the preview server.
* `DiagramCode.astro` now checks whether the generated SVG blob exists. If it
  does not, it renders the source code view directly instead of showing an
  empty diagram panel.
