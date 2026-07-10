# Test / Validation: Features Alignment

This is a planning-only packet (no implementation yet), so validation is
document review rather than runtime proof, per `WORKFLOW.md`'s allowance for
planning-only changes.

## Review performed

- Two independent read-only research passes were run against each codebase:
  - Ours: `packages/vscode-extension/`, `packages/md-render/`, root
    `readme.md`, and the 10 prior planning packets under `plans/` that
    describe already-shipped or already-decided behavior (file tree, TOC
    controls, diagram toolbar, mermaid rendering, marketplace readiness,
    lite runtime/parity).
  - Theirs: `C:\dev\github\shd101wyy\vscode-markdown-preview-enhanced`
    (`package.json` contributes/commands/keybindings/configuration,
    `CHANGELOG.md`, `gulpfile.js`, `yarn.lock`).
- Each claim in `comparison.md` is traceable to a specific file (and line
  number where practical) cited in the research; ambiguous points (e.g. MPE's
  `crossnote` engine internals, which are not vendored into the cloned
  checkout) are explicitly flagged as inferred rather than confirmed.
- `plan.md`'s open points (`OP-001`..`OP-006`) were cross-checked against
  existing packets to avoid contradicting already-accepted decisions:
  - `OP-001` (engine vendoring) cross-checked against
    `plans/2026-06/28-vscode-marketplace-readiness/plan.md`'s "Option B"
    engine-packaging decision — flagged as overlapping, not duplicated.
  - `OP-002`/diagram architecture cross-checked against
    `plans/2026-06/28-mermaid-diagrams/` and
    `plans/2026-06/28-diagram-toolbar/` to confirm the current Kroki-based
    design is accurately described.
  - `OP-004` (scroll sync) cross-checked against the webview/iframe
    architecture described in `packages/vscode-extension/extension.js` to
    confirm the "whole-site render, not per-file DOM" characterization.

## Known gaps in this review

- MPE's `crossnote` dependency was not installed in the local clone, so a
  handful of diagram/export specifics (exact Vega/eBook invocation, full
  diagram-dispatch list) are inferred from `yarn.lock`/`CHANGELOG.md` rather
  than read directly from source. Flagged inline in `comparison.md`.
- No runtime testing was performed (no code changed in this packet).
- Kroki's own supported-diagram-type list was not independently verified
  against our current alias config — called out as a prerequisite check in
  `plan.md` Phase 4 before `OP-002` implementation work begins.

## Result (initial review)

Document review complete; `comparison.md` and `plan.md` were internally
consistent and ready for maintainer triage of the open points.

## Maintainer triage (2026-07-04)

The maintainer reviewed the open points and made the following calls, now
reflected in `plan.md`:

- `OP-001` (engine vendoring): declined — download-on-first-install is an
  accepted tradeoff; clarified as unrelated to the Node.js runtime
  requirement.
- `OP-002` (local Mermaid): out of scope — already in progress elsewhere.
- `OP-003` (math/KaTeX): accepted, scoped as Phase 3.
- `OP-004` (scroll sync): declined, recorded in `comparison.md` only.
- `OP-005` (reload cost): deferred, low value for our use case.
- `OP-006` (keybinding + editor-title button): accepted; keybinding choice
  (`ctrl+k m`) confirmed via an explicit multiple-choice review with the
  maintainer.
- `OP-007` (demo content packaging): recommendation recorded, implementation
  deferred to a future packet.
- Footnotes: confirmed already supported via `remark-gfm@4.0.1`; accepted as
  "add the demo example" work.

## Verification performed after implementation

- `node -e "JSON.parse(require('fs').readFileSync('packages/vscode-extension/package.json','utf8'))"`
  → `valid json`, confirming the new `keybindings`/`menus`/`icon` additions
  didn't break the manifest.
- `pnpm collect` run from the repo root after adding
  `content/examples/footnotes/readme.md`:
  ```
  content-structure: starting collect() [format: sqlite]
  content_dir : C:\dev\MicroWebStacks\astro-huge-doc\content
     searching for files with extensions : *.md
     structure-db(sqlite): materialized 439 blob file(s) (missing=9) -> ...\dataset\blobs
  content-structure: collect() finished (version: CSKNJEP)
  source-tree: indexed 114 entries
  html-cache: cleared
  ```
  No errors. Confirmed the string `footnote` is present in the resulting
  `dataset/content.db`, meaning the new page was ingested.
- Footnote support itself was confirmed by reading source, not by rendering:
  `remark-gfm@4.0.1`'s own readme documents bundled footnote support, and
  `content-structure`'s `src/md_utils.js:164` shows `.use(remarkGfm)` in the
  active pipeline.

## Known gaps

- No full `pnpm dev`/browser visual check was run for the footnotes example
  or the new editor-title button/keybinding — noted as a follow-up risk in
  `implementation.md`.
- Math/formula support (Phase 3) has not been implemented yet; this test
  record will need a follow-up entry once that phase lands.

## Closure verification (2026-07-10)

### Math (Phase 3, `OP-003`)

- Confirmed implemented in commit `b8b65a9` ("added math", 2026-07-05):
  `src/libs/render-math.js` + wiring in `AstroMarkdown.astro`, KaTeX CSS
  self-hosted via the bundler import in `src/layout/Layout.astro`, demo at
  `demo/math.md`.
- Shipped in extension release 0.0.12 (`b4c8b84`); the extension
  `CHANGELOG.md` documents "Inline and block math (`$...$` / `$$...$$`) now
  renders with KaTeX" and `README.md` lists Math as a feature — the feature
  went through a real release, which is the packet's verification signal.
  No offline-stance violation: no CDN URL is involved, the CSS/fonts ship
  with the built site.

### Footnotes render check (previously flagged gap) — FAILED

- Method: rendered the stored items of the `examples/footnotes` document
  from `dataset/content.db` (latest `version_id`) through the exact
  production path — `toHtml(toHast(item.ast))`, as `AstroMarkdown.astro`'s
  `renderAstToHtml` does — via a throwaway Node script.
- Findings:
  - Footnote references render as `<sup><a href="#user-content-fn-…"
    data-footnote-ref …>` — but no element with those ids exists anywhere
    on the page, so every reference is a dead link.
  - Footnote numbering restarts per top-level item (each `toHast` call has
    its own footnote state): the third footnote (`[^source]`) renders as
    "1".
  - Footnote definitions are stored by `content-structure`'s collect as
    plain `paragraph` items — the `footnoteDefinition` wrapper and its
    identifier are gone — so they render as bare unnumbered paragraphs with
    no ids and no back-references, and no footnotes section is emitted.
- Consequence: the earlier "already supported via `remark-gfm`" conclusion
  was true at the mdast level but does not survive the per-item render
  pipeline. Recorded as `OP-008` in `plan.md`; fix deferred to a future
  packet against the sibling `content-structure` repo. Nothing shipped
  claims footnote support (extension README/CHANGELOG checked — no mention).

### Result

Packet closed. Accepted scope (quick wins, footnotes demo content, math) is
implemented and shipped; `OP-007` (demo packaging) and `OP-008` (footnote
rendering) are recorded, recommended, and deferred to future packets.
