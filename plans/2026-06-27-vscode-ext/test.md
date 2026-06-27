# Validation

## 2026-06-27 - Planning Review

Checked the plan against the current repository behavior and VS Code extension
storage expectations.

Expected:

* The standalone repository keeps working with its current `manifest.yaml` and
  `process.cwd()` defaults.
* The VS Code extension plan explicitly avoids writing generated DB/cache files
  to the extension install directory.
* The VS Code extension plan uses workspace-scoped extension storage for private
  generated preview data.

Actual:

* `plan.md` now records `ExtensionContext.storageUri` as the default location
  for generated preview databases and caches.
* `plan.md` now requires explicit runtime paths for workspace root, manifest,
  DB, store, host, and port so the extension flow can coexist with the current
  standalone repo flow.

Commands run:

```txt
git status --short
Get-ChildItem -LiteralPath plans\2026-06-27-vscode-ext
Get-Content -Raw -LiteralPath plans\2026-06-27-vscode-ext\plan.md
```

Known gaps:

* No runtime implementation exists yet.
* No VS Code extension packaging or launch validation has been run yet.

## 2026-06-27 - Implementation Validation

Expected:

* Extension JavaScript parses successfully.
* The Astro SSR build succeeds after runtime config changes.
* Extension-style environment variables resolve engine root, workspace root,
  generated DB path, generated store path, output directory, host, and dynamic
  port separately.
* README usage instructions cover local development-host testing and local VSIX
  installation.

Actual:

* `node --check packages\vscode-extension\extension.js` passed.
* `pnpm build` could not run because `pnpm` is not available on this shell's
  PATH.
* Equivalent local Astro build passed with telemetry disabled:
  `$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build`.
* Runtime config import with `MICROWEBSTACKS_*` overrides resolved:
  `rootdir` to the engine checkout, `workspaceRoot` and `content_path` to the
  docs workspace, `db_path` to extension storage, `outdir` to extension storage,
  `outDir` to the engine `dist`, and `host`/`port` to `127.0.0.1:49152`.
* Config import logged an expected warning for the synthetic validation DB path
  because the temporary DB directory did not exist.

Commands run:

```txt
node --check packages\vscode-extension\extension.js
node -e "import('./config.js').then(()=>console.log('config import ok'))"
pnpm build
$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build
$env:MICROWEBSTACKS_ENGINE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_WORKSPACE_ROOT='C:\tmp\docs-workspace'; $env:MICROWEBSTACKS_DOCS_ROOT='C:\tmp\docs-workspace'; $env:MICROWEBSTACKS_DB_PATH='C:\tmp\vscode-storage\content.db'; $env:MICROWEBSTACKS_STORE_PATH='C:\tmp\vscode-storage\store'; $env:MICROWEBSTACKS_OUTDIR='C:\dev\MicroWebStacks\astro-huge-doc\dist'; $env:MICROWEBSTACKS_HOST='127.0.0.1'; $env:MICROWEBSTACKS_PORT='49152'; node -e "import('./config.js').then(({config})=>console.log(JSON.stringify({rootdir:config.rootdir,workspaceRoot:config.workspaceRoot,content_path:config.content_path,outDir:config.outDir,db_path:config.collect.db_path,outdir:config.collect.outdir,host:config.server.host,port:config.server.port}, null, 2)))"
rg -n "storageUri|enginePath|extensionDevelopmentPath|Preview Docs|Open Docs|Restart Docs|Stop Docs|MICROWEBSTACKS" readme.md plans\2026-06-27-vscode-ext packages\vscode-extension config.js server
```

Known gaps:

* The extension was not launched in a VS Code Extension Development Host from
  this automated shell.
* A local VSIX was not packaged because `vsce` is not installed in this
  workspace.

## 2026-06-27 - Webview Startup Patch

Expected:

* The extension should not open a preview panel until the local server is
  reachable.
* The VS Code webview should use localhost port mapping and allow the iframe in
  its wrapper Content Security Policy.

Actual:

* Added server reachability polling before creating the preview state.
* Changed the webview iframe URL to `http://localhost:<port>/` while keeping
  browser fallback on `http://127.0.0.1:<port>/`.
* Added a webview wrapper CSP with `frame-src` for both localhost forms.
* `node --check packages\vscode-extension\extension.js` passed.

Commands run:

```txt
Invoke-WebRequest -Uri http://127.0.0.1:59391/ -UseBasicParsing -TimeoutSec 5
node --check packages\vscode-extension\extension.js
rg -n "waitForServer|browserUrl|webviewUrl|Content-Security-Policy|localhost" packages\vscode-extension\extension.js
```

