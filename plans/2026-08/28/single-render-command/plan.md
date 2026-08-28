# Zero-clone `npx md-render preview`

Source brief: [astro-huge-doc-npx-full-preview-handoff.md](astro-huge-doc-npx-full-preview-handoff.md).

## Problem

`bin/md-render.js` today exposes only `build --workspace <path> --out-dir <path>`.
Someone who just wants to *look* at a Markdown folder as the full site has to
pick an output directory, run the build, and then find their own static server.
`src/libs/render-build.js` already does the hard part (engine/workspace
isolation, temp build root, `full + json + static`, Astro resolved from the
installed package), so the gap is a lifecycle wrapper, not a renderer.

## Goal

```bash
cd some-markdown-folder
npx @microwebstacks/md-render preview
```

builds the full site from the current directory into a temporary location,
serves it on localhost, opens the browser, and cleans up on Ctrl+C. No clone,
no manifest, no `content/` directory, no SQLite, no VS Code.

## Scope

- Extract a reusable `prepareStaticSite()` from `runBuildCommand()`; `build`
  keeps its exact current behaviour on top of it.
- New `src/libs/render-preview.js`: arg parsing, docs-root fallback, static
  HTTP server, browser launch, signal handling, cleanup.
- `preview` dispatch in `bin/md-render.js`.
- Unit, integration, and one PhotoSwipe browser test.
- README + `specification/reusable-render/spec.md` update.
- Verify from a packed tarball, not only the monorepo checkout.

## Non-goals

- Watch mode / live reload (phase 2 in the brief).
- Bare `md-render` / `md-render .` aliasing to `preview` — add only once the
  explicit subcommand is proven.
- A SQLite SSR `serve` command.
- Any gallery/PhotoSwipe logic in the CLI. The command only makes the normal
  shared full client bundle reachable; a broken gallery is a shared-render
  regression, fixed where it lives.
- Changing `md-render build` semantics to get the convenience defaults.

## Settled decisions

**No local folder in the user's workspace.** Everything generated goes to
`mkdtempSync(os.tmpdir(), 'md-render-preview-')` with `store/` and `dist/`
inside it, exactly as `build` already stages. Nothing in the pipeline needs a
workspace-adjacent path: the store, JSON dataset, blobs, and diagram output are
all env-anchored (`MICROWEBSTACKS_STORE_PATH`, `MICROWEBSTACKS_OUTDIR`), Astro's
`publicDir` tolerates a missing `<workspace>/public`, and the Astro/Vite caches
live inside the npx-installed package. A `<workspace>/.cache/` directory would
buy nothing for a one-shot build and would violate the brief's "user workspace
is not polluted" criterion. `--keep` skips cleanup and prints the temp path;
if a persistent cache ever becomes worthwhile it belongs to watch mode, where
`.cache/md-render/` under the workspace would be the right home.

**`full + json + static`, unchanged.** `buildEnv()` already fixes
`DOCS_PROFILE=full`, `DOCS_BACKEND=json`, `DOCS_OUTPUT=static` and sets
`MICROWEBSTACKS_DOTENV_OVERRIDE=false` so a stray workspace `.env` cannot move
those axes. Preview inherits it as-is.

**Server: `node:http`, no new dependency.** `express` is in the staged
package's excluded-dependency set; adding it back for a preview server would
undo that. Static file serving with directory to `index.html`, basic MIME
types, traversal rejection, and a clear `EADDRINUSE` message is ~120 lines.

**Browser open: `spawn` per platform**, failure non-fatal, `--no-open` opt-out.

## Command contract

```text
md-render preview [workspace]

  --docs-root <path>   content root inside the workspace
  --manifest <path>    manifest path
  --host <host>        default 127.0.0.1
  --port <port>        default 4321
  --open / --no-open   open the browser (default on)
  --keep               keep the temporary artifact and print its path
```

`workspace` defaults to `.`.

## Content-root precedence

The folder `npx` runs in is the content root. Anything else is opt-in via the
CLI. The only exception is a workspace that is already a configured
astro-huge-doc project, where honouring its own manifest beats rendering its
repository root:

1. `--docs-root` wins, always;
2. otherwise, if a manifest file exists (at `--manifest`, else
   `<workspace>/manifest.yaml`) *and* the root it names exists, use it;
3. otherwise the workspace root itself.

Today `config.js` resolves an absent manifest to `<workspace>/content`
(`DEFAULT_MANIFEST.output.content`), which is why the bare-folder case fails
without step 3. Preview re-runs `probeConfig()` with
`MICROWEBSTACKS_DOCS_ROOT=.` when the fallback applies, and logs the root it
chose. Scoped to `preview`; `build` is untouched.

## Resolved points

### OP-001 - npx download weight (resolved 2026-08-28: document both, no repackaging)

The published tarball vendors the whole dependency tree as `_modules` for the
VS Code extension's node-free install: 427.5 MB across 27,859 files at engine
0.0.24 (`plans/2026-07/31/release-0-0-28/test.md`). An `npx` consumer does not
need `_modules` at all - npm installs the declared `dependencies` for it - so
the first `npx` run pays a very large download for files it will never open.
That works against "as easy as possible".

**Resolution: no packaging change. Offer the user both entry points and let
them choose.** The README documents them side by side:

