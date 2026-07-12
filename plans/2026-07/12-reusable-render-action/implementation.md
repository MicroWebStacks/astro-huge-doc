# Implementation Log

## Progress

```text
[####-] Phase 4/5 - thin Action done; validation and handoff (Phase 5) next.
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

## Phase 3 - package and extension isolation

### Files changed

- `scripts/stage-engine.js` - `RUNTIME_PATHS` grew from six entries to
  fourteen: added `bin`, `src/pages`, `src/layout`, `src/components`,
  `public`, `astro.config.shared.mjs`, `astro.config.static.mjs`,
  `tsconfig.json` (everything `md-render build` needs to run a fresh `astro
  build` from the published package, on top of what the extension already
  needed). `astro.config.mjs` - the Node-adapter SSR config - is deliberately
  not staged; the extension only ever runs prebuilt `dist/`. Generated
  `package.json` gained `bin: {"md-render": "bin/md-render.js"}`.
  `EXCLUDED_DEPS` lost `'@google/model-viewer'` (see Implementation facts).
- `package.json` - moved `@rollup/plugin-yaml` from `devDependencies` to
  `dependencies`: `astro.config.shared.mjs` imports it directly, and once
  that file is staged and executed inside the published package, only
  `dependencies` get vendored/installed for a consumer - a `devDependency`
  would silently disappear outside this monorepo.
- `src/libs/render-build.js` - `defaultBuildSteps`'s astro-build step no
  longer hardcodes `path.join(engineRoot, 'node_modules', 'astro',
  'astro.js')`. Added `resolveAstroBin()`, which uses
  `createRequire(import.meta.url).resolve('astro/package.json')` and reads
  the resolved package's own `bin` field. See Implementation facts for why
  the hardcoded path was wrong.

### Implementation facts

- **Astro bin path bug, found by testing a real `npm install`, not the
  vendored path.** Phase 2's fixture proof ran the command against this
  monorepo's own checkout, where `astro` always sits directly under the
  repo's `node_modules`. Phase 3 is the first time the command ran against a
  package installed the way a real npm consumer (or, later, the Action)
  would install it: `npm install <tarball>` in a clean directory. Plain npm
  install hoists dependencies like `astro` to the *consumer's* top-level
  `node_modules`, not nested under `node_modules/@microwebstacks/md-render/
  node_modules/astro` - only the VS Code extension's vendored/renamed
  `_modules` tree happens to keep everything nested, because that path
  reuses `npm install` run *inside* the staged package directory itself
  (`scripts/stage-engine.js`'s `vendorDependencies`), not a normal consumer
  install. The hardcoded nested path crashed with `MODULE_NOT_FOUND` the
  first time it was exercised against a real install. Fixed by resolving
  through Node's own module resolution (`createRequire` from
  `render-build.js`'s own location), which walks up every ancestor
  `node_modules` and finds `astro` correctly regardless of where it landed.
- **`@google/model-viewer` is not an optional, content-gated dependency for
  a full-profile static build - it is unconditional.** `Link.astro` and
  `Code.astro` import `ModelViewer.astro` / `ModelViewerCode.astro`
  unconditionally at module scope, so Vite's client-script bundling pulls in
  `@google/model-viewer` while building the client bundle for *every*
  full-profile static build, whether or not any actual page content embeds a
  3D model. This was invisible through Phase 2's fixture proof, because that
  proof ran with this repo's own full `node_modules`, where
  `@google/model-viewer` is already present as an ordinary root dependency.
  It surfaced the moment the command ran against an isolated install of the
  *staged* package, where `EXCLUDED_DEPS` had stripped it out for the
  extension's lite-only footprint: `astro build` failed at the client-bundle
  stage with `Rollup failed to resolve import "@google/model-viewer"`, even
  though the fixture content was a single plain Markdown file with no 3D
  content at all. Fixed by removing `'@google/model-viewer'` from
  `EXCLUDED_DEPS`. Its own `three` peer dependency (`^0.183.0`, newer than
  this repo's own pinned `three` range) is left unpinned in the engine
  package; npm's default peer-dependency auto-install resolves a compatible
  `three` on its own rather than reusing this repo's older pin.
  `EXCLUDED_DEPS`'s remaining entries (`@octokit/rest`, `adm-zip`,
  `better-sqlite3`, `express-session`, `passport`, `passport-github`,
  `sharp`, `three`, `xlsx`) were re-checked against `collect.js`/
  `diagrams.js`/the static Astro page tree specifically and confirmed
  genuinely unused by the render command's execution path (fetch/auth
  tooling, the sqlite backend the command never selects, and
  `sharp`/`xlsx`, neither of which is imported anywhere under `src/pages`,
  `src/layout`, `src/components`, `src/libs`, `collect.js`, or
  `diagrams.js`).
- Extension VSIX size grew as a direct, expected consequence of the above:
  bundled `engine.tgz` went from ~82 MB / 594 vendored packages (Phase 2
  baseline, before Phase 3's own path additions) to 100.21 MB / 27,048
  vendored dependency files after adding the Astro source tree and
  `@google/model-viewer`+`three`. `pnpm ext:package`'s own bundled-engine
  verification (`verifyVsixBundledEngine` in `scripts/package-extension.js`)
  still passes: the extension's *runtime behavior* is unaffected, since its
  lite/json SSR path only ever executes the prebuilt `dist/` bundle (already
  built with the lite alias substituting an empty module for
  `@google/model-viewer` at `pnpm build` time), never the newly staged Astro
  source tree or the vendored `@google/model-viewer` package itself. This
  matches the plan's own risk table entry ("Engine growth regresses
  extension hydration" -> "reuse staging/package checks and inspect npm
  tarball plus final VSIX"): growth was anticipated and is acceptable as
  long as extension behavior doesn't regress, which this verification run
  confirms it doesn't.
- End-to-end proof, run twice (once before, once after the two fixes above):
  `pnpm build` -> `node scripts/stage-engine.js` (full vendor) -> `npm pack`
  inside `packages/md-render` -> extract the resulting tarball into a clean
  scratch directory -> real `npm install <tarball>` there (no reuse of this
  repo's own `node_modules` or the extension's vendored `_modules` shortcut)
  -> `node node_modules/@microwebstacks/md-render/bin/md-render.js build
  --workspace <fixture> --out-dir <out>` from that clean directory. First run
  (before the fixes) failed at the astro-build stage with the
  `MODULE_NOT_FOUND` bug above; second run (after both fixes, with a fresh
  `npm pack`/`npm install` cycle) succeeded end to end and produced a
  complete artifact (`index.html`, `404.html`, one directory per page,
  `blobs/`, `_astro/` client assets, `favicon.ico`) identical in shape to
  Phase 2's in-repo proof. Scratch install/output directories deleted after
  inspection.
- `pnpm ext:package` (VSIX build + its own internal bundled-engine
  verification) and `node --test "test/**/*.test.js"` (10/10) both re-run
  clean after every change in this phase.

### Deviations from the plan

- None. `EXCLUDED_DEPS`/`RUNTIME_PATHS` are `stage-engine.js` implementation
  details, not part of the accepted OP-001 through OP-009 contract; removing
  `@google/model-viewer` from the exclusion set is required by OP-008 itself
  (full profile is documented to enable GLB/model-viewer rendering), not a
  change to it.

### Commands run

```text
pnpm build                                                          # SSR + dist/ (prerequisite for staging)
node scripts/stage-engine.js                                        # full vendor, run twice (before/after fixes)
npm pack --pack-destination <scratch>                                # inside packages/md-render, run twice
npm install <tarball>                                                # inside a clean scratch consumer dir, run twice
node <installed>/bin/md-render.js build --workspace <fixture> --out-dir <out>
                                                                      # standalone proof; failed pre-fix, passed post-fix
