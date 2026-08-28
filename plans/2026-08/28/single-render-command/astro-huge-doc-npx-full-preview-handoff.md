# Handoff: zero-clone `npx` full-site preview for `astro-huge-doc`

Repository: `MicroWebStacks/astro-huge-doc`

## Goal

Add a first-class CLI flow that lets a user enter an arbitrary Markdown folder and render the **full astro-huge-doc experience in a normal browser without cloning this repository**.

Target UX:

```bash
cd some-markdown-folder
npx @microwebstacks/md-render preview
```

Expected result:

- current directory is treated as the workspace;
- Markdown can live directly in that directory;
- renderer uses the **full** profile;
- no SQLite/native dependency is required;
- a temporary JSON dataset and static site are generated outside the user's docs;
- a local HTTP server starts;
- the browser opens automatically by default;
- Ctrl+C stops the server and temporary files are cleaned up;
- PhotoSwipe/gallery behavior and the rest of the normal full website UI work;
- no VS Code extension is involved;
- no `astro-huge-doc` checkout is required.

This should be implemented by extending the existing published `@microwebstacks/md-render` CLI, not by creating a separate renderer.

---

## Current state

The repository already has most of the required architecture.

### Existing public CLI

`bin/md-render.js` is already the public executable for the npm package.

Today it supports only:

```bash
md-render build --workspace <path> --out-dir <path>
```

The staged npm package already exposes:

```json
{
  "bin": {
    "md-render": "bin/md-render.js"
  }
}
```

Therefore `npx @microwebstacks/md-render ...` is already the correct distribution mechanism.

### Existing reusable full build

`src/libs/render-build.js` already implements the difficult isolation work:

- engine root and consumer workspace are separate;
- collection runs against an arbitrary external workspace;
- build state goes to a temporary directory;
- Astro is resolved from the installed package;
- the command does not require a source checkout;
- output is static;
- backend is JSON;
- profile is explicitly full.

The existing build environment fixes:

```text
DOCS_PROFILE=full
DOCS_BACKEND=json
DOCS_OUTPUT=static
```

That is exactly the rendering combination recommended for this feature.

Do **not** switch this preview command to the canonical SQLite SSR deployment merely because it is called "full". Full rendering capability and SQLite storage are separate concerns. For an `npx` local preview, `full + json` is the portable choice.

### Current inconvenience

The reusable build command currently requires both:

```text
--workspace
--out-dir
```

and default configuration normally resolves content through the manifest/default content path. For the desired ad-hoc use case, users should not need to create:

- a manifest;
- a `content/` directory;
- a build output directory;
- a repository checkout.

### PhotoSwipe

PhotoSwipe is already part of the shared/full rendering path.

`src/components/gallery/gallery.js` dynamically imports:

```js
import('photoswipe/lightbox')
import('photoswipe/style.css')
import('photoswipe')
```

The only intentional special case is a document rendered inside the site's own link-preview iframe: that mode performs a gallery handoff to the parent rather than nesting PhotoSwipe.

Therefore the new browser preview command should **not add separate PhotoSwipe logic**. Its responsibility is to run the normal full website outside VS Code. If PhotoSwipe does not work in that result, treat it as a normal full-render regression and test/fix the shared rendering path.

---

# Recommended CLI contract

## Primary command

```bash
npx @microwebstacks/md-render preview
```

Equivalent explicit form:

```bash
npx @microwebstacks/md-render preview .
```

Recommended options:

```text
md-render preview [workspace]

  --docs-root <path>    optional content root inside workspace
  --manifest <path>     optional manifest
  --host <host>         default 127.0.0.1
  --port <port>         default 4321
  --open                open browser (default)
  --no-open             do not open browser
  --keep                keep generated temporary artifact for debugging
```

Optional later additions:

```text
  --base <path>
  --site <url>
  --verbose
```

Do not overload the first implementation with watch mode unless it falls out naturally.

---

# Content-root semantics

The important ergonomic requirement is that this works:

```text
notes/
├── README.md
├── architecture.md
├── decisions/
│   └── adr-001.md
└── images/
    └── system.png
```

