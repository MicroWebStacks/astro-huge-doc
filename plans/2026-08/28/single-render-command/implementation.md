# Implementation: zero-clone `npx md-render preview`

## Progress

```text
[########] Done - preview command, shared build extraction, collect ignore
list, packaging fix, tests and docs all landed and verified from a packed
tarball.
```

## Files changed

- `src/libs/render-build.js` - extracted `prepareStaticSite()`; added
  `probeContentRoot()`, a `docsRoot` field on `buildEnv()`, and a
  `cleanupOnFailure` option; `runBuildCommand()` now sits on top of the shared
  operation and keeps its previous behaviour.
- `src/libs/render-preview.js` (new) - argument parsing, content-root
  resolution, static server, browser launch, signal handling, cleanup.
- `bin/md-render.js` - `build`/`preview` dispatch, per-command usage, `--help`.
- `packages/content-structure/src/collect.js` - `DEFAULT_IGNORE` and an
  `ignore` option on the content glob.
- `astro.config.shared.mjs` - **reverted**; see "Deviations".
- `scripts/postinstall-content-structure.js` (new) and `scripts/stage-engine.js`
  - the published package now lifts `content-structure` out of `_modules/` on
  install.
- `scripts/check-preview-gallery.js` (new) + `package.json` script
  `test:preview-gallery` - the browser/PhotoSwipe proof.
- `test/render-preview.test.js` (new, 20 tests), `test/collect-ignore.test.js`
  (new, 3 tests).
- `readme.md` - "preview any Markdown folder" section under `# Usage`.
- `specification/reusable-render/spec.md` - "Local preview contract",
  ownership and non-goals updated, `Command contract` renamed to `Build
  command contract`.

## Implementation facts

- One pipeline, two commands. `prepareStaticSite()` owns workspace/engine
  resolution, the `mkdtemp` build root, config probing, content validation and
  the collect/diagrams/astro-build steps, and hands back
  `{engineRoot, workspaceRoot, contentRoot, buildRoot, outDir, cleanup}`. Its
  `onResolved` hook is how `build` still rejects an unsafe `--out-dir` before
  paying for a build. `build`'s observable behaviour and its ten existing tests
  are unchanged.
- Content root (OP-003): `--docs-root`, else a manifest whose named folder
  exists, else the workspace root. Implemented by injecting
  `MICROWEBSTACKS_DOCS_ROOT=.`; `config.js` is untouched. The manifest branch
  costs one extra `config-probe` spawn and only runs when a manifest file is
  actually present.
- `--port 0` was added as "pick any free port" (the printed URL comes from
  `server.address()`, so it is always correct). It was not in the plan; it
  fell out of needing ephemeral ports in tests and is the friendliest answer
  when 4321 is taken.
- Collect ignore (OP-002) is a shared-collector default, overridable via
  `collect.ignore`. The planned `**/.*/**` rule was dropped: glob's default
  `dot:false` already skips hidden directories, so shipping that pattern would
  have been dead code that looked load-bearing. Verified against a fixture with
  `.git/`, `.venv/`, `node_modules/`, `dist/`, `build/`, `out/`, `target/`,
  `vendor/`, `__pycache__/` and `coverage/`.
- The `preview` static server is `node:http` only. No dependency was added, so
  the excluded-dependency list is intact.
- The link-preview iframe handoff needed no new test: `test/gallery-deep-link.js`
  already asserts that preview-mode gallery clicks bypass nested PhotoSwipe,
  and it still passes.

## The packaging bug this feature uncovered

`md-render` had never actually been run from a packed tarball, and it did not
work. `content-structure` is a private workspace package that is never
published; the tarball carries it inside `_modules/` (npm's packer refuses any
directory named node_modules). The VS Code extension renames that tree back
after extracting and never runs npm, so it was fine - but an `npm install` /
`npx` consumer gets registry dependencies installed and `_modules/` left as-is,
and the Astro build dies resolving `content-structure/src/identity.js`. This
affected `md-render build` too; `preview` is simply the first thing to exercise
the path end to end.

Fix: a `postinstall` on the *staged* package copies `_modules/content-structure`
into the engine's own `node_modules/`, without its nested dependency tree -
stage-engine already declares content-structure's runtime deps as md-render's
own, so they resolve upward from the consumer's top-level install. The source
repo's package.json gains no postinstall, and the extension is unaffected
(it never runs npm).

## Deviations

- **An `astro.config.shared.mjs` alias was tried and reverted.** Aliasing
  `content-structure` to the vendored copy did fix the first resolution error,
  but it pulls the package *inside* the bundle and so breaks the deliberate
  `ssr.external` boundary documented there - the next failure was
  `better-sqlite3` being dragged in through `sqlite_utils`, and bundling jsdom
  would have been next. Keeping the package external and making it resolvable
  is the correct shape.
- Renaming the whole `_modules` tree to `node_modules` (what the extension
  does) is **not** viable for an npm consumer: it leaves two complete
  dependency trees side by side and fails with `esbuild` host/binary version
  mismatch. Only content-structure is copied.

## Follow-up risks

- The postinstall is skipped by `npm install --ignore-scripts`; such a consumer
  gets the original resolution error. The script warns rather than failing the
  install.
- Every `preview` invocation pays a full Astro build (~40-50 s for a
  three-page fixture on this machine). Watch mode remains out of scope.
- OP-001 measurements are recorded in `test.md`: 108.4 MB packed, 429.6 MB /
  28,396 files staged, ~4 min for a cold `npm install` of the tarball. Whether
  to split the vendored tree into a separate package for npm consumers is
  still available as a follow-up; nothing here depends on it.
