# Implementation Log: Features Alignment

## Progress

```text
[##----] Phase 2/4 - quick wins + footnotes done; math support (Phase 3) next.
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
  tracked in `plans/2026-06-28-vscode-marketplace-readiness`).
- Local Mermaid rendering (`OP-002`) intentionally not touched — confirmed
  with the maintainer that it's already in progress under a separate,
  existing plan.
- Scroll sync (`OP-004`) and reload-cost/debounce work (`OP-005`) declined
  and deferred respectively — recorded in `comparison.md` and `plan.md` but
  no implementation scheduled.
- Demo/sample-content bundling (`OP-007`) recorded as a recommendation only;
  scoping deferred to a future dated plan packet.

## Follow-up risks

- Phase 3 (math/KaTeX) is not yet started; `plan.md` scopes it as the next
  step in this same packet.
- No visual/browser check was performed for the footnotes example beyond
  `pnpm collect` succeeding and the raw markdown being persisted into
  `dataset/content.db`. A quick visual check (does the default footnote HTML
  look reasonable with our current CSS, no `.footnotes`/`data-footnote-ref`
  styling was found in `packages/md-render/src`) is worth doing before this
  packet is considered fully closed.
