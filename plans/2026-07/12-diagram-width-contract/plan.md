# Diagram Width Contract

## Goal

Define and enforce one explicit width contract for client-rendered diagrams
(Mermaid, PlantUML) so that a diagram fills the width actually available in
the content column — growing when the nav/TOC panes close — while never
upscaling past its natural 100% size. Make the contract testable so future
layout or renderer changes cannot regress it silently.

## Background and root cause

- `.content` (Layout.astro) is `width: 100%` of `main`; closing the side
  panes genuinely widens the column.
- `.diagram-shell` (DiagramCode.astro) is `width: min(100%, 80ch)`. The 80ch
  literal was copied from the article prose measure (Layout.astro caps `p`,
  `ul`/`ol`, `blockquote` at 80ch) when the shell was introduced in commit
  `abbfdb0`, without a recorded decision.
- Every inner sizing rule (SVG `width`/`max-width: 100%`) is relative to the
  shell, so the shell cap silently bounds all diagram sizing regardless of
  column width.
- No existing packet (28-mermaid-diagrams, 28-diagram-toolbar,
  04-mermaid-client-render, 11-client-puml, 10-ui-audit-polish,
  27-ui-redesign) specifies diagram width behavior; the current behavior is
  emergent, which is why it regressed without any spec violation.

## The contract

Three named width tiers for article content, replacing implicit reuse of one
literal:

1. **Prose measure** — `p`, `ul`/`ol`, `blockquote`: capped at the prose
   measure (80ch) for legibility. Unchanged.
2. **Text code** — standalone code blocks and the shell's code view: capped
   at the prose measure. Code is text; the cap is intentional. Unchanged
   unless later revisited.
3. **Wide media** — diagram shells (client and Kroki/static paths alike):
   may use the full content-column width when the diagram needs it.

Diagram sizing invariants (each one measurable in the browser):

- **I1 — no upscale:** rendered SVG width never exceeds the diagram's natural
  width (the size the renderer authored).
- **I2 — fill:** rendered SVG width equals
  `min(natural width, usable column width)` at every pane state (both open,
  both closed, one open) and after window resize.
- **I3 — aspect ratio:** rendered width/height matches the SVG `viewBox`
  ratio; no distortion at any size.
- **I4 — uniformity:** I1–I3 hold for both Mermaid and PlantUML, in both
  themes, on initial render and on theme-triggered re-render.

## Decisions to review

**Approved 2026-07-12:** D1 = Option B (CSS variable published by the
renderer), D2 = all diagram paths in this packet (client and static shells),
D3 = `--prose-measure` token. Implementation may proceed.

- **D1 — shell growth strategy.** Two candidates:
  - **Option A (simplest):** `.diagram-shell { width: 100% }`. The shell card
    always spans the column; the SVG centers inside at its capped size. Cost:
    a small diagram sits in a wide, mostly empty card, and the shell's code
    view also becomes full-width.
  - **Option B (recommended):** the renderer publishes the diagram's natural
    width as a CSS custom property on the shell
    (`--diagram-natural-width`), and the shell uses
    `width: min(100%, max(var(--prose-measure), var(--diagram-natural-width) + shell-chrome))`.
    Small diagrams keep today's tidy 80ch card; wide diagrams grow up to the
    column. Cost: a few lines of JS per renderer (PlantUML already computes
    natural width; Mermaid exposes it as the SVG's inline `max-width`).
- **D2 — scope of tier 3.** Whether the static Kroki/BlockDiag diagram path
  (same `.diagram-shell`) adopts the contract in this packet or a follow-up.
  Recommendation: same packet — it shares the shell, so it is one CSS change.
- **D3 — token naming.** Replace scattered `80ch` literals with a
  `--prose-measure` token in `tokens.css` (Layout.astro ×3,
  Highlighter.astro, DiagramCode.astro) so the measure is named once and
  greppable.

## Testability

- **Fixtures:** demo pages keep one deliberately narrow/tall and one
  deliberately wide diagram per renderer. `demo/readme.md` already has both
  for Mermaid; add a wide PlantUML example to `demo/plantuml.md`.
- **Verification recipe** (recorded in `test.md` with actual numbers):
  1. Open Demo Home at a desktop viewport with both panes open; record
     `getBoundingClientRect()` width/height of each fixture SVG and of
     `.content`.
  2. Close both panes; re-measure. Assert I1/I2: the wide diagram grew to
     `min(natural, column)`, the narrow diagram did not change.
  3. Assert I3 on both measurements via the `viewBox` ratio.
  4. Toggle theme; re-assert after re-render (I4).
- The recipe is deliberately expressible as a small page-console script so it
  can be re-run after any layout change; a future packet may automate it.

## Non-goals

- Changing the prose or code-block measure.
- Pan/zoom or fullscreen-modal sizing (the modal already manages its own
  sizing).
- Print layout.

## Exit criteria

- The contract tiers and invariants above are implemented and the shell no
  longer hard-caps wide diagrams at 80ch when the column is wider.
- All four invariants verified and recorded in `test.md` at three pane
  states, both renderers, both themes.
- `80ch` appears once, as a named token, instead of five scattered literals.
