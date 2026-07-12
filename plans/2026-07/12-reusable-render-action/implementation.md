# Implementation Log

## Progress

```text
[##---] Phase 2/5 - shared command done; package/extension isolation (Phase 3) next.
```

## Phase 1 - static contract and route proof

### Files changed

- `specification/reusable-render/spec.md` (new) — durable contract: static
  strategy, output/backend/profile separation, base-path handling, command
  shape, ownership boundaries.
- `astro.config.shared.mjs` (new) — factored `baseAstroConfig()` used by both
  targets so profile-driven behavior (lite image service, model-viewer
  gating, `better-sqlite3` externalization) is defined once.
- `astro.config.mjs` — now calls `baseAstroConfig()`; unchanged behavior
  (Node adapter, `output: 'server'`).
- `astro.config.static.mjs` (new) — `output: 'static'`, no adapter,
  `site`/`base` from `config.js`, `md-render-static-blobs` integration that
  copies blobs into `<outDir>/blobs` on `astro:build:done`.
- `config.js` — added `config.output` (`DOCS_OUTPUT` env, informational for
  now), `config.site` (`MICROWEBSTACKS_SITE`), `config.base`
  (`MICROWEBSTACKS_BASE`, default `'/'`).
- `src/pages/[...url].astro` — added `getStaticPaths()` sourced from
  `getDocuments()`, excluding `doc.url === ''` (owned by `index.astro`).
- `src/libs/blob-files.js` — `blobFileUrl(hash, ext, base)` is now
  base-aware; added `basePrefix(base)` and `resolveBlobsSourceDir(config)`
  (shared by the SSR middleware and the static blob-copy integration).
- `src/middleware.js` — reuses `resolveBlobsSourceDir` instead of
  duplicating the sqlite/json path logic.
- `src/libs/structure-db-json.js`, `src/libs/structure-db-sqlite.js` —
  `getAssetUrl` passes `config.base` through to `blobFileUrl`.
- `src/layout/layout_utils.js` — `buildDocLink` is base-prefixed; added
  `stripBase`, applied inside `normalizePath` so active-link/section
  resolution works whether the incoming pathname is `Astro.url.pathname`
  (which includes `base` once configured) or a link this module already
  built.
- `src/layout/Layout.astro` — favicon href uses
  `import.meta.env.BASE_URL` instead of a hardcoded `/favicon.ico`.

### Implementation facts

- Verified empirically (not assumed) that adding `getStaticPaths()` to
  `[...url].astro` does not affect `output: 'server'`: Astro does not call it
  for on-demand routes there. `pnpm build` (SSR) succeeded before and after
  with no route/behavior change.
- Static build proven against the repository's own already-collected
  `dataset/json` content (`DOCS_BACKEND=json DOCS_PROFILE=full
  DOCS_OUTPUT=static`, `astro build --config astro.config.static.mjs`):
  produced `index.html`, `404.html`, and one `index.html` per catch-all doc
  (`math-demo`, `plantuml-demo`), plus `blobs/` copied into the output
  directory, plus normal `_astro/` client assets.
- Base-path proof: same build with `MICROWEBSTACKS_BASE=/demo-base/`.
  Confirmed blob links, favicon, nav/section-menu links, and Astro's own
  asset links all resolved under `/demo-base/...`, and active-link/section
  highlighting (`entry_container active`) still matched the current page.
  This required the `stripBase` fix below — first pass silently broke active
  highlighting because `Astro.url.pathname` includes `base` and the section
  logic wasn't stripping it before comparing doc URLs.
- Physical output layout is unaffected by `base`: files land at
  `<outDir>/index.html`, not `<outDir>/<base>/index.html`. This matches
  Astro's documented behavior and the hosting expectation recorded in the
  spec (host serves the artifact *at* the base path; the command does not
  restructure it).

### Deviations from the plan

- The plan's static-vs-SSR assessment table didn't call out that internal
  navigation links (`buildDocLink` in `layout_utils.js`) and the favicon
  `<link>` were root-absolute and not base-aware — only blob URLs were an
  obviously custom (non-Astro-native) link path. Discovered by diffing a
  root static build against a `--base` static build and finding
  `entry_container active` disappeared entirely under a base path, plus
  `href="/"`/`href="/favicon.ico"` unprefixed in the base build's HTML.
  Fixed in this phase rather than deferred, since leaving it broken would
  have failed Phase 1's own "base-path assets become static files" proof
  requirement.

