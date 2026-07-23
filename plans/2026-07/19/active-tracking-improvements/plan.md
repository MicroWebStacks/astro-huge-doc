# Active Tracking Improvements — Plan

Status: implemented and closed on 2026-07-22
Input: [handoff.md](handoff.md)
Scope: VS Code embedded preview, active-document tracking, workspace session lifecycle, and extension-host integration tests

## Problem summary

The VS Code extension already runs the Astro Huge Doc engine, renders a whole
Markdown documentation site in an embedded webview, and refreshes changed
content without restarting the server. It does not yet connect that site
reliably to the document being edited: preview commands open the site root,
runtime state is global, configuration changes require manual restarts, and
extension behavior is not covered by a real VS Code extension-host suite.

This packet makes the preview behave like a documentation-authoring tool while
preserving its site-level focus. It does not turn the extension into a
single-document Markdown previewer.

## Goals

- Open the rendered route for the active Markdown document in the embedded
  VS Code preview.
- Keep an existing preview aligned with editor changes in follow mode and
  stationary in locked mode.
- Isolate servers, panels, watchers, storage, operations, and preview mode by
  workspace folder.
- Restart only affected workspace sessions when relevant settings change.
- Cover activation, routing, refresh, lifecycle, and multi-root behavior in VS
  Code extension-host tests.

## Existing baseline

The plan builds on completed behavior rather than replacing it:

- the extension resolves and runs the rendering engine;
- preview is available in a VS Code webview; the existing external-browser
  command is removed by this packet as unnecessary extension surface;
- content and tree changes are signaled through reload/tree stamps;
- the preview server stays alive across document edits;
- per-page rendering is lazy and content-hash cached in the lite profile.

## Scope

### In scope

- `.md` active-document recognition, matching the renderer's existing
  document boundary;
- one canonical source-file-to-rendered-route mapping utility;
- active-route behavior for the embedded preview command;
- follow and locked preview modes, with visible locked state;
- a lock control owned by VS Code's panel toolbar rather than the rendered
  iframe;
- one preview session per workspace folder;
- workspace-scoped restart and stop behavior;
- automatic reaction to relevant preview configuration changes;
- pure unit tests plus VS Code extension-host integration tests;
- fixture-based, network-free normal test execution;
- visible Windows/Ubuntu CI runtime reporting and downloadable test artifacts.

### Non-goals

- feature parity with Markdown Preview Enhanced;
- executable code chunks, Pandoc, PDF/ebook export, presentations, graph view,
  backlinks, image upload, or global parser scripts;
- browser-based VS Code (`vscode.dev`) or a web-extension target;
- arbitrary command dispatch from rendered content;
- multiple preview panels for the same workspace session;
- remote publishing or cloud sync;
- opening the extension preview in an external browser;
- rendered-page-to-extension messaging, Open Source, or Reveal Heading
  actions;
- macOS integration-test coverage;
- synchronization or writable-cache coordination between separate VS Code
  windows that open the same workspace;
- `.mdx` parsing, JSX/component execution, or treating `.mdx` as plain
  Markdown; `.mdx` remains an unsupported document type;
- adding alternate Markdown filename extensions such as `.markdown` unless a
  separate renderer-wide contract introduces them first;
- changes to the completed incremental rendering/cache architecture except
  where integration requires a narrow shared API.

## Resolved constraints

- **RC-001 — Markdown document boundary:** This packet supports `.md` files
  only. The extension currently lists `.mdx` among watched supporting-file
  extensions, but the collector and lazy renderer recognize documents only by
  `.md`. Active routing and follow mode must therefore not recognize `.mdx`,
  must not strip its extension into a preview route, and must not imply MDX,
  JSX, or component support. Removing `.mdx` from the watcher list is allowed
  if focused verification confirms it has no non-document purpose.

## Behavioral contract

1. Preview commands select the workspace containing the active supported
   document when one exists.
2. The source path is mapped relative to the effective documentation/content
   root using the renderer's canonical URL rules.
3. `README.md` maps to `/`, `guides/README.md` to `/guides`, and ordinary
   Markdown paths map to their extensionless rendered routes.
4. Non-`.md`, out-of-root, or absent active documents fall back safely to
   the workspace site root; they never produce an unchecked filesystem or URL
   target.
5. Reusing an existing panel navigates it to the resolved route instead of
   merely revealing its previous page.
