# Test notes: zero-clone `npx md-render preview`

Environment: Windows 11, Node v22.21.1, this checkout at `fc0d7d2` plus the
packet's changes.

## Automated

- `node --test "test/**/*.test.js"` - **218 tests, 217 pass, 0 fail, 1 skip**.
  The skip is the pre-existing parity-baseline test ("no built artifact in
  dist/"). New coverage: `test/render-preview.test.js` (20) and
  `test/collect-ignore.test.js` (3).
- `test/render-build.test.js` (10) passes unchanged after the
  `prepareStaticSite()` extraction - that is the backward-compatibility check
  for `md-render build`.
- Preview unit coverage: argument parsing (defaults, positional workspace,
  every flag, `--open`/`--no-open`, unknown flags, missing values, extra
  positionals, bad ports), content-root resolution (bare folder, `--docs-root`
  wins, manifest honoured, manifest pointing nowhere falls back), path
  resolution and traversal rejection, static-file resolution (index, nested,
  implicit `.html`, 404, 403), MIME types, a live server (HTML/JS/CSS/SVG/blob,
  404 page, 405, raw-socket traversal), `port_in_use`, `browsableHost`,
  `openBrowser` per platform plus a failing launcher, and two
  `runPreviewCommand` lifecycle tests (temp root removed on shutdown and
  workspace left untouched; `--no-open`/`--keep` honoured).
- Traversal is asserted over a raw socket, not `fetch`: undici normalizes
  `..` out of the URL before it reaches the wire, so a fetch-based assertion
  passes for the wrong reason.
- Temp-directory hygiene: after a full suite run, `%TEMP%` holds no
  `md-render-preview-*` or `md-render-build-*` directories. Test fixture
  prefixes were renamed (`md-render-ws-`, `md-render-keep-`) so they cannot be
  mistaken for build roots by the leak assertion.

## Browser / PhotoSwipe

`node scripts/check-preview-gallery.js` (also `pnpm test:preview-gallery`) -
**9/9 checks passed**. It builds a three-image fixture through the real
command, serves it, and drives Chromium: gallery renders 3 items, PhotoSwipe
CSS loaded, click opens the lightbox on slide `1 / 3`, next → `2 / 3`, prev →
`1 / 3`, close dismisses it, site chrome hydrated, no console or page errors.

The first draft asserted navigation by comparing `.pswp__img` src and failed;
that was the assertion's fault, not the renderer's - PhotoSwipe keeps
neighbouring slides mounted and fills their `src` asynchronously. The counter
is the reliable signal. Verified by dumping the live DOM before/after a next
click (counter moved `1 / 2` → `2 / 2` while the first `.pswp__img` stayed put).

The link-preview iframe handoff is covered by the pre-existing
`test/gallery-deep-link.test.js` ("preview gallery clicks bypass nested
PhotoSwipe and use the validated handoff"), which still passes. No new test
was needed there.

## Real command, source checkout

`node bin/md-render.js preview <fixture> --port 45219 --no-open` against a bare
folder outside the repo:

```text
fixture/
  README.md            (link, python code block, 3-item gallery fence)
  decisions/adr-001.md
  shots/one.png, two.png
  node_modules/left-pad/readme.md
```

- Build succeeded: 4 pages in 50.1 s; server came up at the printed URL.
- `/` → 200 (README.md is the landing page), `/decisions/adr-001/` → 200,
  `/nope/` → 404.
- Home page carries the gallery markup, `pswp` hooks, the PhotoSwipe
  stylesheet, the highlighted code block, and both blob images.
- `/_astro/*.css` → `text/css`, `/_astro/*.js` → `text/javascript`,
  `/blobs/*.png` → `image/png`, all 200.
- Raw-socket `GET /../../../Windows/win.ini` → `HTTP/1.1 403 Forbidden`.
- `node_modules/left-pad/readme.md` was **not** collected.
- The fixture folder still contained exactly its four original entries - no
  store, dist, or database written into it.

## Packed tarball (OP-001 and the packaging bug)

Measured on this machine, engine version staged as 0.0.25:

| Measurement | Value |
| --- | --- |
| Staged tree | 429.6 MB, 28,396 files (budget 460 MB) |
| Packed tarball | **108.4 MB**, 28,383 files |
| Cold `npm install <tarball>` into an empty project | **~4 min** (238 s and 244 s across two runs), 627 packages |

Staging needed no new paths: `src/libs/render-preview.js` and the postinstall
script are picked up by the existing `src/libs` and `scripts` entries, and the
staged `package.json` exposes `bin.md-render` as before.

The first install exposed the packaging bug described in `implementation.md`.
Sequence of runs:

1. Plain tarball install → `Rollup failed to resolve import
   "content-structure/src/identity.js"`.
2. With a vite alias to the vendored copy → resolves, then fails on
   `better-sqlite3` pulled in through `sqlite_utils` (the alias defeats
   `ssr.external`). Alias reverted.
3. Renaming the whole `_modules` tree to `node_modules` → `esbuild` "Host
   version 0.25.12 does not match binary version 0.27.7" (two dependency trees).
4. Only `content-structure` placed in the package's `node_modules` → **full
   success**. This is what the postinstall now does.
5. Clean re-stage → re-pack → fresh `npm install` in an empty project: the
   postinstall ran on its own (`content-structure` present under the engine's
   `node_modules/`), and `md-render preview` from the fixture folder built and
   served: `/` → 200, `/decisions/adr-001/` → 200, PhotoSwipe markup present.

`md-render --help` from the installed `node_modules/.bin` prints both command
usages.

## Known gaps

- **A real Ctrl+C was not exercised.** Windows does not deliver `SIGINT` to a
  process killed programmatically, so the automated runs were force-killed.
  Shutdown cleanup is covered by the two lifecycle unit tests, which resolve
  the injected `waitForShutdown` exactly where the signal handler does, and
  `waitForSignals()` is a plain `process.on('SIGINT'|'SIGTERM')`. A manual
  Ctrl+C in an interactive console is still worth one confirmation.
- **Environment confound:** this machine has a stray
  `C:\Users\wassi\node_modules\content-structure`. Node's resolver walks up to
  the home directory and finds it, so a resolution probe succeeds locally where
  a clean machine's would fail - this is what made the first alias attempt look
  correct while Rollup (which stops at the project root) still failed. The
  landed fix keys off the package layout, not a probe, so it is not affected;
  but that stray directory is worth deleting, since it can mask this class of
  bug in any future test.
- The cold-`npx` path itself (registry download) was not measured; the install
  timing above is from a local tarball, so a real `npx` adds the 108.4 MB
  download.
- `pnpm test:extension` (VS Code integration) was not run; nothing in this
  packet touches the extension's engine acquisition, and the staged
  `postinstall` never executes on its install path.
