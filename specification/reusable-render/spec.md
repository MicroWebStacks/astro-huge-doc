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

## Command contract (provisional shape, refined during Phase 2)

```text
md-render build --workspace <path> --out-dir <path> \
  [--manifest <path>] [--site <absolute-url>] [--base <path>]
```

- Arguments are the public API. Environment variables (`MICROWEBSTACKS_*`,
  `DOCS_*`) remain an internal compatibility layer for the existing
  configuration loader; command arguments take precedence over a consumer
  repository's own `.env`.
- Fixed for this contract: `output=static`, `DOCS_BACKEND=json`,
  `DOCS_PROFILE=full`. The command does not expose `lite` or `server` as
  Action-facing options.
- Stable failure categories (exact messages/exit codes defined in Phase 2):
  invalid configuration, missing content, collection failure, diagram-render
  failure, build/export failure, unsafe output path.
- Isolated output/store directories; incomplete output is cleaned up on
  failure without touching consumer source.

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