from:

```bash
cd notes
npx @microwebstacks/md-render preview
```

The preview command should recognize the current workspace itself as the docs root when no stronger project configuration exists.

Recommended precedence:

1. explicit `--docs-root`;
2. explicit/auto-discovered manifest `render.folder`;
3. explicit manifest legacy content setting if applicable;
4. **preview-specific fallback: workspace root (`.`)**.

This is intentionally friendlier than the generic standalone defaults.

Do not change existing `md-render build` semantics just to achieve this. Keep the convenience behavior scoped to `preview` unless there is a strong compatibility-safe reason to generalize it.

Implementation-wise, preview can inject:

```text
MICROWEBSTACKS_DOCS_ROOT=.
```

only when neither CLI nor manifest selected a content root.

---

# Recommended architecture

## Keep one build pipeline

Do not create a new collect/render implementation.

Factor/reuse `render-build.js` so both commands share:

```text
resolve workspace
    ↓
resolve config/content root
    ↓
temporary build root
    ↓
collect
    ↓
diagrams
    ↓
Astro static build
```

Then:

```text
build command
    ↓
copy artifact to requested --out-dir
    ↓
exit
```

while:

```text
preview command
    ↓
retain artifact in temporary directory
    ↓
serve it locally
    ↓
open browser
    ↓
wait for SIGINT/SIGTERM
    ↓
cleanup
```

The preview command should not build into the user's workspace by default.

Example temporary structure:

```text
<os-temp>/
  md-render-preview-xxxx/
    store/
    dist/
```

---

# Suggested refactor

`runBuildCommand()` currently owns both reusable build orchestration and final artifact copying.

Extract a lower-level operation along the lines of:

```js
prepareStaticSite({
  workspace,
  docsRoot,
  manifest,
  site,
  base,
  temporaryRoot?,
  log
})
```

Return something similar to:

```js
{
  engineRoot,
  workspaceRoot,
  contentRoot,
  buildRoot,
  outDir,
  cleanup
}
```

Then:

```js
runBuildCommand()
```

can call it, copy `outDir` to the requested destination, and clean up.

`runPreviewCommand()` can call the exact same operation, serve `outDir`, then clean up when the process terminates.

Avoid duplicating `buildEnv`, config probing, content validation, Astro resolution, or build steps.

---

# Local server

For the first implementation, prefer a tiny Node built-in HTTP server rather than adding another production dependency.

Requirements:

- bind to `127.0.0.1` by default;
- use requested port or `4321`;
- give a clear error if the port is occupied;
- serve files only from the generated static artifact;
- resolve directory routes to `index.html`;
- return correct basic MIME types;
- prevent path traversal;
- support the generated `/blobs/...`, `/_astro/...`, images, CSS, JS, fonts, JSON, SVG, etc.;
- print the final URL.

Typical output:

```text
md-render preview: building full site...
md-render preview: ready at http://127.0.0.1:4321/
Press Ctrl+C to stop.
```

If existing Astro tooling provides a materially simpler and reliable preview-server entry point against the isolated output directory, reusing it is acceptable. The important constraint is that the preview remains self-contained inside the published package and does not require a cloned repo or global tool.

---

# Browser opening

Default behavior should open the local URL once the server is listening.

Support:

```bash
--no-open
```

for CI, remote shells and users who prefer manual navigation.

A dependency is probably unnecessary. A small platform helper can spawn:

```text
Windows:  cmd /c start "" <url>
macOS:    open <url>
Linux:    xdg-open <url>
```

Browser-open failure should be non-fatal. Print the URL regardless.

---

# Signal handling and cleanup

Handle at minimum:

```text
SIGINT
SIGTERM
```

Shutdown sequence:

1. stop accepting HTTP connections;
2. close server;
3. remove preview temporary directory;
4. exit with the appropriate status.

If `--keep` is present, retain the directory and print its location.

Also clean up when build/server startup throws before the server is fully running.

Keep cleanup ownership explicit; do not leave temp stores after normal Ctrl+C.

---

# Do not use SQLite for this feature

