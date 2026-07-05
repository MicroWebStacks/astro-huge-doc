# Test proof: TOC menu button cluster + cross-highlight

## Commands run

- `pnpm build`
  - Result: **success**. `vite` transformed 6913 modules; client + server built
    (server in ~21s). `SubMenu.astro_..._lang.*.js` (the activation script)
    bundled at 4.63 kB. No errors; only the pre-existing large-chunk size
    warning for `plotly`/`ServerTable`/`ModelViewer` (unrelated).

## Static checks

- `grep` for `depth-slider | data-role | depth-steps | input[type=range]` under
  `src/` -> **no matches**: the slider is fully removed.
- IDE diagnostics on edited files clean after making `SubMenu` `root` optional.

## Expected runtime behavior (to confirm in the running app / shared window)

Both menus:
- Five buttons render in place of the slider: `⏮ ◀ ◎ ▶ ⏭`.
- `min` collapses to top level; `max` expands all; `down`/`up` step one level
  and switch the active button indicator off `auto`.
- On load both menus start in `auto` (the `◎` button shows active).

Pages menu (left):
- `auto` fits the expansion depth to the available height; re-fits on resize.

TOC menu (right):
- `auto` expands only the heading branches whose sections are on screen and
  collapses the rest; scrolling keeps the expanded set following the viewport.
- The heading at the top of the viewport is highlighted in the menu
  (`.toc_href.active`, blue left bar) and in the page (`.heading.active`).
- Hovering a menu link highlights its in-page heading, and hovering an in-page
  heading highlights its menu link (both add `.hover`).

## Known gaps

- Runtime visual verification (button clicks, scroll-spy expansion, hover
  highlight both directions) not yet captured here; needs a browser/preview
  session against real content. Build + static checks pass.