6. Follow mode reacts only to supported documents within the session's content
   root and never steals editor focus. Locked mode suppresses that navigation.
7. Closing a preview panel stops and disposes that workspace's local preview
   server and watcher; there is no supported headless browser consumer.
8. Workspace sessions do not share ports, storage, watchers, panels, operation
   queues, or follow/lock state.
9. Content edits continue to refresh through the existing stamp protocol
   without restarting the server.

## Decisions and open points

| ID | Topic | Status | Decision needed | Proposal | Confidence |
| --- | --- | --- | --- | --- | --- |
| OP-001 | Extension access to the existing source-route map | Resolved — query the renderer's canonical map through a narrow endpoint | Choose how the extension queries the canonical `path` ↔ `document_url` mapping already produced by the lite workspace walk and stored in `filetree.json`/`getSourceEntries()`. No new route calculation is needed. | Add a narrow extension-only endpoint that accepts a validated content-relative `.md` path and returns the matching `document_url` from `getSourceEntries()`. The extension converts the active absolute file to a content-relative path, calls that endpoint after server readiness, and falls back to `/` on a typed not-found response. Do not make the extension read `filetree.json` directly or duplicate landing/slug rules. | High — accepted by the maintainer; the canonical bidirectional data already exists and focused source-entry tests pass. |
| OP-002 | Preview opening and lock control | Resolved — one opening flow; lock is a panel-toolbar toggle | Decide whether lock state needs separate opening commands or can be controlled from the preview itself. | Keep the existing `Open Preview` command as the only opening flow. If an active in-root `.md` file exists, open its mapped page; otherwise open the workspace's default/root page. The preview starts unlocked and follows qualifying active `.md` files. A persistent, keyboard-accessible icon in VS Code's preview-panel toolbar toggles locked/unlocked state and visibly reflects it. Do not add user-facing `Open Locked Preview` or `Toggle Preview Lock` palette commands; the toolbar control may be backed by an internal command as required by the VS Code API. Lock state lasts only for the panel lifetime. | High — accepted by the maintainer; it is simpler and preserves the existing command model without iframe messaging. |
| OP-003 | Bridge transport and trust | Resolved — bridge removed from scope | Decide whether the rendered iframe needs to send actions back to the VS Code extension host. | Do not add a page-to-extension bridge, Open Source, or Reveal Heading behavior. Active-route navigation remains extension-to-preview only, and the lock control lives in VS Code's panel toolbar. Dropping the existing external-browser command is a separate simplification but aligns the extension around one embedded-preview surface. | High — accepted by the maintainer; the required active-file/follow/lock workflow needs no iframe messaging. |
| OP-004 | Heading source coordinates | Superseded by OP-003 | Decide how heading lines cross the bridge for Reveal Heading. | No bridge or Reveal Heading feature is being built, so no heading-coordinate contract is needed in this packet. Existing AST source positions remain unchanged and may be used by a separate future plan if requested. | High — the dependency disappeared with the feature removal. |
| OP-005 | Ambiguous workspace selection | Resolved — active file, single-folder fallback, otherwise QuickPick | Define command behavior when there is no supported active document and more than one workspace folder is open: prompt, reuse the last active session, or use a deterministic workspace-folder fallback. | If the active `.md` file identifies a workspace, use it. With one workspace folder, use that folder and fall back to `/`. With multiple folders and no qualifying active file, show a workspace `QuickPick`; do not guess or silently reuse an unrelated session. | High — accepted by the maintainer; this follows VS Code multi-root expectations and avoids rendering the wrong private workspace. |
| OP-006 | Session lifetime | Resolved — panel close disposes its server and watcher | Decide whether closing a preview panel also stops its server/watcher immediately, retains a warm headless session, or uses an explicit idle cleanup policy. | Because external-browser preview is removed, closing a panel performs idempotent full disposal of that workspace session: server, watcher, timers, operation state, and panel reference. `Stop Server`, workspace-folder removal, extension deactivation, and failed/replaced sessions use the same cleanup path. | High — accepted simplification; no supported consumer remains after the panel closes. |
| OP-007 | Configuration scope | Resolved — compare effective configuration snapshots per session | Define how folder-, workspace-, and user-scoped setting changes are mapped to affected sessions so unrelated workspace sessions are not restarted. | For each live session, recompute the effective restart-sensitive configuration using that workspace folder's URI and compare a normalized snapshot with the session's prior snapshot. Restart only sessions whose effective values changed; coalesce rapid changes through the session operation queue. | High — accepted by the maintainer; comparing effective per-resource configuration handles folder/workspace/user scopes without brittle inference from the event alone. |
| OP-008 | Integration harness, CI matrix, and runtime observability | Resolved — Windows and Ubuntu only, with visible runtime artifacts | Select the VS Code test runner/version policy, supported operating-system matrix, and how test runtime remains visible and monitorable. | Use the official Electron extension-test harness compatible with the extension's Node/CommonJS layout, pin the VS Code test version in the lockfile, and run the normal suite on Windows and Ubuntu. macOS is out of scope. Each job writes a visible Actions summary and uploads a named report artifact containing machine-readable results plus a Markdown/JSON runtime summary: OS, VS Code/Node versions, total and per-suite duration, slowest tests, pass/fail counts, and timeouts. Record the first stable baseline in this packet's `test.md`; later validation reports runtime deltas rather than inventing an unmeasured threshold upfront. | Medium — accepted by the maintainer; the coverage/reporting contract is settled, while exact harness dependency/version and observed runtime remain implementation facts to verify. |
| OP-009 | User-facing command surface | Resolved — remove Open in Browser; keep one Open Preview command | Decide which existing and proposed commands remain public. | Remove the `microwebstacks.openDocsInBrowser` contribution and implementation, documenting the removal in the changelog. Preserve the existing Open Preview, Restart Server, and Stop Server command IDs and the `Markdown Site Preview:*` label prefix. Add no user-facing lock command; expose locking through the panel-toolbar icon resolved in OP-002. | High — accepted by the maintainer; the extension now has one preview surface and no redundant opening command. |
| OP-010 | Cross-window writable-store isolation | Resolved — retain default behavior; cross-window synchronization is unsupported | Decide how two independent VS Code Extension Host processes previewing the same workspace avoid concurrent writes to the same workspace-scoped cache/store path. Different windows already have isolated JavaScript state and dynamic ports, but the same workspace URI can derive the same writable storage key. | Add no cross-window coordination or storage-isolation mechanism. Multi-root sessions within one VS Code window remain supported. If the same workspace is opened in multiple VS Code windows, only one preview should be treated as authoritative; another may be stale, fail to refresh, or require stopping/reopening. Document this limitation and do not spend implementation effort synchronizing the processes. | High — accepted by the maintainer as an explicit non-goal; confidence applies to the scope decision, not to deterministic same-workspace multi-window behavior. |

