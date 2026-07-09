# Implementation: UI design-system consolidation

[######] Done - all six phases from `plan.md` landed (tokens, typography,
radius/spacing, elevation, focus/motion, footer). No follow-up work is
outstanding beyond the visual spot-check noted in `test.md`.

## Changes made

**Phase 4 (Elevation, C7/C8)** — added `--shadow-raised` to `tokens.css`
(`0 1px 3px var(--card-shadow-color)`); applied to `Cards.astro` and
`ButtonDirective.astro`, replacing their `2px 2px 3px 3px` shadows. Left the
`SideMenu.astro` `.depth-controls` inset divider and the `Heading.astro` /
`SubMenu.astro` active-item accent bars untouched — they're decorative
indicators, not elevation (C8 guardrail).

**Phase 5 (Motion, C10)** — added a single global rule to `tokens.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Chosen over wrapping each of the ~11 individual `transition:`/`rotate`
declarations — one rule covers all current and future transitions instead of
requiring every new component to remember the guard.

**Phase 5 (Focus, C9)** — added `:focus-visible` rings (`outline: 2px solid
var(--front-blue)`) to every custom interactive control that lacked one:
Highlighter/DiagramCode toolbar buttons (copy, line-numbers, wrap, expand),
ThemeToggle button, SideMenu depth-controls buttons, SubMenu TOC/page-tree
links, MarkdownTable toolbar buttons, DetailsDirective `<summary>`, and
ButtonDirective's call-to-action link. Where a button sits inside a
`overflow: hidden` toolbar group (Highlighter/DiagramCode), used
`outline-offset: -2px` + `position: relative; z-index: 1` — an outset ring
would otherwise be clipped by the group's rounded-corner overflow.

**Phases 2–3 (Type/Radius/Spacing, C3/C5/C6)** — swapped literal `px`/`rem`
values for `--text-*`, `--radius-sm/md`, and `--space-1..7` across ~20 files
(404, panzoom/panzoommodal, AppBar, Highlighter, DiagramCode, NotesDirective,
SideMenu, SubMenu, Cards/CardsMeta, ButtonDirective, DetailsDirective,
Heading, MarkdownTable.css, Table.astro, Layout.astro, ThemeToggle, gallery).

## Decisions

- **Token mapping for values between two steps** (e.g. `17px`, `6px`, `20px`
  padding): picked the nearer step by absolute pixel distance; ties broken by
  keeping the original visual weight (e.g. AppBar's asymmetric `14px 16px`
  link padding became `--space-3 --space-4`, not both `--space-4`).
- **Left untouched, deliberately:**
  - `2px` and smaller — hairlines, per `tokens.css`'s own comment ("raw px
    only for hairlines").
  - `0px`/`0` — no token needed for zero.
  - `em`-relative values tied to local font-size (inline-code `0.9em`, the
    external-link arrow offset in `Link.astro`, table sort-state `0.95em`) —
    these intentionally scale with their own text, not the block rhythm.
  - The line-number gutter's `calc(1ch + 0.9rem)` / `0.45rem` in
    `Highlighter.astro` — a character-width calculation, not spacing.
  - Decorative accent bars (Heading `::before`, SubMenu `::before`, both
    `border-radius: 2px`) — 2px radius on a 3px-wide bar; token radii would
    look disproportionate. Same exception class as C8's shadow guardrail.
  - `border-radius: 30%` (CardsMeta checkmark) — a circular avatar shape, not
    a corner radius.
- **`--shadow-raised` reuses `--card-shadow-color`** for both Cards and
  ButtonDirective, even though ButtonDirective previously used the distinct
  `--button-shadow-color`. Checked both theme pairs: the two color tokens are
  near-identical neutral greys (`rgba(0,0,0,.55)`/`rgba(60,64,67,.20)` vs
  `rgba(0,0,0,.5)`/`rgba(60,64,67,.25)`), so no visible regression.

## Follow-up risks

- Spacing/radius swaps shift rhythm by a few px in ~20 files — the plan
  accepted this ("Med confidence") but it's worth a visual pass in a real
  browser (light + dark, desktop + ≤700px) before calling this fully done;
  I verified `pnpm build` succeeds and the reduced-motion/shadow rules land
  in the built CSS, but did not drive the site in a browser.
- Removed `--button-shadow-color` from `colors.css` (both themes) since
  `ButtonDirective.astro` no longer references it after the `--shadow-raised`
  swap — it had no other consumers.
- `--data-table-*` tokens in `colors.css` were already unused before this
  change (no component consumes them). Left in place — out of scope for this
  plan.
