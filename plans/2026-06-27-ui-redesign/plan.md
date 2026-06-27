# Plan: UI design-system consolidation (optional refactor)

## Problem

The site now has a complete, token-driven light/dark/auto theme (see
`specification/theming/spec.md`). Color is consistent. The *rest* of the visual
language — spacing, radius, typography, elevation, focus — is still expressed as
one-off values scattered across components. That works today but makes new UI
drift, because there is no shared scale to reuse.

`specification/ui_design.md` defines the target. This plan tracks moving toward
it. It is **opt-in**: none of it is required for the theme to function; it is
cleanup that pays off as the UI grows.

## Goal

Bring the foundations (not the colors — those are done) onto shared scales and
tokens so components compose predictably in both themes.

Durable design intent: `specification/ui_design.md` (Refactor Flags table R1–R8).

## Scope

- `src/layout/colors.css` (or a sibling `tokens.css`) — non-color tokens
  (`--space-*`, `--radius-sm/md`, type scale, font stack).
- `src/layout/Layout.astro` — root font stack + base type rhythm; footer decision.
- Component CSS across `src/components/**` and `src/layout/**` — swap one-off
  `px`/radius/shadow values for tokens; add focus states.

### Non-goals

- No color changes — the theme palette is frozen by the theming spec.
- No layout restructuring of the three-pane shell.
- No component-API or markup changes beyond what a class/token swap needs.

## Open points

- OP-001 — Token home: extend `colors.css` vs. add `tokens.css`. Leaning
  `tokens.css` so color and non-color concerns stay separable. **Open.**
- OP-002 — Footer (R7): restore a real footer or remove it. Currently `hidden`.
  **Open — needs maintainer call.**
- OP-003 — How far to push a formal type scale vs. leaving headings as-is.
  **Open.**

## Phases

Each phase is independently shippable and verifiable in both themes.

1. **Tokens** — introduce `--space-*`, `--radius-sm/md`, font stack, and a type
   scale. No usage yet. (R2, R3, R4)
2. **Typography** — set the root font stack and base line-height/spacing once;
   remove per-file `font-family`; map headings to the scale. (R4)
3. **Radius & spacing** — replace literal `3/5/10px` radii and ad-hoc spacing
   with tokens, component by component. (R2, R3)
4. **Elevation** — normalize shadows to a single token-driven style. (R5)
5. **Focus & motion** — add consistent visible focus states; honor
   `prefers-reduced-motion`. (R6, R8)
6. **Footer** — resolve OP-002. (R7)

## Risks

- Spacing/type swaps (R2, R4) subtly shift layout rhythm; review before/after at
  desktop and ≤700px, in light and dark.
- Removing `outline:none` without a replacement focus style would regress
  keyboard accessibility — pair the two in the same change.
- Touching the highlighter chrome must not disturb the Shiki dual-theme variables.

## Exit criteria

- `pnpm build` succeeds after each phase.
- No literal color/radius/spacing values remain in component CSS for the areas
  touched (tokens only).
- All interactive controls show a visible focus state.
- Spot-check pages render correctly in light, dark, and auto, desktop and mobile.
