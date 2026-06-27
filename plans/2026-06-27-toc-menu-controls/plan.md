# Plan: Replace TOC depth slider with button cluster + cross-highlight

## Problem

The navigation menus expose expansion depth through a range **slider**
(`SideMenu.astro`). The maintainer wants media-transport-style **buttons**
instead, plus an auto mode and bidirectional highlighting between the toc menu
and the in-page headings. Investigation also found the existing scroll-spy is
dead: the `toc_href` class the spy queries is never emitted by the markup, so
spy targets are always empty.

## Goal

- Replace the slider with a five-button cluster (`min · down · auto · up · max`).
- Two auto flavors: pages = fit-to-height; toc = scroll-spy live expand.
- Default to auto on load for both menus.
- Make the toc menu and in-page headings highlight each other (active + hover).

Durable contract captured in `specification/toc-menu-controls/spec.md`.

## Scope

- `src/layout/SideMenu.astro` — markup + styles for the button cluster.
- `src/layout/SubMenu.astro` — emit `toc_href` class on toc links; highlight CSS.
- `src/layout/toc_menu_activation.js` — button wiring, modes, auto-spy, highlight.
- `src/components/markdown/Heading.astro` — in-page heading active/hover styles.

### Non-goals

- No slider / scrubbing input.
- Pages menu gets no scroll-spy.

## Open points

- OP-001 — Scope of buttons across menus. **Resolved**: both menus; pages `auto`
  = fit-to-height, toc `auto` = scroll-spy.
- OP-002 — Default load state. **Resolved**: auto mode for both.

## Phases

1. Spec capture (`specification/toc-menu-controls/spec.md`). Done.
2. Thread a `linkClass` prop through `SideMenu` -> `SubMenu` so toc links carry
   `toc_href`; add menu-side highlight CSS.
3. Swap slider markup for the button cluster + button CSS in `SideMenu`.
4. Add in-page heading `active`/`hover` highlight CSS in `Heading.astro`.
5. Rewrite `toc_menu_activation.js`: per-nav mode state, button handlers,
   `applyDepth` (manual), `applyAuto` (fit-height vs spy), `applyAutoSpy`,
   bidirectional highlight + hover, rAF-throttled scroll and resize handlers.
6. `pnpm build`; record proof in `implementation.md` + `test.md`.

## Risks

- `offsetTop`-based spy was fragile; switch to `getBoundingClientRect` against
  the article rect for robust viewport intersection.
- Rapid scroll re-collapsing/expanding nested `max-height` transitions could be
  janky; throttle with `requestAnimationFrame`.

## Exit criteria

- `pnpm build` succeeds.
- Slider gone; five buttons present on both menus.
- Toc auto follows scroll; pages auto fits height; manual buttons step depth.
- Toc link <-> heading active and hover highlight both directions.
