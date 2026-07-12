# Specification: Reusable Render Command

## Scope

This contract governs the public, versioned entry point that lets another
repository turn its own Markdown content into a deployable static website
using `@microwebstacks/md-render`, and the thin GitHub Action that wraps it.

It covers:

- the static-generation strategy the engine uses (`output=static`);
- the consumer-facing command surface and its argument/error contract;
- the deployment profile fixed for this contract (`backend=json`,
  `profile=full`);
- base-path and canonical-site handling for static output.

It does not cover the VS Code extension's lite/json SSR startup path, which is
unaffected and out of scope here (see
`plans/2026-07/12-reusable-render-action/plan.md` OP-009).

## Output, backend, and profile are independent axes

Three concerns are deliberately separate and must not become synonyms for one
another:

- `output`: `server` (Node-adapter SSR, on-demand) or `static` (prerendered,
  no adapter);
- `backend`: `sqlite` (canonical store, native dependency) or `json`
  (pre-exported dataset, no native dependency);
- `feature profile`: `full` or `lite`.

The reusable render command and Action are fixed to `output=static`,
`backend=json`, `profile=full`. Lite may adopt static later; that is a
separate, not-yet-accepted decision.

## Static-generation strategy

Static output is a true Astro static build, not an SSR crawler or export
workaround:

- `astro.config.mjs` (server) and `astro.config.static.mjs` (static) both call
  the shared `baseAstroConfig()` factory in `astro.config.shared.mjs`, so
  profile-driven behavior (lite image service, model-viewer gating,
  `better-sqlite3` externalization) is defined once. Only output-specific
  concerns (adapter, `output`, `site`, `base`, the blob-copy integration)
  differ between the two config files.
- `astro.config.static.mjs` sets `output: 'static'` and installs no adapter.
- `src/pages/[...url].astro` exports `getStaticPaths()`, sourced from
  `getDocuments()` (the same structure-db surface both backends already
  implement). Astro only calls this under `output: 'static'`; under
  `output: 'server'` routes stay on-demand and the export has no effect, so
  the server target is unchanged by its presence.
- `getStaticPaths()` excludes `doc.url === ''` — that route belongs to
  `index.astro`, which already renders the home document. Including it would
  register a duplicate route pattern.
- Content-addressed blobs are not part of Astro's asset pipeline. The
  `md-render-static-blobs` integration in `astro.config.static.mjs` copies
  `resolveBlobsSourceDir(config)` (the same directory the SSR `/blobs/`
  middleware serves from) into `<outDir>/blobs` on `astro:build:done`.
- `404.astro` needs no changes: Astro's static build already emits it as
  `404.html`.

## Base-path and site handling (static only)

SSR always serves at root; base-path/site support only applies to
`output=static`.

- `config.js` reads `MICROWEBSTACKS_BASE` (default `'/'`) and
  `MICROWEBSTACKS_SITE` (default unset) into `config.base` / `config.site`.
  `astro.config.static.mjs` passes these to Astro's own `base`/`site` options.
- Every internal link the engine constructs itself — not through Astro's
  native asset pipeline — must route through a base-aware helper so it
  resolves correctly when deployed under a repository subpath:
  - `blobFileUrl(hash, ext, base)` in `src/libs/blob-files.js` prefixes
    `/blobs/...` links. Both `structure-db-json.js` and
    `structure-db-sqlite.js` call it with `config.base`.
  - `buildDocLink(url)` in `src/layout/layout_utils.js` prefixes every
    navigation/section-menu link with `basePrefix(config.base)`.
  - `Layout.astro`'s favicon `<link>` uses Astro's own
    `import.meta.env.BASE_URL` (idiomatic for a literal `public/` asset
    reference, and correct in both server and static targets without reading
    `config.base` directly).
- `Astro.url.pathname` includes the `base` prefix once `base` is configured.
  `layout_utils.js#normalizePath` strips it first (`stripBase`, keyed off
  `config.base`) so active-link/section resolution stays correct whether the
  pathname came from `Astro.url` or from a link this module already
  base-prefixed. Without this, every nav item resolves as inactive under a
  non-root base.
- Astro's own base handling does not nest the physical output directory under
  the base path — `dist/index.html`, not `dist/<base>/index.html`. Hosting
  (e.g. a GitHub Pages project site) is expected to serve the output
  directory's contents *at* the base path; the command does not restructure
  the artifact to match.
- The SSR `/blobs/` middleware (`src/middleware.js`) is unaffected: it matches
  `/blobs/` literally and is not base-aware, because SSR never sets
  `config.base` away from `/`. Should SSR ever need a non-root base, this
  middleware would need the same treatment `blobFileUrl` already has.

