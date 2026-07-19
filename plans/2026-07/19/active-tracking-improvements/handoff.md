# Astro Huge Doc VS Code Extension Handoff

## Goal

Improve the `astro-huge-doc` VS Code extension so it feels like a native documentation-authoring tool rather than only a local website embedded inside VS Code.

The extension should keep its strongest distinction:

> Markdown Preview Enhanced previews and augments the Markdown document being edited. Astro Huge Doc previews the documentation system that document belongs to.

The work should therefore focus on connecting the active editor to the rendered documentation site, strengthening multi-workspace behavior, and adding reliable VS Code integration tests. It should not attempt to reproduce every Markdown Preview Enhanced feature.

---

## Current architecture

The extension currently:

- Starts and manages the Astro Huge Doc rendering engine.
- Runs a local documentation server.
- Opens the rendered site in a VS Code webview iframe.
- Can open the same site in an external browser.
- Watches documentation files and signals content or tree changes.
- Provides commands to open, restart, and stop the preview server.

This architecture is appropriate for whole-site documentation browsing, but the VS Code layer does not yet know enough about the page the user is actively editing.

The main usability gap is that opening the preview normally opens the site root instead of the route corresponding to the active Markdown file.

---

# Priority 1: Open the active Markdown document

## Desired behavior

When the user runs **Markdown Site Preview: Open Preview** while editing a Markdown file, the extension should open the rendered page corresponding to that file.

Example:

```text
Workspace file:
docs/guides/setup/install.md

Rendered route:
http://127.0.0.1:<port>/guides/setup/install
```

If the preview panel already exists, it should navigate to the active document rather than only revealing the existing site at its previous route.

## Required work

### 1. Resolve the active editor document

Use the active text editor when:

- The document is inside the selected workspace.
- The extension supports the document type.
- The file is inside the configured documentation root.

Supported source extensions should initially include:

- `.md`
- `.markdown`
- `.mdx`

The existing watched-extension list can remain broader for assets and supporting files.

### 2. Map the source path to the rendered route

Create a dedicated route-mapping function rather than duplicating path logic in command handlers.

Suggested interface:

```js
function sourceFileToPreviewPath({
  filePath,
  workspaceRoot,
  docsRoot,
  manifest
}) {
  // Return a site path such as "/guides/setup/install".
}
```

The function must account for:

- The configured `docsRoot`.
- Manifest-based content roots.
- `README.md` and folder-index behavior.
- File extensions.
- Windows and POSIX path separators.
- URL encoding.
- Files outside the documentation root.
- Root documentation pages.

Suggested mappings:

| Source file | Preview route |
|---|---|
| `README.md` | `/` |
| `guides/README.md` | `/guides` |
| `guides/setup.md` | `/guides/setup` |
| `guides/setup/install.md` | `/guides/setup/install` |

The route calculation should preferably reuse the same canonical URL logic as the renderer or `content-structure` package. Avoid maintaining two subtly different routing implementations.

### 3. Open the resolved route

Extend server state with helpers rather than storing only root URLs.

Example:

```js
function browserUrlForPath(state, previewPath) {
  return new URL(previewPath, state.browserUrl).toString();
}

function webviewUrlForPath(state, previewPath) {
  return new URL(previewPath, state.webviewUrl).toString();
}
```

`previewDocs()` should:

1. Resolve the current workspace.
2. Ensure the server is running.
3. Resolve the active Markdown file to a site route.
4. Open or update the preview panel at that route.
5. Fall back to `/` when no supported active document exists.

`openDocsInBrowser()` should use the same route-resolution logic.

---

# Priority 2: Add a VS Code bridge around the iframe

The embedded site currently behaves mostly like an independent website. Add a controlled bridge between the rendered page and the VS Code extension host.

## Initial bridge features

### Open source

The rendered page should provide an **Open source** action that sends the source file and optional line number to the extension.

The extension should:

- Validate that the path is within the active workspace or documentation root.
- Open the corresponding document.
- Reveal the requested line.
- Keep focus behavior predictable.

Suggested message:

```json
{
  "type": "openSource",
  "path": "guides/setup/install.md",
  "line": 42
}
```

### Reveal current heading

The site should be able to report the current page and active heading.

The extension should use this to:

- Reveal the corresponding source heading.
- Move the editor selection.
- Center the heading in the editor.

Prefer sending a stable heading identifier and source line when the renderer already knows them.

### Follow active editor

When follow mode is enabled and the active editor changes to another Markdown document, the existing preview panel should navigate to that document's rendered route.

### Security boundary

Do not allow arbitrary command dispatch from the iframe.

Use an explicit allowlist of message types, such as:

```js
const ALLOWED_WEBVIEW_MESSAGES = new Set([
  'openSource',
  'revealSource',
  'previewReady',
  'routeChanged'
]);
```

Validate all paths, route values, and line numbers before acting.

---

# Priority 3: Add locked and following preview modes

The extension should support two clear behaviors.

## Follow mode

The preview follows the active Markdown editor.

Expected behavior:

- Switching from one Markdown file to another navigates the preview.
- Switching to a non-document file leaves the preview unchanged.
- Files outside the documentation root are ignored.
- The preview does not steal editor focus.

## Locked mode

The preview remains on its current page even when the active editor changes.

Suggested commands:

- `Markdown Site Preview: Open Preview`
- `Markdown Site Preview: Open Locked Preview`
- `Markdown Site Preview: Toggle Preview Lock`

Suggested visual feedback:

```text
MicroWebStacks Docs
MicroWebStacks Docs [Locked]
```

Persisting the lock state across VS Code restarts is optional. Keeping it for the current panel lifetime is sufficient initially.

---

# Priority 4: Support multiple workspace folders correctly

The current extension holds one global server, preview panel, watcher, and state object. This becomes limiting in multi-root workspaces or when several VS Code windows use different documentation roots.

## Desired design

Maintain runtime state per workspace folder.

Suggested model:

```js
const workspaceSessions = new Map();

class WorkspacePreviewSession {
  constructor(workspaceFolder) {
    this.workspaceFolder = workspaceFolder;
    this.serverProcess = null;
    this.serverState = null;
    this.previewPanel = null;
    this.fileWatcher = null;
    this.refreshTimer = null;
    this.operation = Promise.resolve();
    this.locked = false;
  }
}
```

Use a stable workspace key based on the workspace URI.

Each session should own:

- Engine/runtime resolution result.
- Server process.
- Port.
- Storage paths.
- Preview panel.
- File watcher.
- Refresh timer.
- Operation queue.
- Lock/follow state.

## Expected behavior

- Running the preview command uses the workspace containing the active document.
- Two workspace folders may have independent servers and preview panels.
- Stopping one preview does not stop another workspace's preview.
- Extension deactivation stops every active session.
- Session cleanup occurs when its panel and server are no longer needed.

A simpler first step is acceptable: support one preview session per workspace folder while keeping one panel per session.

---

# Priority 5: React automatically to configuration changes

The extension currently tells users to restart the server after changing settings. Improve this by listening for configuration changes.

## Settings that require restart

Changes to these settings should restart the relevant workspace session:

- `microwebstacks.preview.engineSource`
- `microwebstacks.preview.enginePath`
- `microwebstacks.preview.docsRoot`
- `microwebstacks.preview.krokiServer`

Suggested implementation:

```js
vscode.workspace.onDidChangeConfiguration(async (event) => {
  if (!event.affectsConfiguration('microwebstacks.preview')) {
    return;
  }

  // Restart only affected workspace sessions.
});
```

Avoid restarting every workspace unnecessarily.

Show a short status message when an automatic restart occurs.

---

# Priority 6: Add real VS Code integration tests

The engine and navigation tests are useful, but the extension also needs tests that run inside a VS Code extension host.

## Minimum integration test suite

### Activation

Verify that:

- The extension activates successfully.
- Commands are registered.
- The output channel is created.
- No server starts before a preview command is invoked.

### Bundled-engine startup

Verify that:

- The bundled engine is resolved.
- A server starts on a free local port.
- The runtime endpoint responds.
- A preview panel opens.