All design points are settled. OP-003 removed the source bridge from scope and
OP-004 was superseded with it; no open point blocks implementation.

## Delivery phases

### Phase 1 — Active-document routing

- Expose and consume the lite backend's existing canonical source-entry map;
  do not implement a second source-path-to-route algorithm in the extension.
- Convert the active absolute file to a validated content-relative path using
  the effective `docsRoot`/manifest content root, then look up its stored
  `document_url` (which already accounts for landing documents, root pages,
  slugging, separators, and URL encoding).
- Reject or safely fall back for non-`.md` and out-of-root files, including an
  explicit `.mdx` negative case.
- Make the embedded preview command use the resolver and remove the external-
  browser command and implementation.
- Navigate an already-open panel to the active document's route.
- Add table-driven unit tests for route mappings and boundary cases.

Exit: the active fixture documents resolve to `/`, `/guides/setup`, and
`/guides/install`, and the embedded preview opens those routes consistently.

### Phase 2 — Follow and locked modes

- Listen for active-editor changes while a preview panel exists.
- Navigate in follow mode only for supported in-root Markdown documents.
- Add one persistent, keyboard-accessible lock icon to VS Code's preview-panel
  toolbar; do not add separate user-facing open-locked or toggle-lock palette
  commands or iframe messaging.
- Show a clear locked/unlocked state on the icon and, where useful, the panel
  title.
- Keep lock state at least for the panel lifetime.
- Test `.md`, `.mdx`, other non-Markdown, out-of-root, follow, and locked
  transitions; `.mdx` must not navigate the preview.

Exit: editor changes update a following preview without stealing focus, while
a locked preview remains on its current route.

### Phase 3 — Workspace-scoped sessions

- Replace global runtime state with a session keyed by workspace-folder URI.
- Give each session its own engine resolution, server process/state, port,
  storage, panel, watcher, debounce timer, operation queue, and preview mode.