## Command contract

```text
md-render build --workspace <path> --out-dir <path> \
  [--manifest <path>] [--site <absolute-url>] [--base <path>]
```

Implemented in `bin/md-render.js` / `src/libs/render-build.js` (Phase 2); the
shape above matches the provisional design as-written, no changes needed.

- Arguments are the public API. Environment variables (`MICROWEBSTACKS_*`,
  `DOCS_*`) remain an internal compatibility layer for the existing
  configuration loader; command arguments take precedence over a consumer
  repository's own `.env` via `MICROWEBSTACKS_DOTENV_OVERRIDE=false`
  (`src/libs/load-env.js`), which the command always sets.
- Fixed for this contract: `output=static`, `DOCS_BACKEND=json`,
  `DOCS_PROFILE=full`. The command does not expose `lite` or `server` as
  Action-facing options.
- Stable failure categories, each a `BuildError.category` and printed as
  `md-render build: <category>: <message>`: `invalid_configuration`,
  `missing_content`, `collection_failed`, `diagram_failed`, `build_failed`,
  `unsafe_output_path`.
- Isolated output/store directories (a fresh `mkdtemp` build root per
  invocation); incomplete output is cleaned up on failure without touching
  consumer source. `--out-dir` is only ever written once, at the end, after
  every stage has already succeeded.
- Requires Node 22+ (OP-007); the command checks this itself and fails with
  `invalid_configuration` on older runtimes rather than failing obscurely
  partway through a stage.

## GitHub Action contract

Implemented in the repository-root `action.yml` (Phase 4): a thin composite
Action, colocated with the engine per OP-003 while it remains a wrapper.

```text
uses: MicroWebStacks/astro-huge-doc@<pinned-tag-or-sha>
with:
  engine-version: <exact @microwebstacks/md-render version>   # required, no default
  node-version: '22'                                          # optional, must be >=22
  workspace: '.'                                               # optional
  out-dir: 'dist'                                               # optional
  manifest: ''                                                  # optional
  site: ''                                                      # optional
  base: ''                                                      # optional
outputs:
  artifact-path     # absolute path to the artifact md-render build wrote
  engine-version     # echoes the pinned input, for downstream logging
```

- `engine-version` has no default. Every published `@microwebstacks/md-render`
  version before this packet's Phase 3 lacks `bin/md-render.js`; defaulting to
  one of them would look reasonable and fail obscurely. Consumers pin an exact
  version; the install step itself fails clearly
  (`has no bin/md-render.js (engine too old for this Action)`) if a pinned
  version predates the command.
- The Action installs the pinned engine with a plain, isolated
  `npm install --prefix "$RUNNER_TEMP/md-render-engine" @microwebstacks/md-render@<version>`
  — the same install path a real npm consumer uses (proved in Phase 3), not
  the VS Code extension's vendored/renamed `_modules` shortcut. It never
  touches the consumer's own `node_modules` or lockfile.
- `node-version` must resolve to Node 22+; the Action checks the input's major
  version itself before installing Node, and fails with a clear
  `::error::` message on an older or non-numeric value, rather than letting
  Node/npm fail obscurely partway through the install or build step.
- The Action calls only the public `md-render build` command (via the
  installed package's `bin` entry) and exposes `artifact-path`; it holds no
  `permissions:`, does not check out the consumer's repository, and does not
  upload or deploy anything. Those steps belong to the consumer's own
  workflow (see the example below and OP-006).
- `.github/workflows/render-example.yml` is a `workflow_dispatch`-only
  reference example (checkout, this Action, `actions/upload-pages-artifact`,
  `actions/deploy-pages`) showing the intended consumer shape; it is not
  wired to run automatically and does not deploy this repository's own site.

## Ownership boundaries

| Surface | Owns | Must not own |
| --- | --- | --- |
| Shared engine | Collection, diagrams, routes, components, themes, assets, export orchestration | GitHub permissions, deployment, extension UI |
| Render command | Arguments, isolated configuration, lifecycle, artifact production | A second collection or rendering implementation |
| GitHub Action | Runtime setup, command invocation, output path | Rendering logic or Pages deployment policy |
| VS Code extension | Engine acquisition, preview lifecycle, webview integration | Static export or Action behavior |
| Consumer repository | Content, manifest, site/base, workflow, upload, deployment, version pin | Renderer source or internals |

## Non-goals

- Preserving authentication, sessions, or mutable APIs in static output.
- Making the SSR `/blobs/` middleware base-aware (no SSR deployment target
  needs it today).
- Restructuring the static artifact's physical layout to nest it under
  `base` — that is the hosting step's responsibility.
- Changing the VS Code extension's lite/json SSR startup path.