Use fixtures and temporary storage. Avoid network access in the normal integration suite.

### Active-file routing

Given:

```text
README.md
guides/setup.md
guides/install/README.md
```

Verify that opening the preview from each source file resolves to:

```text
/
/guides/setup
/guides/install
```

Test Windows-style and POSIX-style path inputs at the pure-function level.

### Editor-follow behavior

Verify that:

- Switching active Markdown documents updates the preview route in follow mode.
- Switching documents does not update it in locked mode.
- Switching to a non-Markdown file does not navigate the preview.

### Source reveal

Simulate a webview message and verify that:

- The correct file opens.
- The expected line is selected and revealed.
- Invalid paths outside the workspace are rejected.

### File changes

Verify that:

- Editing a supported content file touches the reload stamp.
- Creating or deleting a document also touches the tree stamp.
- The server remains alive.
- Unsupported file types do not trigger refresh work.

### Configuration changes

Verify that:

- Relevant settings restart only the affected session.
- Unrelated settings do not restart the server.

### Panel disposal

Verify that:

- Disposing the panel clears panel references.
- Stopping the session disposes watchers and kills child processes.
- Deactivation stops all active child processes.

### Multi-root behavior

Verify that:

- Commands select the workspace containing the active document.
- Two workspace sessions do not share ports, storage, watchers, or panels.
- Stopping one session leaves the other running.

---

# Suggested implementation order

## Phase 1: Active-document routing

Deliver:

- Source-path-to-route utility.
- Open preview at active document.
- Open browser at active document.
- Unit tests for route mapping.

This is the highest-value change and can be shipped independently.

## Phase 2: Preview follow and lock

Deliver:

- Follow active editor.
- Toggle lock command.
- Locked title indicator.
- Tests for switching documents.

## Phase 3: Source bridge

Deliver:

- `postMessage` bridge.
- Open-source action.
- Reveal-source action.
- Strict message and path validation.

## Phase 4: Workspace sessions

Deliver:

- Session abstraction.
- State keyed by workspace URI.
- Independent stop/restart behavior.
- Multi-root tests.

## Phase 5: Configuration lifecycle

Deliver:

- Automatic restart for relevant settings.
- Workspace-scoped restart behavior.

## Phase 6: Full VS Code integration suite

Deliver:

- Extension-host fixtures.
- Server lifecycle tests.
- Webview messaging tests.
- CI job for supported operating systems.

---

# What not to prioritize

Do not attempt to match Markdown Preview Enhanced feature-for-feature.

The following are not necessary for Astro Huge Doc's main value proposition:

- Executable code chunks.
- Pandoc integration.
- PDF and ebook export.
- Presentation authoring.
- Global parser scripts.
- Obsidian-style graph view.
- Backlink indexing.
- Image upload providers.
- Multiple previews of individual documents.

These features would add complexity while weakening the product's focus on whole-site documentation browsing.

---

# Definition of done

The improved extension should satisfy this workflow:

1. A user opens a large Markdown documentation workspace.
2. The user opens `guides/setup/install.md`.
3. The user runs **Markdown Site Preview: Open Preview**.
4. The rendered `/guides/setup/install` page opens beside the editor.
5. Moving to another Markdown file updates the preview in follow mode.
6. Locking the preview keeps it on the chosen page.
7. Clicking **Open source** from the rendered site returns to the correct file and heading.
8. File edits refresh the page without restarting the server.
9. Changing the documentation root or diagram endpoint restarts only the relevant session.
10. Multi-root workspaces maintain independent preview sessions.
11. Automated VS Code integration tests cover the complete flow.

---

# Recommended product positioning

Use the extension's distinction explicitly:

> Markdown Site Preview turns an entire Markdown repository into a navigable documentation website inside VS Code.

The extension should optimize for:

- Large documentation repositories.
- File-tree and outline navigation.
- Accurate active-document routing.
- Fast incremental refresh.
- Site-level context.
- Reliable local and private execution.
- Smooth movement between rendered pages and source files.

That direction complements Markdown Preview Enhanced rather than competing with it on every feature.