```bash
npm install -g @microwebstacks/md-render   # pay the download once
md-render preview

npx @microwebstacks/md-render preview      # nothing to install, first run is slow
```

Both fetch the same tarball; the global install keeps it, `npx` caches it under
`~/.npm/_npx` and re-fetches on a version bump or a cleared cache. Phase 8 still
records the measured `npm pack` size and cold-`npx` duration so the README can
state the real first-run wait instead of a vague warning. Splitting into a lean
package plus a vendored one for the extension stays available as a later packet
if the measurement is bad enough to justify it, but nothing here depends on it.

### OP-002 - collect has no ignore list (resolved 2026-08-28: best-effort multi-ecosystem default)

`packages/content-structure/src/collect.js` globs `**/{*.md,...}` under the
content root with no `ignore` option. That is harmless while the root is a
curated `content/` directory, but the whole point of this feature is pointing
the root at an arbitrary folder - which for many people sits inside a repo with
`node_modules/`, `.git/`, `dist/`, or `.venv/` beside the notes. Without an
ignore list the flagship flow can walk a huge tree and collect junk Markdown.

**Resolution: a best-effort default ignore list covering the common
ecosystems, passed to `globStream` in the shared collector and overridable per
workspace.** It lands as `collect.ignore` in `DEFAULT_MANIFEST`, so a workspace
that really does keep documents in a folder named `build` can say so instead of
being second-guessed:

```text
**/.*/**                 every hidden directory: .git, .venv, .tox, .next,
                         .svelte-kit, .gradle, .bundle, .cache, .idea, .vscode
**/node_modules/**       node
**/__pycache__/**        python
**/site-packages/**      python
**/venv/**               python
**/target/**             rust, maven
**/vendor/**             go, php, ruby
**/dist/**               build output
**/build/**              build output
**/out/**                build output
**/coverage/**           test output
```

One hidden-directory rule absorbs most of the per-ecosystem cases; the rest are
the non-hidden output and dependency directories. This is a shared-collector
default rather than a preview special case, because none of these are wanted
content in any profile. Checked before adopting: this repository's own
`content/` tree contains no directory matching the list, so existing content
sets and the recorded parity baselines are unaffected - phase 6 re-runs the
parity harness to confirm.

### OP-004 - the published package could not be installed (found and resolved during implementation)

Not foreseen when this plan was written. `md-render` had never been run from a
packed tarball, and it did not work: the private `content-structure` workspace
package ships only inside `_modules/`, which an `npm install`/`npx` consumer
never renames, so the Astro build could not resolve it. This blocked `build`
as much as `preview`.

**Resolution: a `postinstall` on the staged package copies
`_modules/content-structure` into the engine's own `node_modules/`.** Two
alternatives were tried and rejected - a vite alias (defeats the deliberate
`ssr.external` boundary and drags `better-sqlite3`/jsdom into the bundle) and
renaming the whole `_modules` tree the way the extension does (two dependency
trees, `esbuild` binary mismatch). See `implementation.md` and `test.md`.

### OP-003 - default content root (resolved 2026-08-28: the folder npx runs in)

The question was only ever about a workspace that carries its own
`manifest.yaml`; for a bare folder the intent was never in doubt.

**Resolution: the current directory is the content root by default, other paths
are CLI-only**, with a configured project's own manifest as the single
exception. See "Content-root precedence" above for the three-step rule. No
existence-probing heuristic and no change to `config.js`.

## Phases

1. Extract `prepareStaticSite()` from `runBuildCommand()`; `build` behaviour and
   `test/render-build.test.js` unchanged.
2. `src/libs/render-preview.js`: arg parsing + docs-root resolution (OP-003).
3. Static server (`node:http`) with traversal rejection and port-in-use error.
4. Browser open, `--no-open`, SIGINT/SIGTERM cleanup, `--keep`.
5. `preview` dispatch and usage strings in `bin/md-render.js`.
6. `collect.ignore` default list (OP-002); re-run the parity harness to confirm
   no existing content set loses documents.
7. Unit + integration tests; Playwright gallery test, plus a regression test
   that the link-preview iframe still hands off instead of nesting PhotoSwipe.
8. README (both the global-install and `npx` entry points) and
   `specification/reusable-render/spec.md`; stage, pack, and run the whole flow
   from the tarball in a directory outside this checkout; record the packed
   size and cold-`npx` duration for OP-001.

## Dependencies and risks

- No new runtime dependency. `src/libs` is already staged, so
  `scripts/stage-engine.js` needs no new path.
- Astro build cost is paid on every `preview` invocation; nothing here is
  incremental. Set the expectation in the README and print a "building..." line.
- `resolveAstroBin()` already handles npm's hoisted layout, which is what an
  `npx` install produces; the packed-tarball run in phase 8 is what proves it.

## Exit criteria

- `npx @microwebstacks/md-render preview` in a bare folder of Markdown plus
  images serves the full site on localhost and opens the browser.
- File tree, TOC, highlighting, client Mermaid/PlantUML, and PhotoSwipe
  galleries all work in a normal browser.
- No generated store/dist/db appears in the user's folder; Ctrl+C stops the
  server and removes the temp directory.
- `md-render build --workspace . --out-dir ./dist` behaves exactly as before.
- Verified from a packed tarball outside this repository.
