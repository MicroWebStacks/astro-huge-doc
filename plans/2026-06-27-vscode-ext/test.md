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