- Keep session state process-local. Do not add synchronization between separate
  VS Code windows that open the same workspace; OP-010 records this limitation.
- Route commands through the session for the selected workspace.
- Make restart/stop/disposal operate on one session and deactivation stop all.
- Add multi-root tests proving resource isolation and independent lifecycle.

Exit: two workspace folders can preview independently, and stopping or
restarting one cannot affect the other.

### Phase 4 — Configuration lifecycle

- Listen for changes under `microwebstacks.preview`.
- Restart affected sessions for changes to `engineSource`, `enginePath`,
  `docsRoot`, or `krokiServer`.
- Avoid restarts for unrelated settings and unaffected folders.
- Preserve or deliberately restore the appropriate route and lock/follow mode
  across an automatic restart.
- Show a short status notification for automatic restarts.
- Test folder/workspace/user configuration scopes defined by OP-007.

Exit: relevant configuration changes restart only the sessions whose effective
configuration changed.

### Phase 5 — VS Code extension-host integration suite

- Add isolated fixtures and temporary extension storage.
- Verify lazy activation, command registration, output-channel creation, and
  the absence of server startup before a preview command.
- Verify bundled-engine startup, runtime endpoint health, panel creation, and
  active-file routing without network access.
- Cover follow/lock behavior, reload/tree stamps, configuration restart scope,
  panel disposal, deactivation, and multi-root isolation.
- Add the agreed CI job and document any OS-specific coverage gaps.
- On Windows and Ubuntu, publish a visible Actions summary plus a downloadable
  report artifact containing machine-readable results and Markdown/JSON timing
  data: environment versions, total/per-suite duration, slowest tests,
  pass/fail counts, and timeouts.
- Record the first stable runtime baseline in `test.md`; subsequent validation
  reports the observed delta so runtime growth is reviewable. Do not introduce
  a hard performance threshold until a representative baseline exists.

Exit: the definition-of-done workflow is exercised automatically in a real VS
Code extension host on Windows and Ubuntu, and every run exposes checkable test
results and runtime summaries. macOS is not part of the supported test matrix.

## Dependencies

- Existing lite/json lazy rendering and reload/tree stamp protocol.
- The lite backend's canonical `sourceEntries` mapping (`path` and
  `document_url`), persisted in `filetree.json` and available through
  `getSourceEntries()`.
- VS Code desktop extension APIs for workspace folders, webviews, editors,
  configuration inspection, extension storage, and integration testing.
- Bundled engine fixture or deterministic staged engine available without
  network access during normal integration tests.

## Risks and mitigations

- **Route drift:** extension and renderer could generate different URLs.
  Mitigation: resolve OP-001 by querying the renderer's existing source-entry
  map; the extension never recalculates document URLs.
- **Navigation loops or focus churn:** active-editor and route updates could
  repeat unnecessarily. Mitigation: compare the current and target routes and
  suppress no-op navigation without adding iframe messaging.
- **Session leaks:** multi-root state can leave servers, watchers, or timers
  alive. Mitigation: explicit idempotent disposal and deactivation tests.
- **Cross-window store collision:** separate VS Code windows have isolated
  Extension Hosts and ports but may derive the same writable workspace store.
  Accepted limitation: no synchronization guarantee when the same workspace
  is previewed in multiple windows; only one preview is considered
  authoritative, per OP-010.
- **Restart races:** configuration changes can overlap startup or file events.
  Mitigation: retain a per-session serialized operation queue and coalesce
  effective-configuration changes.
- **Cross-platform path differences:** containment and route mapping can behave
  differently on Windows and POSIX. Mitigation: pure-function path fixtures
  plus the CI coverage selected in OP-008.
- **Test fragility:** real extension-host tests can depend on ports, timing, or
  downloads. Mitigation: free-port allocation, readiness probes, temporary
  storage, bounded waits, local fixtures, and no network in the normal suite.

## Overall exit criteria

- Opening preview from a supported active Markdown document opens its rendered
  route beside the editor.
- Follow and locked behavior is explicit, predictable, and covered by tests.
- File edits refresh the page without restarting its server.
- Relevant configuration changes restart only affected workspace sessions.
- Multi-root workspaces maintain independent sessions and clean up completely.
- The end-to-end workflow is covered by VS Code extension-host tests on the
  Windows/Ubuntu matrix, with visible results and runtime artifacts.
- All design points are settled before implementation begins.
