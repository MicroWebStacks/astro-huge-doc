# Implementation: TOC menu button cluster + cross-highlight

## Progress

```
[######] Done - implemented; build green. Runtime visual check pending in app.
```

## Files changed

- `src/layout/SideMenu.astro`
  - Removed the depth range slider + `<datalist>`.
  - Added the five-button `.depth-controls` cluster: `min ⏮ · down ◀ · auto ◎ ·
    up ▶ · max ⏭`, each with `data-action` and title/aria-label. The `auto`
    title differs by menu (`follow scroll` for toc, `fit height` for pages).
  - Computed `link_class` (`toc_href` for the toc menu, empty otherwise) and
    passed it to `SubMenu`.
  - Replaced `.depth-slider` CSS with `.depth-btn` button styling, including a
    `.depth-btn.active` state.

- `src/layout/SubMenu.astro`
  - Added `linkClass?: string` prop, applied to the entry `<a>` via `class:list`,
    threaded through the recursive `Astro.self`. This finally emits the
    `toc_href` class the scroll-spy queries (previously never rendered, so the
    spy had no targets).
  - Made `root` optional (it already defaulted to `true`) to clear a type error.
  - Added cross-highlight CSS: `a.toc_href.active`/`.hover` highlight the link.

- `src/components/markdown/Heading.astro`
  - Added `.heading.bar.active`/`.hover` styles (background + left accent bar)
    so an in-page heading lights up when its toc entry is active/hovered.

- `src/layout/toc_menu_activation.js` (rewritten)
  - Per-nav `mode`/`depth` state in a `WeakMap`.
  - `applyDepth` (manual depth, unchanged logic), `collapseAll`, `expandChain`
    (ancestors + optional self), `ensureActiveVisible`.
  - `applyAuto`: pages -> `estimateDefaultDepth` + `applyDepth` (fit height);
    toc -> `applyAutoSpy`.
  - `applyAutoSpy`: collapse all, then expand each heading branch whose section
    `[thisTop, nextTop)` intersects the article viewport (via
    `getBoundingClientRect`, replacing the fragile `offsetTop` math).
  - `initDepthButtons`: delegated click handler; `down`/`up` step from the
    current effective depth and switch to manual; `auto` re-enters auto.
  - `initScrollSpy`: rAF-throttled scroll -> single active highlight on the
    matching `.toc_href` and `.heading`; re-runs `applyAutoSpy` when in auto.
    Bidirectional `hover` wiring (link <-> heading).
  - Default state on load: `applyAuto` for every menu. `resize` re-fits menus
    still in auto mode.

## Decisions / deviations

- Switched viewport math from `offsetTop` to `getBoundingClientRect` against the
  article rect — robust regardless of `offsetParent`/positioning.
- For a visible toc section, auto-spy expands the branch's ancestors *and* its
  immediate children, so the on-screen heading's subsections are shown.
- The `auto` button is shown on both menus (spec OP-001); its meaning is
  menu-specific.

## Follow-up risks

- Rapid scrolling toggles nested `max-height` transitions; mitigated with rAF
  throttling but very long TOCs may still show minor animation churn.
- Manual caret toggles are overwritten on the next auto-mode re-evaluation
  (accepted per spec non-goals).