## 2026-06-27 - Subprocess Debug Patch

Expected:

* Extension subprocesses should use a real Node executable in VS Code, not the
  VS Code/Electron executable.
* Failures should automatically reveal the extension output channel and include
  enough runtime-path context to debug the server crash.

Actual:

* Added Node executable resolution for collect and server subprocesses.
* Added runtime path logging before collect/server startup.
* Added automatic output-channel reveal on command errors.
* `node --check packages\vscode-extension\extension.js` passed.

Commands run:

```txt
node --check packages\vscode-extension\extension.js
rg -n "findNodeExecutable|Node executable|showOutput|Workspace root|shell:" packages\vscode-extension\extension.js
```

## 2026-06-27 - Manual Preview Progress

Expected:

* A workspace without a home document should still show a useful first page.
* The catch-all route should not display `'undefined' Page not found` for the
  root preview URL.
* The VS Code webview should render actual workspace content.

Actual:

* Added `getFirstDocument()` fallback in `src/libs/structure-db.js`.
* Normalized undefined catch-all route params to an empty string in
  `src/pages/[...url].astro`.
* Rebuilt the Astro SSR bundle successfully with telemetry disabled.
* Manual user screenshot confirmed rendered workspace content in the VS Code
  webview, including top navigation, section menu, rendered Markdown, and TOC.
* Reproduced a separate linked-package issue:
  `content-structure` with `glob@13` attempted to resolve `glob/index.js` under
  Node 22. Added a root pnpm override for `glob@11.1.0`; lockfile/install
  refresh remains pending.

Commands run:

```txt
$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build
$env:MICROWEBSTACKS_ENGINE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_WORKSPACE_ROOT='C:\dev\VectorMind'; $env:MICROWEBSTACKS_DOCS_ROOT='C:\dev\VectorMind'; $env:MICROWEBSTACKS_DB_PATH='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\vector-test\content.db'; $env:MICROWEBSTACKS_STORE_PATH='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\vector-test\store'; $env:MICROWEBSTACKS_OUTDIR='C:\dev\MicroWebStacks\astro-huge-doc\dist'; node scripts\collect.js
```

## 2026-06-27 - Readonly DB Regression

Expected:

* Importing `config.js` with an existing extension-style DB path should not
  leave a read-only SQLite handle in `content-structure`'s shared cache.
* The same DB path should remain writable through
  `content-structure/src/sqlite_utils/index.js` after config import.
* The Astro SSR build should still pass.

Actual:

* `node --check config.js` passed.
* `node --check scripts\collect.js` passed.
* `node --check packages\vscode-extension\extension.js` passed.
* Direct regression check passed: config resolved version `V1`, then a writable
  cached `content-structure` connection inserted `V2` into the same DB path;
  final row count was `2`.
* Full `node scripts\collect.js` validation against a temp DB did not reach the
  SQLite writer because the local linked `content-structure` install still
  fails first on the known Node 22 `glob/index.js` package-main issue.
* `pnpm --version` failed because `pnpm` is not available on this shell's PATH.
* `$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build`
  passed.

Commands run:

```txt
node --check config.js
node --check scripts\collect.js
node --check packages\vscode-extension\extension.js
$env:ASTRO_TELEMETRY_DISABLED='1'; $env:MICROWEBSTACKS_ENGINE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_WORKSPACE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_DOCS_ROOT='C:\dev\MicroWebStacks\astro-huge-doc\content'; $env:MICROWEBSTACKS_DB_PATH='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\readonly-repro\content.db'; $env:MICROWEBSTACKS_STORE_PATH='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\readonly-repro\store'; $env:MICROWEBSTACKS_OUTDIR='C:\dev\MicroWebStacks\astro-huge-doc\dist'; New-Item -ItemType Directory -Force -Path .tmp\readonly-repro | Out-Null; New-Item -ItemType Directory -Force -Path .tmp\readonly-repro\store | Out-Null; node scripts\collect.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node scripts\collect.js
pnpm --version
$dbPath='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\readonly-cache-check\content.db'; $storePath='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\readonly-cache-check\store'; New-Item -ItemType Directory -Force -Path (Split-Path $dbPath) | Out-Null; New-Item -ItemType Directory -Force -Path $storePath | Out-Null; node -e "const Database=require('better-sqlite3'); const db=new Database(process.argv[1]); db.exec('CREATE TABLE IF NOT EXISTS versions (version_id TEXT, created_at TEXT, type TEXT, tags TEXT); DELETE FROM versions;'); db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?)').run('V1', '2026-06-27T00:00:00.000Z', 'daily', '[]'); db.close();" $dbPath; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $env:MICROWEBSTACKS_ENGINE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_WORKSPACE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_DOCS_ROOT='C:\dev\MicroWebStacks\astro-huge-doc\content'; $env:MICROWEBSTACKS_DB_PATH=$dbPath; $env:MICROWEBSTACKS_STORE_PATH=$storePath; $env:MICROWEBSTACKS_OUTDIR='C:\dev\MicroWebStacks\astro-huge-doc\dist'; node -e "const path=process.env.MICROWEBSTACKS_DB_PATH; const {config}=await import('./config.js'); const {openDatabase}=await import('content-structure/src/sqlite_utils/index.js'); const db=openDatabase(path, {readonly:false}); db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?)').run('V2', '2026-06-27T00:01:00.000Z', 'daily', '[]'); console.log(JSON.stringify({version: config.collect.version_id, count: db.prepare('SELECT COUNT(*) AS count FROM versions').get().count}));"
$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build
```

