# Menu State And Auto Plan

## Problem

The page tree and toc controls initialize on every load but do not persist
auto/manual state or scroll position. The active page is not reliably scrolled
into view. The auto fit heuristic can over-expand beyond the available menu
height, and button clicks do not visibly leave auto mode.

## Goal

Make both menus restore a scoped state, keep the selected/current item visible,
and make auto mode choose the deepest expansion level that fits the available
view height.

## Scope

- Persist mode, manual depth, and scroll position for the pages and toc menus.
- Persist exact custom branch expansion when a caret is clicked.
- Scope persistence to the current workspace/content source so previews do not
  collide.
- Keep the desktop side menus closed on first paint unless restored state opens
  them.
- Ensure the current active pages-menu item is expanded and visible when the
  file tree is opened.
- Make auto fit by measuring rendered menu height instead of estimating rows.
- Change the center control icon/label when a menu is in manual mode.
- Show the current visible expansion level inside the center control.
- Switch away from auto when arrow/min/max/caret controls are used.
- Hide the center depth badge when manual state is a custom branch set, and for
  toc auto mode where there is no single stable depth.
- Re-sync the pages menu when a previously closed desktop nav is opened so the
  active page scroll and auto-fit behavior reflect the current route and width.
- Add Playwright so browser-level menu behavior can be verified in-repo.
- Center the depth controls within each menu and tighten app-bar visibility
  toggles toward the window edges.

## Non-Goals

- No per-route menu state history.
- No raw file preview for non-renderable files.
- No replacement of the existing five-button control model.

## Exit Criteria

- Menus restore mode/depth and scroll position within the same workspace.
- A different workspace/content scope starts from defaults.
- Pages-menu active item is visible after load.
- First-load pages menu state is collapsed/manual by default, with only needed
  active ancestors opened.
- Auto mode does not intentionally expand beyond the menu viewport.
- Build succeeds and a runtime page returns expected menu content.