### Known gap (documented, not fixed here)

- `src/middleware.js` (`/blobs/` SSR route) matches the pathname literally
  and is not base-aware. This is intentionally out of scope: SSR always
  serves at root today, so `config.base` stays `'/'` for that target and the
  gap has no effect. Recorded in `specification/reusable-render/spec.md`
  under Non-goals.

### Commands run

```text
pnpm build                                                          # SSR regression check (pass, before and after)
DOCS_BACKEND=json DOCS_PROFILE=full DOCS_OUTPUT=static \
  MICROWEBSTACKS_OUTDIR=dist-static \
  npx astro build --config astro.config.static.mjs                  # root static proof (pass)
DOCS_BACKEND=json DOCS_PROFILE=full DOCS_OUTPUT=static \
  MICROWEBSTACKS_OUTDIR=dist-static-base MICROWEBSTACKS_BASE=/demo-base/ \
  npx astro build --config astro.config.static.mjs                  # base-path proof (pass, after stripBase fix)
```

Proof output directories (`dist-static/`, `dist-static-base/`) were removed
after inspection; they are build artifacts, not workflow files.

### Follow-ups for later phases

- Phase 2 command must decide whether `config.output`/`DOCS_OUTPUT` is worth
  keeping now that `[...url].astro` doesn't need to branch on it, or whether
  the command should simply pick the config file (`--config
  astro.config.static.mjs`) and env vars (`DOCS_BACKEND`, `MICROWEBSTACKS_BASE`,
  `MICROWEBSTACKS_SITE`) directly.
- Phase 5 validation should include a real subpath browser check (not just
  HTML-string inspection) to confirm citations, galleries, and diagram
  client islands also resolve correctly under a base path — this phase only
  inspected generated HTML, it did not serve and browse the output.

## Phase 2 - shared command

### Files changed