## 2026-06-27 - Diagram Generation In Extension Preview

Expected:

* The extension should run diagram generation after content collection so
  Kroki-backed diagram SVG assets exist before the preview server starts.
* If a diagram cannot be generated, the rendered page should fall back to the
  code view instead of requesting `/assets/null:<uid>.svg` and showing a blank
  diagram panel.
* The changed extension and renderer files should parse/build successfully.

Actual:

* `packages\vscode-extension\extension.js` now runs `scripts\diagrams.js`
  immediately after `scripts\collect.js`.
* `DiagramCode.astro` now renders the diagram panel only when a generated SVG
  blob id exists; otherwise it shows the code block.
* `node --check packages\vscode-extension\extension.js` passed.
* `node --check scripts\diagrams.js` passed.
* `node --check config.js` passed.
* `scripts\diagrams.js` smoke test passed against a minimal temp DB with no
  diagram-capable assets and did not require a Kroki network call.
* `$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build`
  passed.

Commands run:

```txt
node --check packages\vscode-extension\extension.js
node --check scripts\diagrams.js
node --check config.js
$dbPath='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\diagrams-smoke\content.db'; $storePath='C:\dev\MicroWebStacks\astro-huge-doc\.tmp\diagrams-smoke\store'; New-Item -ItemType Directory -Force -Path (Split-Path $dbPath) | Out-Null; New-Item -ItemType Directory -Force -Path $storePath | Out-Null; node -e "const Database=require('better-sqlite3'); const db=new Database(process.argv[1]); db.exec('DROP TABLE IF EXISTS versions; DROP TABLE IF EXISTS asset_info; DROP TABLE IF EXISTS blob_store; DROP TABLE IF EXISTS assets; DROP TABLE IF EXISTS documents; CREATE TABLE versions (version_id TEXT, created_at TEXT, type TEXT, tags TEXT); CREATE TABLE asset_info (uid TEXT, type TEXT, blob_uid TEXT, parent_doc_uid TEXT, path TEXT, ext TEXT, first_seen TEXT, last_seen TEXT); CREATE TABLE blob_store (blob_uid TEXT, hash TEXT, path TEXT, first_seen TEXT, last_seen TEXT, size INTEGER, compression INTEGER, payload BLOB); CREATE TABLE assets (asset_uid TEXT, version_id TEXT, doc_sid TEXT, blob_uid TEXT, type TEXT); CREATE TABLE documents (uid TEXT, sid TEXT);'); db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?)').run('V1', '2026-06-27T00:00:00.000Z', 'daily', '[]'); db.close();" $dbPath; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $env:MICROWEBSTACKS_ENGINE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_WORKSPACE_ROOT='C:\dev\MicroWebStacks\astro-huge-doc'; $env:MICROWEBSTACKS_DOCS_ROOT='C:\dev\MicroWebStacks\astro-huge-doc\content'; $env:MICROWEBSTACKS_DB_PATH=$dbPath; $env:MICROWEBSTACKS_STORE_PATH=$storePath; $env:MICROWEBSTACKS_OUTDIR='C:\dev\MicroWebStacks\astro-huge-doc\dist'; node scripts\diagrams.js
$env:ASTRO_TELEMETRY_DISABLED='1'; node node_modules\astro\astro.js build
```