Avoid adding the excluded native/server dependencies merely to support local `npx preview`.

The npm engine staging deliberately avoids dependencies such as:

```text
better-sqlite3
sharp
passport
passport-github
express-session
```

The reusable static rendering path exists precisely so consumers can generate the full website without those deployment/storage concerns.

For this feature, use:

```text
DOCS_PROFILE=full
DOCS_BACKEND=json
DOCS_OUTPUT=static
```

This gives the full browser UI while preserving easy npm installation and `npx` portability.

A future command specifically intended to run the canonical long-lived SQLite SSR server can be designed separately.

---

# Full vs VS Code lite

Do not implement this command by launching the VS Code extension engine.

The desired distinction is:

```text
VS Code preview
  lite profile
  embedded webview/panel concerns
  extension-managed lifecycle

npx preview
  full profile
  normal browser
  ordinary web runtime
  no VS Code constraints
```

The new command should exercise the same full site users would get from a static deployment.

That is useful in its own right even if VS Code/full feature parity improves later.

---

# PhotoSwipe acceptance requirement

Include at least one end-to-end fixture containing multiple Markdown images that become a gallery.

The resulting normal browser page must:

1. render the gallery;
2. open PhotoSwipe when an image is clicked;
3. navigate between gallery images;
4. close correctly;
5. load PhotoSwipe CSS;
6. preserve existing gallery/deep-link behavior.

Do not special-case or reimplement gallery behavior in the CLI.

The CLI should merely make the normal shared/full client bundle available.

Also keep a separate test for the existing link-preview iframe behavior so a fix does not accidentally create nested PhotoSwipe instances there.

---

# File-level implementation hints

## `bin/md-render.js`

Extend dispatch from only:

```text
build
```

to at least:

```text
build
preview
```

Keep command-specific usage strings.

Suggested structure:

```js
switch (command) {
  case 'build':
    await runBuildCommand(rest, ...)
    break

  case 'preview':
    await runPreviewCommand(rest, ...)
    break

  default:
    printUsage()
}
```

Potential convenience later:

```bash
md-render .
```

could alias to:

```bash
md-render preview .
```

but implement the explicit subcommand first so behavior remains obvious and scriptable.

## `src/libs/render-build.js`

Refactor the existing reusable mechanics rather than copying them.

Candidates to retain/share:

- `checkNodeVersion`
- configuration probing;
- content validation;
- `buildEnv`
- `resolveAstroBin`
- `defaultBuildSteps`
- engine-root resolution
- temporary build isolation

Extract a lower-level static-site preparation function if needed.

Existing `build` behavior must remain backward compatible.

## New module: `src/libs/render-preview.js`

Recommended home for:

- preview argument parsing;
- preview-specific docs-root fallback;
- static site preparation call;
- HTTP server;
- browser launch;
- lifecycle/signal handling;
- cleanup.

Keeping server/lifecycle code out of `bin/md-render.js` makes it straightforward to unit test.

## `scripts/stage-engine.js`

The new preview module must be included in the staged npm package.

If it lives under the already staged `src/libs` tree, no new path may be necessary.

Do not accidentally introduce a dependency that the staged package does not carry.

## README

Add a top-level local-folder usage example, preferably near the existing reusable rendering / usage documentation:

```bash
cd path/to/markdown
npx @microwebstacks/md-render preview
```

Explain:

- Node 22+;
- full browser renderer;
- workspace defaults to current directory;
- temporary files are outside the docs folder;
- no clone/install required beyond what `npx` performs;
- Ctrl+C stops it;
- `--no-open` for manual browser use.

---

# Tests

## CLI parser tests

Cover:

```text
preview
preview .
preview ./docs
preview --docs-root content
preview . --port 9000
preview . --host 0.0.0.0
preview . --no-open
unknown option
invalid port
missing workspace
```

## Resolution tests

Verify:

- explicit workspace resolves correctly;
- current directory default works;
- `--docs-root` wins;
- manifest-selected root is respected;
- workspace root is preview fallback when no content root is configured;
- `.env` cannot unexpectedly change fixed full/json/static mode;
- engine root never becomes consumer workspace accidentally.

