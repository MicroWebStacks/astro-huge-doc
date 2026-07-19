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

- OP-001 — Token home: extend `colors.css` vs. add `tokens.css`.
  **Resolved → `tokens.css`** (added, holds `--font-sans`, `--text-*`,
  `--leading-*`, `--space-*`, `--radius-sm/md`).
- OP-002 — Footer (R7): restore a real footer or remove it.
  **Resolved → removed.** It was an empty placeholder; can be re-added as a
  real, tokenized footer later if a downstream site needs one.
- OP-003 — How far to push a formal type scale.
  **Resolved → GitHub-aligned scale** (`h1 2 / h2 1.5 / h3 1.25 / h4–6 1 rem`,
  body 1rem, line-height 1.6), per maintainer reference (GitHub markdown).

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

## Change inventory

Concrete changes derived from an audit of `src/**`, grouped by phase. *Impact* =
how much it shifts the rendered UI; *Confidence* = how sure the change is correct
and safe to land as described.

**Landed (2026-06-28):** C1 (`tokens.css`), C2 (root system font stack), C4
(GitHub-aligned heading scale + article reading rhythm: line-height 1.5, block
spacing, lists/inline-code/blockquote), C11 (footer removed).

**Landed (2026-07-09):** C3, C5, C6, C7, C8, C9, C10 — see
`implementation.md` for the full file list and per-value token mapping
decisions. All phases are now complete.

| # | Phase | Change | Files / count | Impact | Confidence |
|---|-------|--------|---------------|--------|------------|
| C1 | 1 Tokens | Add non-color token layer: `--space-*`, `--radius-sm/md`, font stack, type-scale vars (no usage yet) | new `tokens.css` (OP-001) | None (additive) | High |
| C2 | 2 Type | Replace `font-family: Arial, Helvetica` with system stack at the root; inherited everywhere | `Layout.astro:90` (only 1 decl, not per-file) | Subtle global font shift | High (correct); Med (look) |
| C3 | 2 Type | Map ad-hoc sizes to the scale: `24/20/17/12px`, `large`, `0.8rem` | 404, panzoommodal, AppBar, Highlighter, NotesDirective, SideMenu | Localized size tweaks | High |
| C4 | 2 Type | Apply heading type-scale — **net-new**, headings use browser defaults today | `Heading.astro` + global md styles | Heading sizes change site-wide | Med (OP-003 open) |
| C5 | 3 Radius | Collapse `3/4/5px`→`--radius-sm`, `8/10px`→`--radius-md` | 12 spots / 10 files | Tiny (3→4, 10→8) | High |
| C6 | 3 Spacing | Replace one-off padding/margin/gap with the step scale | **97 occurrences / 24 files** | Largest; rhythm shifts | Med |
| C7 | 4 Elevation | Normalize `2px 2px 3px 3px` shadows to single-layer token shadow | Cards, ButtonDirective, DataTable | Cards/buttons look lighter | High |
| C8 | 4 Elevation | **Exclude** decorative accent bars from C7 — these are not elevation | `SubMenu:131` inset, `Heading:48` `-8px` | None (guardrail) | High |
| C9 | 5 Focus | Remove `outline:none`; add visible focus ring to all controls | Highlighter (`:46`) + toggle, copy btn, menu rows, buttons, details summary | New focus rings on :focus-visible | High |
| C10 | 5 Motion | Wrap non-essential transitions in `prefers-reduced-motion` guard | menu/caret/heading transitions | A11y only, no default change | High |
| C11 | 6 Footer | Resolve OP-002: remove the `hidden` stub or build a real footer; drop literal `color:white` | `Layout.astro:78,117–120` | Depends on decision | Low (needs maintainer call) |

## Risks

- Spacing/type swaps (R2, R4) subtly shift layout rhythm; review before/after at
  desktop and ≤700px, in light and dark.
- Removing `outline:none` without a replacement focus style would regress
  keyboard accessibility — pair the two in the same change.
- Touching the highlighter chrome must not disturb the Shiki dual-theme variables.
- The "normalize shadows" pass (R5) must not flatten the two decorative accent
  bars (`SubMenu` inset, `Heading` left bar) — they read as `box-shadow` but are
  accent indicators, not elevation. Exclude them explicitly (C8).

## Exit criteria

- `pnpm build` succeeds after each phase.
- No literal color/radius/spacing values remain in component CSS for the areas
  touched (tokens only).
- All interactive controls show a visible focus state.
- Spot-check pages render correctly in light, dark, and auto, desktop and mobile.
