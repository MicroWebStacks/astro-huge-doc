# Active Tracking Improvements — Validation Notes

Date: 2026-07-22
Scope: planning/discovery validation before implementation

## Open-point validation matrix

| ID | Test needed? | What can be checked now | Required completion evidence |
| --- | --- | --- | --- |
| OP-001 | Yes | Existing persisted source entries carry `path` and `document_url`; snapshot-backed preview navigation tests pass. | Unit tests for relative-path lookup plus endpoint tests for found, root, missing, malformed, encoded, non-`.md`, and traversal inputs; extension-host proof that an active file opens the returned route. |
| OP-002 | Yes, after implementation | Existing manifest has one `Open Preview` command; the maintainer resolved the desired behavior. | Extension-host tests for selected `.md`, no selected `.md`, unlocked follow, lock-icon toggle, `.mdx` ignored, keyboard access, and panel-lifetime reset. |
| OP-003 | No — feature removed | No page-to-extension bridge exists or is needed for active routing, follow mode, or a native panel-toolbar lock control. | Static/extension-host checks confirm no bridge bootstrap or rendered-page message handler was added. |
| OP-004 | No — superseded | Source inspection confirms headings retain `node.position.start.line`, but Reveal Heading was removed with the bridge. | No completion evidence required in this packet; existing heading metadata remains unchanged. |
| OP-005 | Yes, after implementation | Desired selection policy is proposed only. | Unit tests for workspace selection plus extension-host tests for active-file workspace, one-folder fallback, multi-root picker, cancellation, and out-of-root files. |
| OP-006 | Yes, after session refactor | Source inspection confirms current panel disposal only clears the panel reference; the new decision intentionally changes this behavior. | Extension-host lifecycle tests proving panel close stops that session's server/watcher/timers, reopen starts cleanly, and explicit stop, folder removal, failure/replacement, and deactivation share idempotent cleanup. |
| OP-007 | Yes, after implementation | No per-session effective-configuration comparison exists yet. | Tests for folder/workspace/user scopes, unchanged effective values, affected-session-only restart, rapid-change coalescing, and unrelated settings. |
| OP-008 | Yes; decision resolved, implementation evidence pending | Current repository has Node tests but no VS Code extension-host harness. | Harness smoke test with pinned VS Code version, network-free fixtures, bounded startup, clean child-process disposal, and green Windows/Ubuntu CI jobs. Every job must expose an Actions summary and downloadable machine-readable plus Markdown/JSON runtime report; macOS is out of scope. |
| OP-009 | Yes — command removal | Current manifest still has `microwebstacks.openDocsInBrowser`; the plan removes it and keeps the other three commands. | Manifest assertion and extension-host registration smoke test prove Open Preview, Restart Server, and Stop Server remain, Open in Browser is absent, and the changelog records the removal. |
| OP-010 | No cross-window guarantee required | Current module globals are process-local and ports are dynamically allocated, but writable storage is derived from workspace-scoped storage plus the workspace URI key. | Document that only one preview is authoritative when the same workspace is open in multiple VS Code windows. No synchronization, isolation, or two-window correctness test is required; ordinary single-window multi-root tests remain required. |

## Commands and results

### Focused source-map and preview tests

```text
node --test --test-name-pattern "gate follows|prefers the persisted|runtime payload|version payload" test\extension-preview-endpoints.test.js
```

Result: PASS — 4/4 selected tests.

```text
node --test test\layout-navigation.test.js
```

Result: PASS — 3/3 tests. This covers source entries containing canonical
`path`/`document_url` values, root behavior, section scoping, and landing-page
folding.

### Broader focused attempt

```text
node --test test\extension-preview-endpoints.test.js test\layout-navigation.test.js test\lite-deep-site-navigation.test.js test\okf-identity.test.js
```

Result: BLOCKED/PARTIAL — 7 assertions passed; five tests/processes could not
load the live backend because the installed `glob` package declares an
`index.js` that is absent from the local package directory. The failure occurs
during module resolution before the affected product assertions run.

