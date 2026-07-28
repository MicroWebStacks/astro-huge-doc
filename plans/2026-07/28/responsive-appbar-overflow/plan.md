# Responsive App-Bar Overflow

## Problem Summary

The app bar currently wraps at wider widths and then switches both navigation
groups to `nowrap` below 700px. With generated root folders, intrinsic link
widths can widen the document, create page-level horizontal scrolling, and
push the right-side controls off-screen.

## Goal

Implement the durable behavior in
[`specification/responsive-appbar/spec.md`](../../../../specification/responsive-appbar/spec.md):
a one-row, measured Priority+ section navigation with protected utilities and
a compact mobile Tools disclosure.

## Scope

- Restructure the app bar into leading, section, and utility regions.
- Add measured section fitting that pins the active section and progressively
  moves remaining roots into `More`.
- Add the compact active-section selector state.
- Consolidate secondary utilities under `Tools` at the existing mobile shell
  breakpoint.
- Preserve existing graph, runtime, preview-lock, theme, Pages, and TOC
  behavior.
- Add focused automated tests and responsive browser/build validation.

## Non-Goals

- No change to root-section generation or ordering.
- No redesign of the Pages or TOC drawers.
- No searchable all-sections interface in this pass.
- No git history operations.

## Decisions

- **OP-001 — Root overflow behavior: resolved.** Use measured Priority+
  disclosure; do not wrap or make the header horizontally scrollable.
- **OP-002 — Essential controls: resolved.** Pages and TOC stay directly
  reachable; theme also stays visible in compact mode.
- **OP-003 — Secondary utilities: resolved.** External utility links, log,
  explore, graph, runtime information, and preview lock move into a Tools
  disclosure at the existing mobile breakpoint.
- **OP-004 — Large root counts: resolved for this pass.** The disclosure is
  viewport-bounded and scrollable. Search remains an allowed future extension,
  not a dependency.

## Implementation Phases

1. Capture the responsive contract and add the open plan packet.
2. Implement app-bar structure, styling, disclosure behavior, and measured
   fitting.
3. Add focused tests for fitting priorities, disclosure accessibility, and
   no-wrap/no-page-overflow guards.
4. Run focused tests, plan consistency, the full build, and responsive visual
   checks; record results and close the packet.

## Dependencies And Risks

- Utility controls are already bound by stable IDs and selectors; moving their
  existing DOM nodes must not duplicate or replace them.
- The graph entry owns a render target and modal, so its entire list item must
  move as one unit.
- Font loading and fractional widths can change fit results after first paint;
  the fitter must rerun after fonts settle and use a small safety reserve.
- Disclosure panels must sit outside the clipped section-navigation region.

## Exit Criteria

- No app-bar state wraps or creates document-level horizontal overflow.
- Active-root, Home, and overflow behavior follow the specification.
- Pages, theme, and TOC remain directly reachable in compact mode.
- Secondary utility controls work from the compact Tools disclosure.
- Focused tests, `pnpm check:plans`, and `pnpm build` pass.
