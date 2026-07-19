# UI Design Guidelines

A small, living design document for this documentation site. It exists to keep
the look and feel consistent as the UI grows, and to give both maintainers and
agents a shared reference for *what good looks like here* — so new components
match the old ones without re-deriving taste each time.

It is intentionally lightweight (inspired in spirit by the "design.md" idea of a
human- and agent-readable design doc). It states the design we *want*; it is not
a catalogue of current bugs. Where today's code diverges from these guidelines,
that is flagged in [Refactor Flags](#refactor-flags) and tracked in a redesign
plan rather than buried here.

Color *values* and the light/dark mechanics live in
[`specification/theming/spec.md`](./theming/spec.md) and
[`src/layout/colors.css`](../src/layout/colors.css). This doc covers everything
*around* color: principles, type, spacing, components, and how to use the tokens.

## Principles

1. **Calm, content-first.** The reading surface is the star. Chrome (menus,
   bars, controls) stays quiet and recedes until needed; documentation content
   gets the contrast and the space.
2. **One accent, used sparingly.** A single blue accent (`--front-blue`) marks
   interactivity, focus, and "current". Avoid introducing competing accent hues;
   semantic colors (note/tip/caution/danger) are the only sanctioned exceptions.
3. **Token-driven, never literal.** Every color comes from a semantic token so
   the same component works in light and dark. No hex/`rgb()` in component CSS.
4. **Light and dark are equals.** Neither theme is an afterthought. Check
   contrast and glare in both before shipping a component.
5. **Restraint in elevation and motion.** Prefer flat surfaces with subtle
   borders over heavy shadows; prefer short, purposeful transitions over
   animation for its own sake.
6. **Progressive disclosure.** Trees, TOCs, details, and lightboxes reveal depth
   on demand (hover, expand, fullscreen) instead of showing everything at once.

## Foundations

### Layout

The shell is an IDE-style three-pane layout, familiar from VS Code:

```
┌── rail ──┬─ pages tree ─┬──── article ────┬─ TOC ─┬── rail ──┐
│  fixed   │  resizable   │   reading area   │ resiz │  fixed   │
└──────────┴──────────────┴──────────────────┴───────┴──────────┘
            ↑ collapsible    ↑ max ~80ch text   ↑ collapsible
```

- Reading measure for body text is capped (`max-width: 80ch`) for legibility.
- Side panes are collapsible/resizable; their open state persists.
- Below ~700px the rails and TOC drop and the pages menu moves inline.

### Typography

- **Family:** a single sans-serif stack for UI and body — the system stack
  `--font-sans` (`system-ui, -apple-system, "Segoe UI", Roboto, Arial,
  sans-serif`), declared once at the root and inherited everywhere. Monospace
  is owned by the code highlighter theme.
- **Scale:** body at `1rem` (16px); headings step up on a GitHub-aligned
  scale — `h1 2 · h2 1.5 · h3 1.25 · h4–h6 1 rem` — chosen because GitHub's
  markdown rendering is the maintainer's reference for reading comfort. UI
  affordances (menus, controls) sit at `~0.85rem` (`--text-sm`). Sizes are
  tokens (`--text-*` in `tokens.css`), never ad-hoc.
- **Weight & rhythm:** regular for body, 600 for headings and emphasis. Body
  line-height `1.5` (`--leading-body`), headings `~1.25` (`--leading-heading`);
  ~`1rem` (`--space-4`) between blocks, more space above headings.

### Spacing

Use a consistent step scale instead of one-off pixel values. The intended scale
(in `rem`, 1rem = 16px):

`0.25 · 0.5 · 0.75 · 1 · 1.5 · 2 · 3`

Pick the nearest step; reserve raw pixels for hairline borders (`1px`) and
icon-pixel sizing. Padding inside interactive controls should be even on all
sides unless alignment demands otherwise.

### Shape & elevation

- **Radius:** two values only — `4–5px` for controls, chips, and small cards;
  `8–10px` for larger panels. Treat these as `--radius-sm` / `--radius-md`.
- **Borders:** prefer a `1px` token border (`--soft-border-color`,
  `--panel-border-color`) to separate surfaces.
- **Shadow:** subtle and single-layered, driven by `--card-shadow-color` (which
  is theme-aware). Shadows imply lift (cards, popovers), not decoration.

### Motion

- Transitions are short and easing-based: ~`0.3s` for hovers/color changes,
  ~`0.4–0.5s` for size/expand. Existing menu and caret transitions set the tone.
- Animate `transform`/`opacity`/`max-height`, not layout-thrashing properties,
  and keep durations consistent across similar interactions.
- Respect `prefers-reduced-motion` for non-essential animation.

### Iconography

- Line icons on a `24×24` (or `0 0 100 100`) viewbox, `currentColor` fill/stroke
  so they inherit the surrounding text color and theme automatically.
- Consistent visual weight; size icons in `rem` to track text.

## Color usage

See the theming spec for the token list. Usage intent:

- **Surfaces:** `--content-bg-color` (reading), `--nav-bg-color` (chrome),
  `--surface-raised-bg` / `--surface-2-bg` (cards, raised panels). Layer by role,
  not by stacking many greys.
- **Text:** `--content-color` (primary), `--content-color-muted`,
  `--content-color-faint` (de-emphasized). Don't go below "faint" for readable
  text.
- **Accent:** `--front-blue` for interactive/active/focus; `--article-anchor-color`
  and `--link-inline-color` for links.
- **Semantic callouts:** note/tip/caution/danger pairs (`*-bg-color` +
  `*-accent-color`) — used only for admonitions, never as general decoration.
- **Contrast:** body text and UI labels should meet WCAG AA (4.5:1 normal,
  3:1 large) against their surface in **both** themes. The "always-light"
  surfaces (diagrams, model viewer, lightbox) are dimmed in dark mode to avoid
  glare — keep them on their dedicated tokens.

## Component conventions

- **Links:** inline links use the link token and underline-on-hover or a clear
  color delta; external links get the `↗` affordance.
- **Buttons / CTAs:** outlined accent style (`ButtonDirective`) — accent border +
  accent text, subtle shadow on hover. Keep one primary style; avoid bespoke
  button looks per page.
- **Callouts (note/tip/caution/danger):** tinted background + left accent border
  + matching icon. Same structure for all four; only the color pair changes.
- **Code blocks:** bordered container, hover-reveal copy button, dual-theme
  syntax colors. Chrome (border, button, tooltip) uses code-specific tokens.
- **Cards:** raised surface, `--radius-md`, single subtle shadow; consistent
  internal padding; image/tag/feature regions stack predictably.
- **Trees (pages / TOC):** quiet rows, accent only for the current/active item,
  caret rotation for expand, indent guide via `--menu-border-left-color`. Hover
  is a soft background, not a color shift of the text.
- **Tables:** hairline `--table-border-color` grid, even cell padding; data-heavy
  tables may use their own panel tokens but must honor the active theme.
- **Lightbox / overlays:** dim scrim over content, light surface for the framed
  media, clear close affordance.

## Accessibility

- Color is never the *only* signal (pair with icon, weight, underline, or text).
- Visible focus states on all interactive elements; don't remove outlines
  without replacing them.
- Hit targets for controls ≳ 32px.
- Verify AA contrast in light **and** dark.

## How to extend

When adding or changing UI:

1. Reuse an existing token; if a genuinely new role is needed, add the token to
   **both** palettes in `colors.css` and name it by role.
2. Reuse an existing component pattern before inventing a new one.
3. Check the result in light, dark, and auto, at desktop and ≤700px width.
4. If a change implies a broader shift (new spacing scale, type scale, radius
   tokens), record it as a refactor flag and route it through a redesign plan.

## Refactor Flags

Where the current implementation is good design already, and where it should move
toward the guidelines above. These are *opportunities*, not regressions — the
site works today. Tracked in `plans/2026-06/27/ui-redesign/plan.md`.

| # | Area | Today | Toward |
|---|------|-------|--------|
| R1 | Color tokens | ✅ Centralized in `colors.css`, light/dark complete | Keep; add tokens only in pairs |
| R2 | Spacing | Mixed `px`/`rem`, one-off values | Adopt the step scale; optionally `--space-*` tokens |
| R3 | Radius | Literal `3/5/10px` scattered | Two tokens `--radius-sm` / `--radius-md` |
| R4 | Typography | ✅ Root system font stack + GitHub-aligned type scale (`tokens.css`) | Map remaining ad-hoc sizes onto `--text-*` |
| R5 | Elevation | Some heavy `2px 2px 3px 3px` shadows | Single-layer, token-driven subtle shadows |
| R6 | Focus states | Inconsistent / some `outline:none` | Consistent visible focus on all controls |
| R7 | Footer | ✅ Removed (was a `hidden` placeholder) | Done — re-add as a real, tokenized footer only if content exists |
| R8 | Reduced motion | Not handled | Honor `prefers-reduced-motion` |

Anything that only re-skins (R1) is low risk; anything touching layout rhythm
(R2, R4) should land behind the redesign plan with before/after checks in both
themes.
