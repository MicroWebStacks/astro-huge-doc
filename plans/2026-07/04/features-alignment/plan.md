# Plan: Features Alignment (vs. Markdown Preview Enhanced)

## Problem Summary

We had no structured read on how our VS Code markdown preview extension
compares to the dominant incumbent in this space, "Markdown Preview
Enhanced" (MPE). `comparison.md` in this packet captures a sourced,
row-by-row comparison across install/UX/diagrams/math/export/performance/
config. This plan records the maintainer's triage of that comparison and the
resulting scoped work.

## Goal

Close the highest-impact usability gaps identified in `comparison.md` that
the maintainer accepted, while explicitly declining the gaps that don't fit
our zero-config, folder-based documentation-site identity.

## Scope

- Math/formula rendering (KaTeX), including a demo example.
- Footnotes: demo example added; collect-level support confirmed, but the
  closure-time render check found they don't render as footnotes in the
  app — see `OP-008`.
- Quick UX wins: keybinding and editor-title button for "Open Preview".
- Record a recommendation for demo/sample-content packaging (`OP-007`) as a
  future follow-up, not implemented in this pass beyond today's footnotes
  example.

## Non-Goals

- Local/bundled Mermaid rendering — already in progress under a separate,
  existing plan. Not duplicated here.
- Editor ⟷ preview scroll sync — declined. Our use case is exploring a whole
  documentation site, not side-by-side single-page live editing; kept in
  `comparison.md` for the record only.
- Incremental single-page refresh / debounce instead of full server restart
  on edit — deferred as low value for now; reload-on-save is acceptable
  given our use case. May revisit later, not scheduled.
- Engine vendoring into the VSIX — declined for now. A first-run download is
  an accepted tradeoff against a much larger bundled VSIX. This is a
  separate concern from the Node.js runtime requirement (see below) and does
  not need to be solved to address that requirement.
- Themes/CSS/JS customization hooks, static HTML export, PDF/PNG/eBook/Pandoc
  export, wiki-links, presentation mode, graph/backlinks view, live
  code-chunk execution — all declined; don't fit our zero-config,
  folder-based documentation-site identity (see `comparison.md`).
- Chasing MPE's settings-surface size (~60 settings) — our minimal config
  (effectively one functional setting, `krokiServer`) is a stated design
  goal, not a gap.

## Open Points

- `OP-001` — **Engine vendoring / first-run download.** Declined for this
  pass. Vendoring `md-render` into the VSIX (like MPE vendors `crossnote`)
  would remove the first-run network-install step, but the maintainer is
  fine with that tradeoff versus a much larger bundled VSIX. Important
  clarification: this is **not the same problem** as "the user has no
  Node.js installed at all" — vendoring only removes the download step; the
  engine still runs as a spawned Node process either way. The no-Node-
  runtime gap stays tracked in
  `plans/2026-06/28/vscode-marketplace-readiness`, unaffected by this
  decision.
- `OP-002` — **Local/bundled Mermaid rendering.** Out of scope here — already
  in progress under a separate, existing plan. No duplicate tracking needed
  in this packet.
- `OP-003` — **Math/formula (KaTeX) support.** Accepted. See Phase 1 below.
- `OP-004` — **Editor ⟷ preview scroll sync.** Declined. Kept in
  `comparison.md` for completeness only; not pursued, no future revisit
  scheduled.
- `OP-005` — **Reduce reload cost on edit (debounce + incremental
  single-page refresh instead of full restart).** Deferred as low value.
  Full restart on save is acceptable for a whole-site browsing use case. May
  reconsider later; not scheduled now.
- `OP-006` — **Keybinding + editor-title button for "Open Preview".**
  Accepted and implemented this pass (see Implementation Log below):
  keybinding `ctrl+k m` (chosen to avoid colliding with VS Code's built-in
  Markdown preview bindings `ctrl+shift+v`/`ctrl+k v`), plus an
  `editor/title` icon button (`$(globe)`).
- `OP-007` — **Demo/sample content packaging strategy.** Open, recommendation
  given, not yet scoped as implementation. Question: how should the
  extension show something useful to a first-time user before they've
  pointed it at real docs? Recommendation: bundle a small, trimmed
  sample-docs fixture inside the packaged engine (reusing/trimming
  `content/demo/` and `content/examples/`), so there's always something to
  preview with zero network fetch — this directly matches the maintainer's
  own framing ("pack it in a folder as default that would not need a
  fetch"). This is a separate, sizable packaging decision (what to trim,
  where it ships from, how "Open Preview" falls back to it) and should get
  its own dated plan packet when there's appetite to scope it, rather than
  being folded into this one. In the meantime, new per-feature demo content
  continues to land under `content/examples/<feature>/`, following the
  existing convention (e.g. `content/examples/footnotes/` added this pass) —
  that convention is exactly what a future bundled fixture would draw from.
