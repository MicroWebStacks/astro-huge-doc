# Responsive App-Bar Overflow Implementation

## Progress

[####] Done - the measured app-bar overflow, page-width containment, and symmetric desktop sidebar resizing are implemented.

## Changes

- Added `src/layout/appbar_fit.js`, a side-effect-free Priority+ fitter that
  keeps the active root, then Home, then the configured prefix while reserving
  room for the overflow control.
- Added `src/layout/appbar_overflow.js` to measure the rendered app bar,
  recalculate after resize and font loading, manage the section and Tools
  disclosures, and move existing secondary utility nodes without cloning
  their state or event bindings.
- Restructured `src/layout/AppBar.astro` into leading, section, and protected
  utility regions. The section region is clipped to one row and exposes
  hidden roots through `More` or the compact active-section selector.
- Consolidated secondary controls into a labeled Tools disclosure at the
  existing 700px mobile breakpoint. Pages, theme, and On this page remain
  directly reachable.
- Added shrinking and clipping boundaries in `src/layout/Layout.astro` so
  intrinsic navigation, TOC, or resize-handle widths cannot widen the
  document.
- Added `test/appbar-overflow.test.js` for fitting priority, compact fallback,
  accessible disclosure contracts, focus restoration, DOM-node movement, and
  layout containment.
- Corrected a containment follow-up in `src/layout/Layout.astro`: the Pages
  wrapper now uses the same non-shrinking flex contract as the TOC wrapper, so
  its divider follows the requested menu width instead of lagging behind it.
- Reworked the shared desktop resizer in
  `src/layout/menu_interactions_activation.js` around pointer capture. Both
  sides now clamp continuously at 40vw, suppress native text selection during
  a drag, clean up on pointer cancellation or window blur, and synchronize the
  owning app-bar toggle and persisted open state when a drag opens or collapses
  a menu.
- Added `test/menu-resize-interactions.test.js` and extended
  `test/menu-control-layout.test.js` with resize symmetry, pointer cleanup,
  maximum clamping, selection suppression, and snap-collapse coverage.

## Implementation Decisions

- Root-section fitting is measurement-driven rather than breakpoint-driven;
  the utility consolidation alone uses the shell's existing mobile breakpoint.
- Optional inline roots stop at the first item that does not fit, preserving a
  predictable configured prefix instead of sampling later short labels.
- Compact mode is selected when the active label cannot coexist with the
  section-overflow control.
- Disclosure copies are used for section links, while stateful utility list
  items are moved as their original DOM nodes.
- The established sidebar snap contract is preserved on both sides: a
  61-159px drag target retains the last usable width, crossing 60px collapses
  the menu completely, and reopening restores the default 20vw width.

## Deviations And Follow-Ups

- No implementation deviation from the approved specification was required.
- Search inside the section disclosure remains an optional future enhancement
  for exceptionally large root sets; the current viewport-bounded panel
  scrolls and exposes every root.
- Follow-up polish keeps the Pages depth controls left-anchored with fixed
  button widths. Narrow panes clip the trailing `All` control, and widening
  reveals it from the right without shifting the leading `1` control.
- The app-bar containment change initially exposed an older wrapper asymmetry:
  `overflow:hidden` allowed the Pages wrapper to flex-shrink even though the
  inner navigation kept growing. The follow-up fixes the wrapper contract
  without removing the page-width containment guard.