## Server tests

Verify:

- root `index.html`;
- nested directory route;
- JS/CSS;
- SVG/image/blob;
- 404;
- traversal rejection;
- occupied-port error;
- server shuts down cleanly.

## Integration test

Create a temporary consumer folder outside the engine repo:

```text
fixture/
  README.md
  page.md
  image-a.png
  image-b.png
```

Run the same code path used by:

```bash
npx @microwebstacks/md-render preview <fixture>
```

Assert that:

- content collection succeeds;
- full static build succeeds;
- server returns the generated page;
- generated artifact is not written into fixture;
- full-profile client assets are reachable.

## Browser test

Use Playwright if already available in the repository.

Check:

- page renders;
- navigation/tree/TOC work sufficiently to prove normal site hydration;
- click gallery image;
- `.pswp` opens;
- next/previous image works;
- close works;
- browser console has no relevant hydration/module errors.

---

# Acceptance criteria

The feature is done when all of the following work from a directory that is **not** the `astro-huge-doc` checkout.

### Simplest case

Given:

```text
docs/
  README.md
  guide.md
  screenshot.png
```

this is sufficient:

```bash
cd docs
npx @microwebstacks/md-render preview
```

No `manifest.yaml` is required.

### Expected behavior

- package runs through `npx`;
- no repository clone is required;
- full profile is used;
- JSON backend is used;
- normal browser opens;
- site is reachable at a localhost URL;
- file tree and TOC work;
- code highlighting works;
- client Mermaid/PlantUML behavior remains intact;
- galleries use PhotoSwipe;
- assets resolve;
- user workspace is not polluted by generated DB/store/dist files;
- Ctrl+C stops the server;
- temporary files are removed.

### Existing command remains valid

This must continue to behave as before:

```bash
npx @microwebstacks/md-render build \
  --workspace . \
  --out-dir ./dist
```

---

# Recommended implementation order

1. Refactor `render-build.js` only enough to expose a reusable "prepare static full site" operation.
2. Add `render-preview.js`.
3. Add `preview` dispatch to `bin/md-render.js`.
4. Implement current-directory/workspace-root convenience semantics.
5. Add built-in static server.
6. Add browser opening and `--no-open`.
7. Add signal cleanup.
8. Add unit/integration tests.
9. Add PhotoSwipe browser test.
10. Update README/reusable-render specification.
11. Stage/package and test from an actual packed npm tarball, not only from the monorepo checkout.

The packed-package test is important: this feature specifically exists to prove that the engine works when installed independently from the source repository.

---

# Possible phase 2: watch mode

Do not block the first useful release on watch mode.

A later:

```bash
npx @microwebstacks/md-render preview --watch
```

could watch Markdown/assets and rebuild.

Prefer correctness before incremental cleverness:

- debounce changes;
- initially rebuild the isolated static artifact;
- atomically swap served output after a successful build;
- keep serving the previous successful version if a rebuild fails;
- optionally reload the browser with SSE/WebSocket later.

The existing VS Code incremental/lite lifecycle should not automatically be reused because the full static preview has different goals.

---

# Optional CLI sugar after `preview` is stable

Once behavior is proven, consider making:

```bash
npx @microwebstacks/md-render .
```

an alias for:

```bash
npx @microwebstacks/md-render preview .
```

and perhaps:

```bash
npx @microwebstacks/md-render
```

an alias for:

```bash
npx @microwebstacks/md-render preview .
```

That would make the tool feel like a zero-config Markdown-site viewer.

Keep `build` explicit for artifact-producing/CI usage.

---

# Architectural principle

The useful split is:

```text
rendering capability = full/lite
storage backend       = json/sqlite
output mode           = static/server
host environment      = browser/VS Code/deployment
```

For this handoff the intended combination is:

```text
full + json + static + local browser
```

That combination already exists conceptually and in the reusable build code. The requested feature should mostly provide the missing **developer experience and lifecycle wrapper** around it, not introduce a fourth engine architecture.
