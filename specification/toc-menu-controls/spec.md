# Specification: Navigation Menu Expansion Controls

## Scope

This contract governs the expansion controls and cross-highlighting of the two
tree navigation menus rendered by `SideMenu.astro`:

- the left **pages menu** (`category="pages_menu"`), a tree of rendered
  documentation pages;
- the right **table-of-contents menu** (`category="toc_menu"`), a tree of the
  current page's headings.

It defines the compact depth toolbar, auto-expansion, manual-expansion,
persistence, and cross-highlight behavior.

## Control Cluster

Each menu has a visible surface label: **Pages** for document navigation and
**On this page** for the current-page outline. When a menu has more than one
nesting level (`data-max-level > 1`), it renders a compact horizontal cluster
of five controls. The controls must not resemble media transport controls:

| Order | Action | Meaning |
|-------|--------|---------|
| 1 | `min`  | Visible `1` label; collapse to top level. |
| 2 | `down` | Visible minus label; collapse one nesting level. |
| 3 | `auto` | Visible `Auto` or `Manual` mode label, plus depth when meaningful. |
| 4 | `up`   | Visible plus label; expand one nesting level. |
| 5 | `max`  | Visible `All` label; expand fully. |

A menu with a single level renders no cluster.

## Responsive Navigation

- At widths above 700px, Pages and On this page are independent resizable side
  panes controlled from the app bar.
- At widths of 700px or below, each menu becomes a modal side drawer. Only one
  drawer may be open at a time.
- A mobile drawer has a backdrop, can be dismissed by that backdrop or Escape,
  and returns focus to its trigger when dismissed.
- Activating a link in either mobile drawer closes the drawer before navigation
  and persists the closed state so the destination page is not obscured.
- Closed mobile drawers must not consume document space or create horizontal
  overflow.
- App-bar navigation controls provide at least a 44 by 44 CSS-pixel target on
  touch layouts.

## Modes

A menu is always in exactly one of two top-level modes:

- **manual**
- **auto**

### Manual Mode

Manual mode has two allowed presentations:

- **depth manual**: a fixed depth `1 .. max_level`. Pressing `min`, `down`,
  `up`, or `max` switches to manual mode and applies the resulting depth.
  `down` and `up` step by one level and clamp to the `[1, max_level]` range.
- **custom manual**: exact branch expansion chosen by caret clicks. Clicking a
  branch caret must switch the menu to manual mode and persist the explicit
  expanded and collapsed branch set instead of translating that click into a new
  global depth.

When the most recent manual state is custom manual, returning from auto mode to
manual must restore that exact branch set, subject to the active-item visibility
rules below.

### Auto Mode

Pressing the center control while in manual mode enters auto mode. Auto mode
differs by menu:

- **pages menu**: fit-to-height. Expand to the deepest nesting level whose
  rendered rows fit within the menu's available vertical space, then collapse
  deeper levels. The fit check may allow a bounded overflow margin so the menu
  can use most of the available height without stopping too early. Auto-fit
  must measure with the active page branch expanded, because that is the
  rendered state the reader will actually see. The pages menu may also apply a
  conservative maximum auto depth so the result stays navigation-oriented rather
  than explorer-like. Re-fit on viewport resize while auto is active.
- **toc menu**: scroll-spy. Expand only the heading branches whose page
  sections currently intersect the article viewport, including the visible
  branch, its ancestors, and its immediate children, and collapse everything
  else. Re-evaluate on every article scroll while auto is active.

When `down` or `up` is pressed while in auto mode, the step is taken relative to
the depth auto mode would currently produce, then the menu becomes manual.

When the center control is pressed while in auto mode, it restores the most
recent manual state, whether that was depth manual or custom manual.

## Default And Persisted State

On the first page load for a workspace and content scope:

- the pages menu starts in **manual** mode at depth 1 so the file tree is
  collapsed by default;
- the toc menu starts in **auto** mode so it can follow article scroll.

The current page's ancestor chain may still open so the active rendered
document is visible.

After interaction, each menu persists:

- mode (`auto` or `manual`);
- the last depth-manual level;
- the last custom-manual expanded branch set;
- menu scroll position.

State is scoped to the current workspace and content source plus the menu
category so a different workspace starts from defaults instead of reusing
another preview's state. State is not stored per route.

If a desktop side menu starts closed, restoring or reapplying its state must be
deferred until the menu has a measurable width. Opening that menu later must
still reapply the current route's active-item visibility and any auto-fit logic
against the final rendered width, not the closed or mid-transition width.

## Active Item Visibility

When a page loads, the pages menu must expand the active page's ancestor chain
and make the active item visible. Restored scroll position is allowed, but it
must not leave the active item hidden outside the visible menu viewport.

When restoring custom manual state, the persisted branch set remains the
authority for non-active branches, but the active page's ancestor chain must
still be opened if needed so the selected page is visible.

The pages menu is document navigation, not an IDE file explorer. It must show
rendered Markdown routes and the folder ancestors needed to organize them. Raw
source files that do not have rendered document routes must not appear.

## Active Control Indication

The control reflecting the current state is visually marked active:

- `auto` while in auto mode;
- otherwise `min` when at depth 1;
- otherwise `max` when at maximum depth.

The center control changes its visible symbol and title in manual mode to make
the mode switch clear.

The center control may show an expansion-level badge only when the current state
has one meaningful global depth:

- the **pages menu** may show the current expansion level in auto mode and in
  depth manual mode;
- the **toc menu** must not show an expansion-level badge while in auto mode,
  because scroll-spy does not have one stable global depth;
- any **custom manual** state must hide the expansion-level badge, because there
  is no single global level to display.

Pressing `min`, `down`, `up`, `max`, or a branch caret puts that menu in manual
mode.

## Cross-Highlight (toc menu only)

The toc menu and the in-page headings highlight each other. Each toc menu link
carries the `toc_href` class and targets a heading by `#slug`.

- **Scroll-spy active**: as the article scrolls, the heading whose section
  contains the top of the viewport is the active one. Its toc menu link and its
  in-page heading both receive the `active` class; at most one of each is
  active at a time. This applies in both manual and auto modes.
- **Hover, both directions**: hovering a toc menu link adds `hover` to its
  in-page heading; hovering an in-page heading adds `hover` to its toc menu
  link. Removing the pointer clears it.

Active and hover highlight styling must be visually distinct from the existing
URL-match highlight (`.entry_container.active`) used to mark the current page in
the pages menu.

## Non-Goals

- No depth slider or free-scrubbing depth input.
- The pages menu has no scroll-spy; its auto mode is fit-to-height only.
- Auto mode is not required to preserve a custom manual branch set while auto is
  active, but it must preserve that custom manual state for restoration when the
  user returns to manual mode.
