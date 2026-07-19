# Implementation log — extension performance

## Progress

[#####] Done - all five phases implemented (2026-07-13); lazy lite startup,
section-scoped post-paint navigation, local timing logs, SSR benchmark, link
compatibility, production build, and staged-engine vendoring verified.

## Phase 1 — inspection + measurement infrastructure (2026-07-13)

Files changed:

- `scripts/bench-lite.js` (new) — synthetic-site generator + startup pipeline
  benchmark for the lite/json engine. Generates `.cache/bench/site-<N>/`
  (depth-3 tree, realistic pages with headings, prose, table, code fence,
  mermaid). Times: bare file walk, `collect.js`, `diagrams.js`, dataset load
  (`structure-db-json.js` import + `getDocuments()`), `getSourceEntries()`,
  single `getEntry()`; reports heap growth, `content.json` size, and a total,
  plus a machine-readable JSON line. Uses the same env contract the extension
  gives its children (`DOCS_PROFILE=lite`, `DOCS_BACKEND=json`,
  `MICROWEBSTACKS_*` workspace vars).
- `package.json` — added `bench:lite` script.
- `.gitignore` — added `.cache/`.
- `src/libs/utils.js` — `log_debug` now guards `import.meta.env?.DEV`
  (optional chaining): under plain Node (outside Vite) `import.meta.env` is
  undefined and importing the json backend crashed on first `getEntry()`.
  Behavior inside Astro/Vite unchanged.

Implementation facts:

- Baseline numbers (200/1000/5000 pages) recorded in `plan.md` and `test.md`.
- Mermaid-only diagram content keeps the benchmark network-free (client
  renderer is skipped by `diagrams.js`).
- The dataset-load probe runs in-process via dynamic import after setting env,
  mirroring how the SSR server's first request pays `load()`.

Deviations from plan: none (plan written alongside this phase).

## Phase 2 — decision review (2026-07-13)

Maintainer ruled on every AD/OP item; rulings recorded verbatim-in-substance
in `plan.md`. Consequences folded into the plan (phases 3–5 restructured),
`specification/engine-profiles/spec.md` (lite identity contract: filenames
not frontmatter; no-content-read startup; hash-keyed per-page cache;
section-scoped closed-by-default menu; always-on timing log; monitoring as
deltas, no absolute budgets), and memory. Notable scope changes vs the
original proposals: AD-001 got stricter (no frontmatter reads at all, titles
dropped in lite), AD-002 was superseded (nothing left to make incremental),
OP-001's deep-link break was accepted, OP-005's absolute budgets were
rejected in favor of reference-delta monitoring.

## Phase 3 — adopt content-structure in-repo (2026-07-13)

Files changed:

- `packages/content-structure/` (new) — library source copied from the
  sibling repo at commit `2de04f9` (== npm 2.2.4): `index.js`, `cli.js`,
  `src/**`, `catalog.yaml`, `LICENSE`, plus an adapted `package.json`
  (`private: true`, same name/version/deps) and a provenance `README.md`.
  Byte-identical to the previously consumed npm package (verified by diff,
  see test.md), so full-profile output is unchanged by construction.
- `package.json` — `content-structure: ^2.2.4` → `workspace:*`.
- `scripts/stage-engine.js` — content-structure is no longer resolvable from
  the registry at stage time: it is dropped from the staged dependency list,
  its runtime deps are merged in (its optionalDependencies stay excluded),
  and a new `vendorWorkspaceLib()` copies the workspace source into
  `_modules/content-structure` after the npm vendoring step. `--no-vendor`
  now warns that the source-only package needs content-structure provided
  manually.

Implementation facts:

- `catalog.yaml` must live at the package root — `structure_db.js` loads it
  with a package-root-relative path (first bench run failed with ENOENT until
  it was copied).
- pnpm resolves the workspace package via junction;
  `content-structure/src/sqlite_utils/index.js` subpath imports keep working
  (no `exports` field restricting them).
- Not copied from the sibling repo: `example/`, `docs/`, `.github/`,
  workspace/lockfiles — the adopted package is runtime source only.

Deviations from plan: none.

Follow-ups:

- Full stage-engine vendoring run (`pnpm ext:stage-engine`) is exercised at
  the next engine release; only the dependency-list and copy logic changed.
- OP-006: extend the benchmark to time a real SSR first-page request
  (Phase 5).

## Phase 4 — lazy core (2026-07-13)

Files changed:

- `packages/content-structure/index.js` — new `collectDocument(config,
  {entry, markdownText})` export: runs one iteration of the collect pipeline
  (tree/content build, asset annotation, blob attach, image metadata) for a
  single source with no writer/store side effects. Note in the doc comment:
  per-call blob uids are throwaway; callers must re-key blobs by content hash.
- `src/libs/structure-db-lazy.js` (new, ~700 lines) — the lazy lite backend:
  - sync file-level walk (no file contents read): filename-derived identity
    (label = filename w/o ext verbatim; url = slugified path w/o ext, local
    slug rule; readme.md / folder-named file ⇒ folder page, mirroring
    get_url_type); writes `<json_dir>/filetree.json`; re-walks only when
    `<json_dir>/tree.stamp` mtime changes.
  - async `getEntry()`: reads + md5-hashes the file per request; serves from
    in-memory merge, else from `<json_dir>/pages/<sid>.json` record (valid iff
    hash matches AND referenced-asset stats unchanged), else parses via
    `collectDocument` + `buildDocumentRow`, remaps blob uids → content hash,
    writes blob files content-addressed (additive, no rm -rf), persists the
    record, merges into in-memory indexes (grow with visited pages only).
  - query surface mirrors structure-db-json.js; parse-pipeline modules
    (content-structure → remark/jsdom, gray-matter) are dynamically imported
    on FIRST PARSE only — the walk-only startup must not pay the >1 s module
    load (measured; see test.md).
  - frontmatter is stripped (gray-matter) but never used: identity stays
    filename-derived even after deep parse (menu label == page title).
- `src/libs/structure-db.js` — dispatch: json + lite ⇒ lazy backend; json +
  full ⇒ eager content.json backend (static export unchanged).
- `src/pages/[...url].astro`, `src/pages/index.astro` — `await getEntry(...)`
  (plain values from sync backends pass through unchanged).
- `server/server.js` — `GET /__lite/version` (json backend + extension mode
  only): returns reload.stamp/tree.stamp mtimes, no-store.
- `src/layout/Layout.astro` — extension-mode-only inline script polls
  `/__lite/version` every 1 s and reloads the page in place when a stamp
  moves (current URL preserved; purely local).
- `packages/vscode-extension/extension.js` — ensureServer no longer runs
  collect/diagrams (functions removed); logs "Preview ready in N ms". Watcher
  no longer restarts anything: content edits bump `reload.stamp`,
  create/delete/rename additionally bump `tree.stamp` (debounce 300 ms,
  `touchStamps()` into `<storePath>/json/`). Server stays alive across all
  changes.
- `scripts/bench-lite.js` — measures the lazy flow by default (walk+filetree,
  cold/warm getEntry, fresh-process cached entry, heap); `--eager` runs the
  legacy collect+diagrams pipeline for comparison (that path is still what
  static/full do by design).

Implementation facts:

- First end-to-end lazy bench (200 pages, BEFORE deferring parse-dep
  imports): walk log 16 ms but 1350 ms measured — the gap is module loading
  of the parse chain (content-structure → jsdom/remark) at import time; cold
  parse of one page 25 ms, warm 1 ms. Deferring the imports to first parse
  was implemented. Final re-measurement dropped the walk to 47 ms at 200
  pages and 181 ms at 5000 pages; the remaining cold cost is one requested
  page's parser import + parse, not a whole-site collect.
- Blob uids are content hashes in lazy records — records from independent
  parses and previous runs merge without collisions; blobs dir is additive.
- Cards.astro uses sync getDocument only ⇒ degrades gracefully (no
  frontmatter meta in lite); no other getEntry call sites than the two pages.

Deviations from plan: live in-place reload (poll `/__lite/version`) was added
beyond the letter of AD-004 — after dropping the server restart, reloading the
whole webview would have bounced the user to the home page on every edit; the
poll keeps the current URL. Local-only, extension mode only.

## Phase 5 — menu UX + local performance log (2026-07-13)

Files changed:

- `src/layout/source_navigation.js` (new) — pure source-entry tree builder.
  It returns only the active top-level section subtree; home returns rendered
  loose root Markdown files. Both Astro and the extension endpoint use the
  same logic.
- `server/server.js` — adds local-only `GET /__lite/navigation`. It reads the
  `filetree.json` already written by the page request (no duplicate database
  instance or second walk), returns the scoped tree, and logs its local timing.
- `src/layout/Layout.astro`, `SideMenu.astro`, `lazy_navigation.js` (new),
  `lazy_navigation.css` (new) — extension pages render the article with a
  closed pages rail first; the rail shows an accessible skeleton while its
  section tree loads, then installs the existing depth/expand interactions.
  Full/static deployments retain server-rendered navigation.
- `src/layout/toc_menu_activation.js` — menu controls can initialize again
  when lazy navigation dispatches its ready event; bindings are idempotent.
- `src/libs/structure-db-lazy.js` — relative Markdown links are resolved
  against source paths and rewritten to filename-derived lite URLs, so links
  such as `../README.md` keep working after the intentional extension-less URL
  change.
- `astro.config.shared.mjs` — `content-structure` and `gray-matter` stay SSR
  externals. This preserves the first-parse dynamic import boundary and avoids
  bundling the jsdom/cssstyle parser chain into the server build.
- `scripts/bench-lite.js` — leaf-page target, cold built SSR HTTP timing,
  relative-link assertion, and live navigation endpoint timing added to the
  human and JSON results.
- `test/layout-navigation.test.js` (new) — active-section and home loose-file
  scoping regression coverage.

Implementation facts:

- The server, tree walk, page parse, and navigation endpoint all print timing
  lines to the extension's existing local output channel. No network reporting
  or telemetry code exists.
- Final 5000-page reference: 181 ms walk, 835 ms cold leaf parse, 1249 ms cold
  SSR response, 20 ms scoped navigation, 0 ms warm entry, 32.1 MB heap growth.
- The production build initially exposed Vite trying to bundle the deferred
  jsdom chain. Making the parse packages runtime externals fixed the build and
  matches the staged engine, which vendors those packages in `node_modules`.
- `pnpm ext:stage-engine` completed against the final build and copied the
  private workspace `content-structure@2.2.4` into `_modules/content-structure`.

Deviations from plan: the post-paint pages menu is served by a small local JSON
endpoint rather than being embedded in the article response. This is the
mechanism that makes the skeleton state real while keeping the article as the
critical response; it stays extension-only and consumes the same filetree
snapshot.
