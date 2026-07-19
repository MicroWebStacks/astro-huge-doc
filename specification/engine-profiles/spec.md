# Specification: Engine Profiles and Supported Deployments

## Scope

This contract defines which combinations of feature profile, data backend,
and output mode the engine supports, what each combination is for, and the
performance obligations attached to the VS Code extension combination.

The *processes* that serve these combinations (dev server, express wrapper,
static hosting), endpoint ownership across them, env-var precedence, and port
selection are governed by `specification/run-modes/spec.md`.

## Independent axes

Three concerns are deliberately separate and must not become synonyms for one
another (shared with `specification/reusable-render/spec.md`):

- `profile`: `full` or `lite` — which features are compiled in;
- `backend`: `sqlite` (canonical store, native dependency) or `json`
  (pre-exported dataset, no native dependency);
- `output`: `server` (Node-adapter SSR, on-demand) or `static` (prerendered,
  no adapter).

## Supported deployments

Exactly three combinations are supported products. Other combinations may
work incidentally but carry no compatibility promise.

| Deployment | Profile | Backend | Output | Role |
| --- | --- | --- | --- | --- |
| VS Code extension preview | `lite` | `json` | `server` | Zero-native-dependency live preview of a workspace |
| Static site (GitHub Pages et al.) | `full` | `json` | `static` | Prerendered artifact; the GitHub Action is this deployment packaged for CI, not a separate deployment |
| Self-hosted Node SSR | `full` | `sqlite` | `server` | Reference implementation of full capability |

Rules that follow:

- The full SQLite SSR server is the **reference implementation**: it exercises
  the engine's complete feature set (versioning, blob store, HTML cache,
  auth, GitHub fetch, image optimization) and must always be maintained and
  kept releasable, independent of extension-driven changes.
- The static deployment uses the `json` backend, not SQLite: a static build
  needs no canonical store at serve time, and CI must not require native
  dependencies beyond what the build itself uses.
- Native SQLite imports must remain behind the backend runtime gate and opaque
  to the static bundler. A `full` + `json` + `static` build must succeed when
  `better-sqlite3` is absent from the installed engine dependency tree.
- The `lite` profile exists only for the extension; it must never gain a
  native dependency (see the vscode-lite packet history).
- The markdown parsing layer (`content-structure`) is maintained inside this
  repository at `packages/content-structure/` — a private workspace package,
  not an external npm release (adopted 2026-07-13; the former sibling repo is
  frozen).
- Rendering code is shared across all three; anything that is *generation or
  storage* may be profile- or backend-specific.

## Lite identity contract — filenames, not frontmatter

The lite profile targets standard GitHub-style markdown repositories, where
the file tree is the source of truth. It does not read frontmatter for
identity:

- A document's label is its filename without extension, verbatim (spaces and
  original casing preserved).
- A document's URL is its slugified relative path, without the file
  extension.
- Frontmatter titles and slug overrides are ignored in lite. This is a
  deliberate divergence from the full profile (which keeps frontmatter/
  title-derived slugs): the same workspace can produce different URLs in lite
  and full, and lite deep links carry no cross-profile compatibility promise.

## Extension performance contract

The extension deployment serves an interactive user inside their editor. Its
resource use must be proportional to what the user is currently looking at,
not to the size of the workspace:

- Startup work ahead of the first rendered page is bounded by file-level
  operations (directory walk, file metadata) — **no file contents are read**
  to build the navigation tree; labels and URLs come from filenames (see the
  identity contract above).
- The navigation index (`filetree.json` or successor) is rewritten only when
  files are added, deleted, or renamed — never on content edits.
- Deep per-page work (AST build, diagram rendering, highlighting) happens on
  demand for the requested page, then is cached as a per-file record keyed by
  **content hash**; a cached page is re-processed only when its hash changes.
  Diagrams render lazily at page load — there is no site-wide diagram pass.
- A change to one source file re-processes that file, without restarting the
  preview server. The only standing watchers are tree add/delete/rename and
  the currently shown page.
- Idle cost is flat: an open preview on a huge site holds memory proportional
  to visited pages, not total pages.

The side menu is closed by default; opened before the file walk completes, it
shows a skeleton-loading state. When a section is active the tree shows only
that section's subtree; on home it shows only root-level files that belong to
no section.

## Performance monitoring — local log, never telemetry

This project has a strict **no-telemetry policy**: no usage data, metrics,
crash reports, or identifiers are ever collected or transmitted, by any
deployment. Performance is monitored exclusively through local output:

- `pnpm bench:lite` (`scripts/bench-lite.js`) is the measurement instrument:
  it generates a synthetic large site under the git-ignored `.cache/` folder
  and prints per-stage timings to stdout, including an end-to-end SSR
  first-page request. Results go nowhere else.
- The extension always prints per-stage timings (tree walk, page parse,
  server start) to its local VS Code output channel — not only in a debug
  mode. The log is for the user's own eyes; nothing is aggregated or sent.
- There are no absolute performance budgets. After optimization, achieved
  numbers are recorded as reference values
  (`plans/2026-07/13/extension-performance/test.md`) and regressions are
  judged as deltas against them.

## Non-goals

- The static and full-SSR deployments are not bound by the laziness rules
  above: a CI build parsing the entire site up front is that deployment's
  job, and the SSR server may warm caches eagerly.
- No promise is made for unlisted axis combinations (e.g. `lite` + `static`).
