# Extension performance — lazy lite-engine startup

## Status

Phase 1 (inspection, benchmark infrastructure, baseline measurements) is done.
Phase 2 is done: the maintainer reviewed AD-001 … AD-008 and OP-001 … OP-006 on
2026-07-13 — every item has a ruling recorded below. Headline outcomes: lite
drops frontmatter entirely (filename-derived labels/slugs, deep-link break
accepted), the dataset splits into a `filetree.json` + per-file records keyed
by content hash, only the currently shown page is watched/re-rendered, and
`content-structure` is adopted into this repo (no more cross-repo releases).
All five phases are implemented. The extension now uses a filename-derived
file tree, hash-keyed per-page records, a persistent preview server, in-place
reload signaling, and a closed-by-default post-paint section menu. Local
per-stage logging and the benchmark's cold SSR request are permanent
regression surfaces; no telemetry was introduced. Final implementation and
verification evidence is in `implementation.md` and `test.md`.

## Problem summary

The VS Code extension (lite profile, json backend, SSR output) parses the
**entire** workspace before showing anything, and re-parses the entire
workspace on **every** file change. On a huge website this is a startup and
edit-loop bottleneck that scales with total site size instead of with what the
user is actually looking at.

The maintainer's stated goal: the extension must be as lazy and
resource-friendly as possible — never spend resources the user does not need
right now. The full sqlite SSR flow remains the always-maintained reference
implementation of full capability and is not the subject of this packet.

## Findings — algorithmic inspection of current behavior

Answer to the headline question — *do we parse all pages on startup and build
the whole json db?* — **yes, and three times over**:

1. **Extension startup runs a full collect before the server starts.**
   `ensureServer()` in `packages/vscode-extension/extension.js` runs
   `scripts/collect.js` then `scripts/diagrams.js` to completion, and only then
   spawns `server/server.js`. Nothing renders until the whole site is parsed.
2. **collect() is full-parse and explicitly non-incremental.**
   `content-structure` `collect()` (sibling repo, `index.js`) globs `**/*.md`
   and, for every file: reads it, runs gray-matter, builds the complete mdast
   AST (`buildDocumentContent`), resolves/stats every referenced asset, hashes
   and copies blobs. The JSON writer (`src/structure_json.js`) states it
   directly: *"A fresh JSON export is non-incremental"* — `finalize()` even
   does `rm -rf blobs/` and rewrites every blob file from scratch.
3. **content.json is serialized three times per startup.**
   The dataset is one monolithic `content.json`: written once by the collect
   writer, then read+rewritten whole by `updateJsonSourceTree()`
   (`scripts/collect.js`), then read+rewritten whole again by
   `scripts/diagrams.js` — even when every diagram is client-rendered and the
   pass has nothing to do.
4. **The server loads the whole dataset into memory on first request.**
   `structure-db-json.js#load()` `JSON.parse`s the entire `content.json` and
   builds Maps over every table. Item ASTs stay as strings and are parsed per
   accessed document (good — the per-page serve path is already lazy), but the
   full dataset is resident regardless of what is viewed.
5. **Every file change repeats the entire pipeline.**
   The watcher (`refreshPreviewAfterChange`) stops the server, re-runs the full
   collect + diagrams, starts a **new server process**, and reloads the
   webview. Editing one word in one file on a 5000-page site costs ~48 s.
6. **The menu tree does not need any of this.** The file tree is driven by
   `source_entries`, which `scripts/source-tree.js` derives from a file-level
   walk — inherently cheap (≤ 100 ms at 5000 pages) — but it is embedded inside
   `content.json`, so it is only available after the full parse completes.

### Side finding — section tree not scoped (menu duplication)

`buildNavigationMenus()` in `src/layout/layout_utils.js` prefers
`buildSectionMenuFromSourceEntries()` whenever `source_entries` exist (always,
in the lite flow). That builder renders **all roots of the whole tree** and
uses the current path only to mark the active node — so the left menu
duplicates the app bar's top-level sections instead of showing the selected
section's subtree. The older docs-derived fallback
(`buildSectionMenuFromDocs()`) *did* scope: it filters to
`doc.url.startsWith(section + '/')`. Scoping was lost when the source-entries
contract replaced it. Tracked as OP-004 / AD-008.

## Measurements — baseline (2026-07-13)

Benchmark: `pnpm bench:lite [--pages N]` (`scripts/bench-lite.js`). It
generates a synthetic site under the git-ignored `.cache/bench/site-<N>/`
(depth-3 tree; each page ≈ 9 headings, prose, a table, a JS code fence, a
mermaid diagram — mermaid-only so no Kroki/network is involved), then times the
exact pipeline the extension runs, using the same env contract
(`DOCS_PROFILE=lite`, `DOCS_BACKEND=json`, workspace-root env vars).

Machine: maintainer's Windows 11 laptop, Node 22, warm filesystem cache.