Observed error:

```text
ERR_MODULE_NOT_FOUND: Cannot find package
...\node_modules\glob\index.js
```

No dependency repair or download was attempted during this planning task.

### Heading-line runtime probe

A direct `buildDocumentContent()` probe for headings on lines 1 and 5 was
attempted. It was blocked by the same transitive `glob` resolution failure
before Markdown parsing ran. Source inspection confirms the current heading
record contains:

```text
line: node.position?.start?.line ?? null
```

This remains discovery evidence only. OP-004 was later superseded when Reveal
Heading and the page-to-extension bridge were removed from scope.

### Static source/manifest checks

`Select-String` checks confirmed:

- the current pre-implementation manifest still contains `previewDocs`,
  `openDocsInBrowser`, `restartDocsPreviewServer`, and `stopDocsPreviewServer`
  under the `microwebstacks.*` namespace; OP-009 requires removing the browser
  command during implementation;
- the extension's free-port probe binds to `127.0.0.1`;
- panel disposal currently clears `previewPanel` without itself stopping the
  server;
- heading records retain their source line.

### Plan consistency

```text
node scripts\check-plans.js
```

Result: PASS — 32 packets checked; open/closed indexes consistent.

## Implementation validation — 2026-07-22

### VS Code extension-host baseline

`corepack.cmd pnpm test:extension`

Result: PASS on Windows x64 with VS Code 1.100.3 / extension-host Node
20.19.0. Four cases passed, zero failed, zero timed out; total runtime was
9,393 ms.

| Case | Result | Duration |
| --- | --- | ---: |
| Active routing, follow/lock, `.mdx` rejection, reload/tree stamps | PASS | 4,022 ms |
| Scoped automatic/manual restart, unaffected-folder stability, panel disposal | PASS | 3,491 ms |
| Multi-root port/storage isolation and scoped stop | PASS | 1,795 ms |
| Lazy activation and command surface | PASS | 84 ms |

Reports are written to `.tmp/extension-tests/reports/` as `results.json`,
`runtime.json`, and `runtime.md`. CI runs the pinned suite on Windows and
Ubuntu, appends the Markdown report to the Actions summary, and uploads a
named per-OS artifact. The first Ubuntu baseline awaits the first CI run.

### Focused tests and build

- Endpoint selection: PASS — 5/5 selected tests.
- Layout navigation plus extension manifest: PASS — 5/5 tests.
- `corepack.cmd pnpm build`: PASS — final server build completed in 21.39 s;
  existing dynamic-route and large-chunk warnings remain non-fatal.
- `node scripts/check-plans.js`: PASS before closure — 32 packets consistent.

### Known environment gap

The broad root `pnpm test` attempt remains partially blocked by the previously
documented incomplete local `glob` package (`index.js` absent) in tests that
import the live collector. Focused product assertions and the build pass.

## Post-closure lock-toolbar correction — 2026-07-23

Runtime screenshot inspection showed that the declared lock/unlock actions
were absent from both the preview title bar and its overflow menu. Inspection
of VS Code 1.129.1's built-in Markdown extension confirmed that webview-panel
title actions use `menus.editor/title` gated by `activeWebviewPanelId`.

```text
node --test test/vscode-extension-manifest.test.js
```

Result: PASS — 3/3 tests. The new regression test verifies that no
`webview/title` menu remains and that both lock states attach to
`activeWebviewPanelId == 'microwebstacksDocsPreview'`. It also verifies the
shared `Preview ` label prefix used to keep the mutually exclusive action in a
stable sort position.

```text
corepack.cmd pnpm test:extension
```

Result: BLOCKED before the extension host started — this checkout currently
lacks `@vscode/test-electron` in `node_modules`. No dependency installation was
performed. The previously recorded extension-host suite already covers the
lock/unlock command behavior; this correction changes only the manifest menu
attachment.