node scripts/package-extension.js                                   # pnpm ext:package equivalent; VSIX verified twice
node --test "test/**/*.test.js"                                     # 10/10 pass
node scripts/check-plans.js                                         # only the pre-existing, unrelated diagram-width-contract flag
```

### Follow-ups for later phases

- Phase 4's Action should install the published engine with a plain
  `npm install @microwebstacks/md-render@<pinned-version>` (or equivalent),
  matching the real-consumer path this phase proved - not the extension's
  vendored `_modules` shortcut, which is VS Code-specific.
- Phase 5's VSIX inspection should note the new ~100 MB engine.tgz size
  explicitly as a baseline, since it is now dominated by
  `@google/model-viewer`+`three` (needed for the render command) rather than
  purely lite/json runtime weight.
- No consumer-facing dependency gap remains from this phase: unlike the
  draft note this section replaces, `@google/model-viewer` is now vendored
  unconditionally, so full-profile static builds no longer fail regardless
  of whether content embeds a 3D model.

## Phase 4 - thin Action

### Files changed

- `action.yml` (new, repo root) - thin composite Action per OP-003. Inputs:
  `engine-version` (required, no default - see Implementation facts),
  `node-version` (default `'22'`), `workspace` (default `'.'`), `out-dir`
  (default `'dist'`), `manifest`/`site`/`base` (optional). Outputs:
  `artifact-path`, `engine-version`. Four steps: (1) validate
  `node-version` is numeric and >=22, failing with `::error::` otherwise;
  (2) `actions/setup-node@v4` with that version; (3) install the pinned
  engine into an isolated `"$RUNNER_TEMP/md-render-engine"` prefix and
  verify `bin/md-render.js` exists post-install; (4) print engine/node
  versions, then run `md-render build` with the mapped inputs and write
  `artifact-path` to `$GITHUB_OUTPUT`. No `permissions:`, no checkout, no
  upload/deploy step.
- `.github/workflows/render-example.yml` (new) - `workflow_dispatch`-only
  reference workflow: `actions/checkout@v4` -> this Action (`uses: ./`,
  `engine-version` left as an explicit `REPLACE_WITH_PINNED_ENGINE_VERSION`
  placeholder) -> `actions/upload-pages-artifact@v3` (using the Action's
  `artifact-path` output) -> `actions/deploy-pages@v4` in a second job with
  `pages`/`id-token` permissions and a `github-pages` environment. Not
  wired to run on push/PR; does not deploy this repository's own site.
- `specification/reusable-render/spec.md` - added a "GitHub Action
  contract" section documenting `action.yml`'s inputs/outputs, the
  no-default rationale for `engine-version`, the isolated-prefix install
  path, the Node-version gate, and the ownership split with the example
  workflow, before this section existed anywhere else.

### Implementation facts

- **`engine-version` has no default, unlike OP-004's provisional phrasing
  ("defaulted to the version tested with the Action release").** Checked
  the npm registry directly (`npm view @microwebstacks/md-render versions
  --json`): versions `0.0.1`-`0.0.9` are already published, all predating
  this packet's Phase 3 `bin/` addition - none of them contain the `build`
  command at all. Defaulting to any of them would look reasonable in
  `action.yml` and fail obscurely the first time anyone actually used the
  default. Since this phase does not publish, tag, or release anything (a
  stated non-goal), there is no real "version tested with this Action
  release" yet to default to. Made `engine-version` `required: true` with
  no default instead - GitHub Actions itself fails the step immediately
  with "Input required and not supplied" if a caller omits it, which is a
  clearer failure than a silently-wrong default. Recorded as a deviation
  below; a future Action release process can add a default once a real
  tagged release has a matching validated engine version.
- **`--omit=optional` breaks the build step - found by actually running the
  Action's install command, not assumed from Phase 3.** First proof attempt
  copied the exact flags `scripts/stage-engine.js`'s `vendorDependencies`
  uses (`--omit=dev --omit=optional`) into `action.yml`'s install step, on
  the assumption that "install the engine's dependencies" is the same
  operation in both places. It is not: the extension's vendored tree is
  only ever used to run prebuilt `dist/` (no Vite/Rollup build ever runs
  against it), but the render command's `astro-build` step runs a real
  `astro build`, which invokes Rollup and esbuild - both of which resolve
  their native binaries (e.g. `@rollup/rollup-win32-x64-msvc`) through
  npm's optional-dependency mechanism. `npm install --omit=optional`
  silently produced a 608-package install with no Rollup native binary,
  and `astro build` failed with `Cannot find module
  '@rollup/rollup-win32-x64-msvc'` (a recognized npm optional-deps
  footgun, npm/cli#4828) - reproducing exactly on a packed-tarball install
  what a real Action run would hit. Fixed by dropping `--omit=optional`
  from `action.yml` (kept `--omit=dev`, which is inert since the staged
  package.json has no `devDependencies` but documents intent); a second
  install of the same tarball added 663 packages (55 more than the broken
  install) and the subsequent build succeeded.
- **Composite-action steps were proved by literally running their `run:`
  bodies, not by re-deriving equivalent commands.** No `act` (nektos/act)
  binary was available locally, and this phase's non-goals forbid
  publishing/tagging/pushing to actually trigger a real Actions run.
  Instead, each `run:` block in `action.yml` was executed locally exactly
  as written, with only the package spec swapped from
  `@microwebstacks/md-render@<version>` (registry) to the Phase 3-staged
  package's own `npm pack` tarball path - a legitimate, interchangeable
  npm package-spec form, not a different code path. Sequence: `npm pack`
  inside `packages/md-render` -> `npm install --prefix
  "<scratch>/md-render-engine" --omit=dev --no-audit --no-fund
  <tarball>` (the install step's exact command) -> `node
  "<prefix>/node_modules/@microwebstacks/md-render/bin/md-render.js"
  build --workspace <fixture> --out-dir <out>` (the build step's exact
  invocation shape) against a two-page scratch fixture
  (`content/index.md`, `content/other.md`). Produced `index.html`,
  `404.html`, one directory per page (`other-page/`,
  `phase-4-fixture-home/`), `blobs/`, `_astro/` client assets, and
  `favicon.ico` - the same artifact shape Phase 2 and Phase 3 already
  proved from the direct command, confirming the Action's install+build
  steps are not a second, divergent path to the same result.
- A `--base` proof run (still via the tarball-install engine) showed every
  link in the output consistently prefixed with the passed base value, but
  the value itself arrived at Node as `/C:/Program Files/Git/demo-base/`
  instead of `/demo-base/` - Git Bash's MSYS layer rewrites any
  leading-slash CLI argument into a Windows path before the child process
  ever sees it, independent of this repository's code. A follow-up attempt
  with `MSYS_NO_PATHCONV=1` fixed the argument but then mis-rewrote the
  engine bin's own already-Windows-style path instead, since that variable
  disables path conversion for the whole command line, not selectively.
  Confirmed by reading `src/libs/render-build.js`: `--base` is plumbed
  straight into `MICROWEBSTACKS_BASE`, the same env var Phase 1 already
  proved end-to-end (blob links, favicon, nav/section links, active-link
  highlighting) - the CLI flag is not a separate code path, so Phase 1's
  proof already covers the logic this run exercised. Recorded as a known
  Windows-Git-Bash test-harness limitation, not a product gap; a real
  Actions runner's `bash` has no such argv rewriting.
- `node --test "test/**/*.test.js"` (10/10) and `node scripts/check-plans.js`
  (only the pre-existing, unrelated `2026-07-12-diagram-width-contract`
  flag) both re-run clean after this phase's changes.

### Deviations from the plan

- `engine-version` has no default, where OP-004's provisional text
  describes one. See Implementation facts: nothing publishable exists yet
  to default to, and a required input with a clear platform-level failure
  is safer than a default guaranteed to be wrong today. This does not
  reopen OP-004 - "install an exact engine version" and "print both
  versions" are both implemented as accepted; only the specific default
  value is deferred to a real release process.

### Commands run

```text
npm view @microwebstacks/md-render versions --json                  # confirmed 0.0.1-0.0.9 published, all pre-bin/
node scripts/stage-engine.js                                        # reused Phase 3's already-current staging (no source diff)
npm pack --pack-destination <scratch>                                # inside packages/md-render
npm install --prefix <scratch>/md-render-engine --omit=dev --omit=optional --no-audit --no-fund <tarball>
                                                                      # action.yml's original install step; 608 packages