| Pages | Bare file walk | collect.js | diagrams.js | content.json | Dataset load | Heap after load | **Total to first page** |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 200 | 5 ms | 2.0 s | 0.11 s | 3.3 MB | 46 ms | 8.7 MB | **2.2 s** |
| 1000 | 9 ms | 7.5 s | 0.22 s | 16.6 MB | 146 ms | 39 MB | **7.9 s** |
| 5000 | 92 ms | 46.8 s | 0.67 s | 83.5 MB | 504 ms | 176 MB | **48.0 s** |

Readings:

- **Total startup is also the cost of every single file edit** (full re-collect
  + server restart). 48 s per keystroke-save at 5000 pages.
- **collect() dominates (> 95 %) and scales superlinearly**: ~7.5 ms/page at
  1000 pages, ~9.4 ms/page at 5000.
- **The menu-only floor is 3 orders of magnitude cheaper** than what we
  currently pay before showing anything (92 ms walk vs 48 s pipeline).
- Serving a single page once loaded is effectively free (getEntry ≈ 1 ms) —
  the per-request path is not the problem; startup and refresh are.
- Memory scales with total site size (176 MB heap for 5000 pages) even if the
  user only ever opens one page.

## Goal

Extension startup and refresh cost must be proportional to what the user is
looking at, not to the size of the workspace:

- startup shows the first page + menu tree after file-level work only;
- deep parsing (AST, diagram scan) happens per page, on demand, then cached;
- a file edit re-processes that file only, without a server restart;
- resource ceilings (memory, CPU) stay flat as the site grows.

## Scope and non-goals

- In scope: the lite/json extension flow (collect trigger, dataset shape,
  server load, watcher) and the section-tree menu scoping defect.
- Non-goals: the full sqlite SSR reference flow and the static/GitHub Pages
  build keep their current up-front collect model — for a CI static build,
  parsing everything is the job, not a bottleneck. Shared code may change, but
  their behavior contract must not regress.

## Design decisions (reviewed 2026-07-13 — rulings recorded per item)

- **AD-001 — Lazy per-page parse (parse-on-request).**
  **Ruling: accepted, modified — stricter than proposed.** Lite reads **no
  file content at all** for the menu/startup pass — not even frontmatter.
  Titles from frontmatter are dropped in the lite profile; labels and slugs
  derive from filenames only (see OP-001 for the exact scheme). Rationale:
  the lite target is a standard GitHub-style repo, no reliance on the custom
  practice of titles inside frontmatter. On-demand title upgrades (or a small
  read budget of ~10 files) were considered and rejected for now — they would
  produce visible label glitches. The full AST for a page is produced the
  first time the page is requested, then cached keyed by content hash
  (OP-002).
- **AD-002 — Incremental collect (change-set reuse).**
  **Ruling: superseded.** With frontmatter reads dropped there is no
  file-content pass left to make incremental: the selected page is rendered
  fresh on request, and only the currently shown page is monitored for
  content changes. Nothing else needs watching for *content* — an unshown
  page that changed is caught by its content hash on next visit. The file
  *tree* watcher only reacts to add/delete/rename events (AD-003).
- **AD-003 — Split the dataset monolith.**
  **Ruling: accepted.** The monolithic `content.json` is replaced by
  `filetree.json` (or similar) — file-walk-derived, updated **only** when
  files are added/deleted/renamed — plus per-file content records stored in a
  directory keyed by content hash. Server load and memory become proportional
  to visited pages; triple serialization disappears.
- **AD-004 — In-process refresh, no server restart.**
  **Ruling: accepted.** Keep the server process alive across edits;
  re-process only the affected file and reload the webview.
- **AD-005 — Skip the diagrams pass.**
  **Ruling: accepted, generalized.** All diagrams render lazily at page load
  in the lite flow; there is no site-wide diagrams pass at all in the
  extension pipeline.
- **AD-006 — Perceived-latency ordering.**
  **Ruling: accepted, extended.** Render the page first; keep the side menu
  **closed by default**. If the user opens the menu before the file walk has
  completed, show a skeleton-loading state until it is ready. Populate
  starting with the section the user is currently viewing. The file tree
  shows **only the active section's subtree**; on home it shows only loose
  files at the root that are not under any section.
- **AD-007 — Local performance log as a permanent fixture.**
  **Ruling: accepted.** `pnpm bench:lite` stays as the regression instrument,
  and the extension **always** prints per-stage timings to its local output
  channel (not only in a debug mode). This is strictly a local log: the
  project has a hard no-telemetry policy — nothing is ever collected,
  aggregated, or sent anywhere.
- **AD-008 — Section-scoped side menu.**
  **Ruling: accepted** — folded into the AD-006 ruling above (section subtree
  only; home shows root-level loose files).

Accepted shape, in one sentence: startup = file walk → `filetree.json` →
first page parsed on demand; everything content-derived (AST, diagrams,
labels beyond filenames) is computed per page at view time and cached by
content hash; the only standing watchers are tree add/delete and the
currently shown page.

## Open points (all resolved 2026-07-13)