- `bin/md-render.js` (new) — CLI entry point. Dispatches the `build`
  subcommand to `runBuildCommand`, prints `category: message` on failure,
  sets `process.exitCode` (no bare `process.exit`, so pending stdio flushes
  on Windows aren't cut off).
- `src/libs/render-build.js` (new) — the command's lifecycle: `parseBuildArgs`,
  `assertSafeOutDir`, `buildEnv`, `checkNodeVersion`, `probeConfig`,
  `assertContentPresent`, `defaultBuildSteps`, `resolveEngineRoot`,
  `runBuildCommand`. Pure/validation pieces are separated from the
  subprocess-spawning orchestration so the former are cheaply unit-testable.
- `src/libs/config-probe.js` (new) — standalone runner, spawned as its own
  process, that imports `config.js` under the command's target env and
  prints `{ contentPath }` as JSON. Used for a fast, categorized
  `missing_content` failure before spending time on collect/diagrams/build,
  without re-implementing config.js's manifest/env merging.
- `test/render-build.test.js` (new) — `node:test` coverage for argument
  parsing, output-path safety, env precedence/isolation, the Node-version
  gate, and (via injectable `steps`) failure-cleanup and success-copy
  behavior without spawning real collect/diagrams/astro processes.
- `package.json` — added `"test": "node --test \"test/**/*.test.js\""` and
  `"engines": {"node": ">=22.0.0", ...}` (OP-007).
- `scripts/stage-engine.js` — staged package `engines` bumped from `>=18` to
  `>=22` (OP-007; the actual `bin`/source staging for this command is Phase
  3's job, tracked below).

### Implementation facts

- The command's three stages (collect, diagrams, astro static build) each
  run as a **separate subprocess**, not in-process calls. `config.js` reads
  `process.env` at module-evaluation time via a top-level `await`, and Node
  caches ES modules by resolved URL — a single process can only observe one
  env-derived `config.js` per process lifetime. Running collect/diagrams/
  build in-process sequentially would silently reuse the first stage's
  config. This mirrors how `pnpm collect && pnpm diagrams && pnpm build`
  already works today; the command's job is orchestrating the same
  three independent entry points with a consistent, isolated env, not
  replacing them.
- Isolation: every invocation gets its own `mkdtemp`-created build root
  (`<tmpdir>/md-render-build-*`) holding an isolated `MICROWEBSTACKS_STORE_PATH`,
  `MICROWEBSTACKS_DB_PATH`, and staging `MICROWEBSTACKS_OUTDIR`. The
  consumer's `--out-dir` is only ever written once, at the very end, by
  copying the finished staged output into it — so a mid-build failure never
  touches `--out-dir` and never touches consumer source. The build root is
  removed in a `finally`, on both success and failure.
- Dotenv precedence was already solved by an existing mechanism, not a new
  one: `src/libs/load-env.js` loads the *workspace's* `.env` with
  `override: true` by default, but honors
  `MICROWEBSTACKS_DOTENV_OVERRIDE=false` (added previously for the VS Code
  extension launcher, for the same reason). `buildEnv()` always sets it to
  `'false'`, so a consumer workspace's own `.env` can only fill in keys the
  command deliberately left unset (e.g. `MICROWEBSTACKS_KROKI_SERVER`) and
  can never clobber the fixed contract axes (`DOCS_BACKEND`, `DOCS_PROFILE`,
  `DOCS_OUTPUT`) or the isolated paths.
- `assertSafeOutDir` blocks `--out-dir` if it equals or is an ancestor of
  the workspace root, the resolved content directory (from the probe), the
  engine checkout, or a filesystem root — the only ways the final
  copy-in step (which clears `--out-dir` first) could destroy something
  that isn't a previous build of its own artifact. Nesting `--out-dir`
  *inside* the workspace (e.g. `<workspace>/dist`) is allowed and is the
  common case.
- Astro CLI gotcha (not previously exercised in Phase 1's `npx astro build`
  proofs, which passed `--config` unaccompanied by `--root`): Astro resolves
  `--config` as `path.join(root, configFile)` — an **absolute** `--config`
  path silently produces a garbled joined path and fails with
  `[ConfigNotFound]`. The astro-build step now passes `--root <engineRoot>`
  and the bare filename `astro.config.static.mjs`, not an absolute path.
- End-to-end proof: ran `node bin/md-render.js build --workspace . --out-dir
  .tmp/phase2-fixture-out` against this repo's own content as a stand-in
  local consumer (`.tmp/` is already gitignored). Produced a complete
  artifact in one command: `index.html`, `404.html`, one directory per
  catch-all doc, `blobs/` (client + server-rendered diagram sources),
  `_astro/` assets, `favicon.ico`. Inspected then deleted; not committed.

### Deviations from the plan

- None. The provisional command shape in `specification/reusable-render/spec.md`
  (`md-render build --workspace <path> --out-dir <path> [--manifest <path>]
  [--site <url>] [--base <path>]`) was implemented as written.

### Commands run

```text
node --test "test/**/*.test.js"                                    # 10/10 pass
node bin/md-render.js build --workspace . --out-dir .tmp/phase2-fixture-out
                                                                     # local fixture proof (pass)
```

### Follow-ups for later phases

- Phase 3 must add `bin/` (and, for the command to run `astro build` inside
  the *published* package rather than this checkout, the Astro source tree —
  `src/pages`, `src/layout`, `src/components`, `astro.config*.mjs` — none of
  which are in `stage-engine.js`'s `RUNTIME_PATHS` today) to the staged
  `@microwebstacks/md-render` package, plus a `bin` field in the generated
  `package.json`, then prove the packed command runs standalone.
- Phase 2's fixture proof ran from this repo checkout (`engineRoot` resolves
  to wherever `render-build.js` physically lives, so this is expected to
  keep working unchanged once staged — only the staging inputs change).
- `defaultBuildSteps` currently treats any nonzero collect/diagrams/build
  exit code as fatal; diagram-render failures for individual assets are
  already non-fatal inside `diagrams.js` itself (it logs and continues), so
  `diagram_failed` in practice means the `diagrams.js` process itself
  crashed (e.g. missing dataset), not a single diagram's render failing.
  Worth calling out explicitly in Phase 5's error-path validation.