node <engine>/bin/md-render.js build --workspace <fixture> --out-dir <out> --base /demo-base/
                                                                      # failed: Rollup native binary MODULE_NOT_FOUND
npm install --prefix <scratch>/md-render-engine2 --omit=dev --no-audit --no-fund <tarball>
                                                                      # fixed install step; 663 packages
node <engine2>/bin/md-render.js build --workspace <fixture> --out-dir <out>
                                                                      # passed; full artifact produced
node --test "test/**/*.test.js"                                     # 10/10 pass
node scripts/check-plans.js                                         # only the pre-existing, unrelated diagram-width-contract flag
```

Scratch fixture/pack/install/output directories were removed after
inspection; not committed.

### Follow-ups for later phases

- Phase 5's Action-vs-direct-command comparison should reuse this phase's
  fixture-and-tarball technique (no `act`, no registry publish) unless a
  real tagged Action release becomes available by then.
- Once a real Action release is cut and a matching engine version is
  published, revisit whether `engine-version` should gain a default
  pointing at that release's validated engine version (see Deviations).
- Phase 5's subpath browser check (already flagged as outstanding since
  Phase 1) should run on Linux or otherwise avoid Windows Git Bash's argv
  path-rewriting, so `--base`/`--site` values aren't incidentally mangled
  the way this phase's local proof was.
