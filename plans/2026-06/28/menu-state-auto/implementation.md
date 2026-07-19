# Menu State And Auto Implementation

## Progress

[######] Done - implemented and validated; browser-package automation was not available.

## Changes

- Updated `specification/toc-menu-controls/spec.md` with persisted state,
  scoped storage, active-item visibility, and manual/auto control semantics.
- Added a workspace/content scoped `data-state-key` to each `SideMenu`.
- Updated `src/layout/toc_menu_activation.js`:
  - persists mode, depth, and scroll position in `localStorage`;
  - persists exact expanded branch keys for custom manual state;
  - restores state on startup for the visible menu instance only;
  - keeps the active pages-menu item expanded and visible;
  - switches to manual mode from min/down/up/max and branch-caret clicks;
  - changes the center control symbol/title when in manual mode;
  - measures rendered menu height to choose the deepest auto-fit level.
- Added `playwright` as a root dev dependency through `pnpm` so browser
  interaction checks can run from this repo.
- Updated `src/layout/menu_interactions_activation.js` so left/right open state
  uses the same scoped menu key instead of global `left_open`/`right_open`.
- Adjusted `SideMenu` toolbar alignment so pages controls sit near the left edge
  and toc controls sit near the right edge.

## Notes

- The desktop and mobile pages menus share one storage key, but hidden menu
  instances are not initialized. This avoids hidden mobile markup overwriting
  desktop state.
- Cached HTML can preserve old menu markup after a layout build. Runtime proof
  required clearing `html_cache`.

## Follow-Up Changes

- Desktop side menus now render closed on first paint; the mobile in-article
  pages menu remains open because it is the mobile navigation surface.
- The pages menu now defaults to manual depth 1 on a fresh workspace/content
  scope. It still expands the active document ancestor chain when needed.
- The depth toolbar is centered over the menu width and uses the menu background
  with borders so it reads as a distinct transition from the app bar.
- The center auto/manual button now swaps between an auto target icon and a
  manual menu-lines icon without changing button size. The client state now
  persists a separate `manualDepth`, so leaving auto mode restores the last
  manual depth instead of reusing the auto-computed depth, and the center
  button click truly toggles between auto and manual.
- `SideMenu.astro` now server-renders the initial center-button mode per menu
  category so the pages menu starts with only the manual icon visible on first
  paint and the toc menu starts with only the auto icon visible.
- The center control now shows the current visible depth next to the mode icon.
- The fit-height heuristic now measures with the active branch expanded and
  accepts up to `120%` of the visible menu height before stopping. This avoids
  the earlier under-measurement that chose overly deep auto levels once the
  active branch reopened.
- Branch-caret clicks no longer translate into "expand everything to this
  level". They now switch the menu into custom manual mode, hide the depth
  badge, and persist the exact expanded branch set plus scroll position.
- Closed desktop navs are now initialized and re-synced when revealed or
  resized, so route changes still scroll the active page into view and auto-fit
  recalculates at the current menu width.
- The reveal sync now runs after open and again after the width transition
  delay, so previously closed desktop menus can scroll the active item into view
  using the final wrapped layout rather than the first animation frame.
- The toc center control hides the depth badge while in auto mode because its
  scroll-spy expansion is not a single global depth.
- App-bar side-menu toggles start as collapsed, remove default list padding,
  and sit close to the left and right viewport edges.
- Scrollbar corners are themed to avoid the white square where horizontal and
  vertical scrollbars meet.
- The pages-menu auto-fit now caps its search at depth `2`, because the raw
  fit-height heuristic kept accepting deeper levels on routes like `/` and
  `/plans/closed` even though that produced explorer-style overexpansion.
- Width transitions were removed from the desktop side nav so route changes no
  longer animate the menu width while the open state is restored.