- **OP-001 — URL derivation without full parse.** **Resolved: the deep-link
  agreement is deliberately broken in lite.** Lite slugs derive from file
  paths only: URL = slugified relative path **without file extension**; label
  = the original filename (spaces and all) without extension. No frontmatter
  slug/title overrides in lite. Consequence, accepted: the same content can
  have different URLs in lite vs full — lite targets standard GitHub-style
  repos where filenames are the identity.
- **OP-002 — Lazy cache keying.** **Resolved: content hash.** A cached
  per-page record is valid iff the file's content hash is unchanged.
  Location stays VS Code workspace storage; size cap/eviction can start
  unbounded (records are per-page-sized) and be revisited once the local
  performance log shows real numbers.
- **OP-003 — Cross-repo ownership.** **Resolved: adopt `content-structure`
  into this repo.** This engine is its only consumer; another round of
  cross-package release/publish pain is not acceptable. The library moves
  into a clearly isolated location — `packages/content-structure/` — as a
  pnpm workspace package keeping its import name, so existing imports don't
  change. The sibling repo is left unmaintained; whether to archive it is a
  future maintainer decision. Implemented as Phase 3.
- **OP-004 — Section-menu scoping behavior.** **Resolved:** the left tree
  shows only the active section's subtree; on home it shows only loose files
  at the root (not under any section). Matches the AD-006/AD-008 rulings.
- **OP-005 — Performance budgets.** **Resolved: no absolute budgets.** The
  numbers proposed here are dropped — no "falling from the sky" absolutes
  that could force design breakage if something turns out impossible. Instead:
  apply best state-of-the-art optimization, then record the achieved numbers
  as **reference values** and track regressions as deltas against them
  (`bench:lite` + the always-on extension timing log, AD-007).
- **OP-006 — First-page SSR render not yet measured.** **Resolved: do it.**
  Extend `bench:lite` with an end-to-end SSR first-page request timing
  (Phase 5) — this is exactly the kind of value OP-005 wants monitored.

## Implementation phases

1. **Inspection + measurement infrastructure** — algorithmic report (above),
   `scripts/bench-lite.js` + `pnpm bench:lite`, `.cache/` gitignored, baseline
   numbers recorded. **Done.**
2. **Decision review** — rulings recorded for AD-001 … AD-008 and
   OP-001 … OP-006 (see above). **Done 2026-07-13.**
3. **Adopt `content-structure` into this repo (OP-003).** Copy the library
   source into `packages/content-structure/` (workspace package, same import
   name, marked `private` — never published again), point the root dependency
   at the workspace, and teach `scripts/stage-engine.js` to vendor the local
   copy into the staged engine's `_modules/` instead of fetching the npm
   release. Full-profile behavior must be bit-identical (existing tests +
   demo dataset). **Done — see implementation.md.**
4. **Lazy core.** In the lite flow: `filetree.json` from the file walk with
   filename-derived labels/slugs (AD-001/OP-001), per-file content records
   keyed by content hash (AD-003/OP-002), per-page parse on request, all
   diagrams lazy at page load (AD-005), in-process refresh with the server
   kept alive (AD-004), watchers reduced to tree add/delete + the currently
   shown page (AD-002 ruling). Full/static flows keep today's up-front
   collect. **Done and verified 2026-07-13 — see implementation.md Phase 4
   and test.md.**
5. **Menu UX + local performance log.** Menu closed by default with
   skeleton-loading state, populated starting from the active section; tree
   scoped to the active section, home shows root loose files
   (AD-006/AD-008/OP-004). Always-on per-stage timing log in the extension's
   local output channel — never telemetry, nothing leaves the machine
   (AD-007); `bench:lite` extended with an SSR first-page timing (OP-006);
   reference numbers recorded in `test.md` as the regression baseline
   (OP-005). **Done and verified 2026-07-13.**

## Dependencies and risks

- **Lite/full URL divergence is now by design** (OP-001): the same workspace
  gets filename-derived, extension-less URLs in lite and frontmatter/
  title-derived URLs in full. Links between pages must keep working in both —
  needs an explicit link-resolution check in Phase 4.
- Adopting `content-structure` (Phase 3) touches the release pipeline:
  `stage-engine.js` must vendor the workspace copy (npm cannot resolve
  `workspace:*`), and the staged engine's dependency list must absorb the
  library's own runtime deps. Verified at next engine release.
- The static/full flows share `collect()`; lazy paths must be additive,
  never changing full-collect output (bit-identical datasets for the same
  input).
- Benchmarks ran on one machine with warm caches; absolute numbers will vary,
  the scaling shape is the finding.

## Exit criteria

- Rulings implemented as recorded above (AD-001 … AD-008, OP-001 … OP-006).
- `pnpm bench:lite --pages 5000`: startup to first page bounded by the file
  walk + one page parse, not by site size; edit refresh re-processes one file
  without a server restart. Achieved numbers recorded as reference values in
  `test.md` (no absolute budgets — OP-005).
- Full-profile collect output unchanged (regression: existing tests +
  identical dataset for the demo content).
- Left menu: section subtree only when a section is active; root loose files
  on home; closed by default with skeleton state while loading.
