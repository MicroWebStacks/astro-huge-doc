# Implementation Log: Features Alignment

## Progress

```text
[######] Closed 2026-07-10 - phases 1-3 done (math shipped in 0.0.12);
         OP-007 and the OP-008 footnote gap deferred to future packets.
```

## Changes made

- `packages/vscode-extension/package.json`:
  - Added `contributes.commands[].icon: "$(globe)"` to
    `microwebstacks.previewDocs`.
  - Added `contributes.keybindings`: `ctrl+k m` bound to
    `microwebstacks.previewDocs` when `editorLangId == markdown`. Chosen over
    `ctrl+shift+v` (VS Code's built-in Markdown preview binding, would cause
    a command-picker collision) and `ctrl+alt+p` (less discoverable) —
    maintainer confirmed via explicit review.
  - Added `contributes.menus["editor/title"]`: navigation-group icon button
    for `microwebstacks.previewDocs`, gated on `editorLangId == markdown`.
- `content/examples/footnotes/readme.md`: new demo example (frontmatter
  `title: Footnotes`, `order: 21`, slotted between `Notes` (20) and `Iframe
  Directive` (25)). Demonstrates a reused footnote reference, a
  multi-paragraph footnote, and a citation-style footnote.
- Phase 3 (math, `OP-003`) landed on 2026-07-05 in commit `b8b65a9` ("added
  math") and shipped in extension release 0.0.12 — recorded here at closure
  because this log wasn't updated when the commit landed:
  - `src/libs/render-math.js` (new): KaTeX post-processing pass over
    rendered HTML — walks text outside tags, converts `$...$` (inline) and
    `$$...$$` (display) via `katex.renderToString` with
    `output: 'htmlAndMathml'`, `throwOnError: false`; handles escaped `\$`
    and HTML entities; leaves unmatched delimiters untouched.
  - `src/components/markdown/AstroMarkdown.astro`: `renderAstToHtml` now
    pipes `toHtml(toHast(ast))` through `renderMathInHtml`.
  - `src/layout/Layout.astro`: `import 'katex/dist/katex.min.css'`
    (self-hosted via the bundler — no CDN) plus `.katex-display` overflow
    styling.
  - `demo/math.md` (new): inline/block formula demo; `package.json` gained
    `katex@0.16.47`.

## Decisions

- Footnotes required **no rendering-pipeline code change**. Verified that
  `content-structure@2.2.4` (the dependency `packages/md-render` uses for its
  remark pipeline) wires in `remark-gfm@4.0.1`, and GFM footnote support has
  been bundled into `remark-gfm` since v4 — confirmed by reading
  `node_modules/.pnpm/remark-gfm@4.0.1/node_modules/remark-gfm/readme.md`
  and `content-structure`'s `src/md_utils.js` (`.use(remarkGfm)` at line
  164). This corrected an earlier research pass that missed the plugin
  because it's a transitive dependency, not a direct one in
  `packages/md-render/package.json`.
- Engine vendoring (`OP-001`) declined for this pass — see `plan.md` Open
  Points for the full rationale (accepted download-vs-bundle-size tradeoff,
  and clarified it's unrelated to the Node.js-runtime requirement already
  tracked in `plans/2026-06/28-vscode-marketplace-readiness`).
- Local Mermaid rendering (`OP-002`) intentionally not touched — confirmed
  with the maintainer that it's already in progress under a separate,
  existing plan.
- Scroll sync (`OP-004`) and reload-cost/debounce work (`OP-005`) declined
  and deferred respectively — recorded in `comparison.md` and `plan.md` but
  no implementation scheduled.
- Demo/sample-content bundling (`OP-007`) recorded as a recommendation only;
  scoping deferred to a future dated plan packet.
- Math (`OP-003`) was implemented as an HTML post-processing pass in the
  site app rather than the planned `remark-math`/`rehype-katex` plugins in
  `packages/md-render` — this fits the per-item `toHast` rendering
  architecture (no remark pipeline runs at render time) and keeps
  `content-structure` untouched. Demo location deviated too: `demo/math.md`
  instead of the planned `content/examples/formulas/readme.md`.
- Footnote render check (the follow-up risk flagged below) was performed at
  closure on 2026-07-10 and **failed** — footnotes do not render as
  footnotes in the app. Root cause and recommendation recorded as `OP-008`
  in `plan.md`; fix deferred to a future packet against the sibling
  `content-structure` repo, since the stored items no longer carry the
  footnote definition identifiers a render-side fix would need. The demo
  page stays as the test case for that packet.

## Follow-up risks

- ~~Phase 3 (math/KaTeX) is not yet started~~ — done, see above.
- ~~No visual/browser check was performed for the footnotes example~~ —
  check performed at closure (see `test.md`); result was a real rendering
  gap, now tracked as `OP-008` in `plan.md`.