- `OP-008` — **Footnotes do not actually render as footnotes (found at
  packet closure, 2026-07-10).** The Phase 2 conclusion "already supported
  via `remark-gfm`, no pipeline work needed" holds only at the mdast level.
  The site renders each stored top-level item through `toHast` in isolation
  (`AstroMarkdown.astro`), and `mdast-util-to-hast` only emits the
  footnotes section when references and definitions share one tree. Worse,
  `content-structure`'s collect flattens `footnoteDefinition` nodes into
  plain paragraph items, losing the identifier entirely. Net effect on the
  rendered page (verified against `dataset/content.db` items for
  `examples/footnotes`): references become superscript links to anchors
  that exist nowhere (dead links), numbering restarts per paragraph (a
  third footnote can display as "1"), and definitions appear as bare
  unnumbered paragraphs with no back-references. No shipped claim is
  affected (extension README/CHANGELOG never advertised footnotes; only
  this packet does). A render-side fix in this repo is not possible because
  the definition identifiers are already gone from the stored items — the
  fix belongs in the sibling `content-structure` repo (preserve
  `footnoteDefinition` items with their identifiers, or emit a ready-made
  footnotes section per document), followed by a small render change here.
  Recommendation: scope that as its own dated packet; the existing
  `content/examples/footnotes/readme.md` page stays as the ready test case
  for it.

## Implementation Phases

1. **Quick wins (`OP-006`) — done.** Added `ctrl+k m` keybinding and an
   `editor/title` icon button for `microwebstacks.previewDocs` in
   `packages/vscode-extension/package.json`.
2. **Footnotes (`comparison.md` row) — done at collect level, but see
   `OP-008`.** Confirmed `remark-gfm@4.0.1` (wired in via
   `content-structure`) parses GFM footnotes with no plugin work, and added
   `content/examples/footnotes/readme.md`, verified with `pnpm collect`.
   The closure-time render check then showed the parsed footnotes do not
   survive the item pipeline (`OP-008`) — real support needs a
   `content-structure` change, deferred to a future packet.
3. **Math support (`OP-003`) — done (2026-07-05, commit `b8b65a9`).**
   Implemented differently from the original sketch above, with the same
   outcome: instead of `remark-math`/`rehype-katex` inside
   `packages/md-render`'s remark pipeline, a KaTeX post-processing pass
   (`src/libs/render-math.js`) rewrites `$...$`/`$$...$$` in the HTML
   produced by `toHast`/`toHtml`, wired in via
   `src/components/markdown/AstroMarkdown.astro`. KaTeX CSS is self-hosted
   through the bundler import in `src/layout/Layout.astro` (offline-first
   requirement satisfied, no CDN). The demo landed at `demo/math.md` rather
   than the planned `content/examples/formulas/readme.md`. Shipped in
   extension release 0.0.12 (`packages/vscode-extension/CHANGELOG.md`).
4. **Demo/sample content packaging (`OP-007`) — future, separate packet.**
   Not scheduled here; open a new dated plan when ready to scope what ships
   in a bundled sample-docs fixture and how the extension falls back to it.

## Dependencies and Risks

- Phase 3 (math) introduces new render-pipeline dependencies
  (`remark-math`/`rehype-katex` or equivalent) into `packages/md-render`;
  confirm they don't pull in native modules, consistent with the lite/json
  engine's existing avoidance of native deps.
- `OP-007`'s eventual scope will need to reconcile with whatever the
  existing Mermaid-local-rendering plan (`OP-002`, tracked elsewhere)
  changes about first-run behavior, since both touch "what a new user sees
  immediately."

## Exit Criteria

- Math/formula rendering is implemented, demoed, and verified (Phase 3). ✔
  (commit `b8b65a9`, shipped in extension 0.0.12)
- All open points have a recorded status (declined/deferred/accepted/done)
  in this file — none left silently unscoped. ✔
- `OP-007` has a clear recommendation on record even though implementation is
  deferred to a future packet. ✔
- `OP-008` (footnote rendering gap, found at closure) has its finding and a
  recommendation on record; the fix is explicitly deferred to a future
  packet against `content-structure`. ✔

Packet closed 2026-07-10.
