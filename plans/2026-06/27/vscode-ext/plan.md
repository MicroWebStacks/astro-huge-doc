# Handoff: VS Code Desktop Extension for `astro-huge-doc`

## Goal

Build a VS Code desktop extension for `astro-huge-doc` that previews the generated documentation website directly inside VS Code, with a fallback command to open the rendered site in the user’s browser via localhost.

This should focus only on **desktop VS Code** for now. Do not target `vscode.dev`, browser-based VS Code, or web-extension compatibility yet.

## Scope

Use `astro-huge-doc` as the main base because it already fits the extension use case better than the static `astro-big-doc` approach. The extension should run a local server, render the Markdown docs through the existing Astro/Node SSR path, and show the result inside a VS Code webview.

The first version should optimize for:

* Zero-config local preview from a Markdown folder
* VS Code desktop only
* Localhost rendering
* Fast refresh when Markdown files change
* Browser fallback command

## Recommended Repository Strategy

Keep the extension inside the same `astro-huge-doc` repository for the first phase.

Suggested layout:

```txt
astro-huge-doc/
  packages/
    vscode-extension/
    core/
  apps/
    demo/
```

The extension should not be developed in a separate repo yet because the preview flow will likely require changes to the collector, routing, manifest format, local server behavior, and cache invalidation. Keeping everything together makes iteration faster.

A separate repo can be considered later once the internal API is stable and the extension is ready to publish independently.

## Architecture

The VS Code extension should:

1. Detect the workspace/documentation root.
2. Start a local `astro-huge-doc` preview server on a free localhost port.
3. Open a `WebviewPanel` inside VS Code.
4. Load the local rendered site inside the webview.
5. Provide a fallback command to open the same localhost URL in the external browser.
6. Watch Markdown/content changes and refresh or invalidate the rendered output.

## Workspace And Storage Contract

Use VS Code desktop extension storage conventions for generated preview data.

The extension should keep generated runtime artifacts that belong only to the
preview session out of both the extension install directory and the user's
project tree by default. The generated content database, HTML cache, and similar
private extension state should be stored under VS Code's workspace-scoped
extension storage, `ExtensionContext.storageUri`.

Recommended V1 layout:

```txt
<context.storageUri>/microwebstacks/content.db
<context.storageUri>/microwebstacks/html-cache.db
```

If the implementation keeps HTML cache rows in the same SQLite database as the
content index, that combined database should still live under
`context.storageUri`.

Workspace files remain the source material:

* Markdown, MDX, assets, and optional `manifest.yaml` are read from the selected
  workspace or documentation root.
* Generated preview DB/cache files are not written to the workspace by default.
* Writing generated output to the workspace should be an explicit future option
  only when the user wants a portable or inspectable project artifact.

Do not write runtime DBs or caches into the packaged extension installation
directory.

For later multi-root support, store per-folder data under a child directory of
`context.storageUri` keyed by a stable hash of the selected
`workspaceFolder.uri.toString()`.

The local server and collector should receive explicit runtime paths:

* `workspaceRoot` or `docsRoot` for source files.
* `manifestPath` when a manifest exists.
* `dbPath` under `context.storageUri` for generated preview data.
* `storePath` under `context.storageUri` for generated blobs/cache data.
* `host` and `port`, with the port chosen dynamically for the VS Code preview
  session.

This keeps the existing repository usable in its current standalone mode while
allowing the VS Code extension to run the same rendering stack against another
workspace without polluting that workspace.

## Initial Commands

Implement these commands first:

```txt
MicroWebStacks: Preview Docs in VS Code
MicroWebStacks: Open Docs in Browser
MicroWebStacks: Restart Docs Preview Server
MicroWebStacks: Stop Docs Preview Server
```

The main command should be:

```txt
MicroWebStacks: Preview Docs in VS Code
```

It should start the server if needed, then open the preview webview.

## Rendering Mode

Use the SSR/local-server approach from `astro-huge-doc`.

Do not start with static generation. Static output is better for publishing, but the VS Code extension needs fast local preview, file watching, route updates, and dynamic rendering of the current workspace. SSR is the better first path.

## Webview Behavior

The VS Code webview should load the local server URL, for example:

```txt
http://127.0.0.1:<port>/
```

Use VS Code webview port mapping for localhost access.

Do not rely heavily on Astro HMR inside the webview in V1. A simpler refresh-on-change mechanism is enough:

* Watch `.md`, `.mdx`, config, and asset files
* Debounce changes
* Rebuild or invalidate the docs index/cache
* Refresh the webview

## Desktop-Only Assumption

This extension can depend on Node/native desktop behavior.

That means it is acceptable for V1 to use dependencies such as:

* `better-sqlite3`
* local file system access
* Node child processes
* localhost server
* native Astro Node adapter flow

Do not spend time making this work in browser-based VS Code yet.

## First Implementation Milestone

A successful V1 should do this:

1. User opens a workspace containing Markdown docs.
2. User runs `MicroWebStacks: Preview Docs in VS Code`.
3. Extension starts a local `astro-huge-doc` server.
4. VS Code opens a preview panel showing the rendered docs.
5. User edits a Markdown file.
6. Preview updates after a short debounce.
7. User can also run `MicroWebStacks: Open Docs in Browser`.

## Non-Goals for V1

Do not include these in the first version:

* VS Code web extension support
* Remote publishing
* Marketplace polish
* Multi-root workspace perfection
* Full custom UI around the docs
* Static export flow
* Complicated configuration UI
* Deep theme customization
* Authentication
* Cloud sync

## Main Risk Areas

The main things to validate early are:

* Whether the Astro SSR server can be started reliably from the extension
* How native dependencies behave when packaged as a VS Code extension
* Whether file watching and cache invalidation feel fast enough
* Whether the webview handles localhost rendering cleanly
* Whether links, assets, images, and internal routing work inside the webview

## Suggested Development Order

1. Create `packages/vscode-extension`.
2. Add a minimal VS Code extension with one command.
3. Add explicit runtime path support for workspace root, DB path, store path,
   and dynamic port without breaking the current manifest/cwd standalone flow.
4. Start a local preview server from the extension.
5. Open the rendered site in an external browser.
6. Add the VS Code webview preview.
7. Add file watching and refresh.
8. Add restart/stop commands.
9. Clean up packaging and native dependency handling.
10. Only then consider extracting a stable `core` package.

## Decision

Proceed with `astro-huge-doc`, same repository, desktop VS Code only,
SSR/localhost preview first, and VS Code-compliant workspace-scoped extension
storage for generated preview data.
