# Specification: Navigation Menu Expansion Controls

## Scope

This contract governs the expansion controls and cross-highlighting of the
two tree navigation menus rendered by `SideMenu.astro`:

- the left **pages menu** (`category="pages_menu"`), a tree of document pages;
- the right **table-of-contents menu** (`category="toc_menu"`), a tree of the
  current page's headings.

It replaces the prior depth **range slider** with a fixed **button cluster** and
defines the auto-expansion and bidirectional highlight behavior.

## Control Cluster

When a menu has more than one nesting level (`data-max-level > 1`), it renders a
single horizontal cluster of five controls, ordered like media transport
buttons:

| Order | Action | Meaning |
|-------|--------|---------|
| 1 | `min`  | Collapse the menu fully (depth 1, only top level visible). |
| 2 | `down` | Collapse one nesting level relative to the current depth. |
| 3 | `auto` | Enter auto mode (centre control). |
| 4 | `up`   | Expand one nesting level relative to the current depth. |
| 5 | `max`  | Expand the menu fully (all nesting levels visible). |

A menu with a single level renders no cluster.

### Modes

A menu is always in exactly one of two modes:

- **manual** — a fixed depth `1 .. max_level`. Pressing `min`, `down`, `up`, or
  `max` switches to manual mode and applies the resulting depth. `down`/`up`
  step by one level and clamp to the `[1, max_level]` range.
- **auto** — pressing `auto` enters auto mode. Auto mode differs by menu:
  - **pages menu**: *fit-to-height* — expands to the deepest nesting level whose
    rows still fit within the menu's available vertical space; collapses deeper
    levels. Re-fits on viewport resize while auto is active.
  - **toc menu**: *scroll-spy* — expands only the heading branches whose page
    sections currently intersect the article viewport (the visible branch plus
    its ancestors and its immediate children), and collapses everything else.
    Re-evaluates on every article scroll while auto is active.

When `down` or `up` is pressed while in auto mode, the step is taken relative to
the depth auto mode would currently produce, then the menu becomes manual.

### Default State

On page load, both menus start in **auto** mode.

### Active Control Indication

The control reflecting the current state is visually marked active: `auto` while
in auto mode; otherwise `min` when at depth 1 and `max` when at maximum depth.

## Cross-Highlight (toc menu only)

The toc menu and the in-page headings highlight each other. Each toc menu link
carries the `toc_href` class and targets a heading by `#slug`.

- **Scroll-spy active**: as the article scrolls, the heading whose section
  contains the top of the viewport is the active one. Its toc menu link and its
  in-page heading both receive the `active` class; at most one of each is active
  at a time. This applies in both manual and auto modes.
- **Hover, both directions**: hovering a toc menu link adds `hover` to its
  in-page heading; hovering an in-page heading adds `hover` to its toc menu
  link. Removing the pointer clears it.

Active and hover highlight styling must be visually distinct from the existing
URL-match highlight (`.entry_container.active`) used to mark the current page in
the pages menu.

## Non-Goals

- No depth slider or free-scrubbing depth input.
- The pages menu has no scroll-spy; its `auto` is fit-to-height only.
- Manual caret toggles on individual branches remain available and are not
  required to persist across an auto-mode re-evaluation.
