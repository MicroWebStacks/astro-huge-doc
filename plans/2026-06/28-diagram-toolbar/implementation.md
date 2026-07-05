# Diagram Toolbar Controls Implementation

## Progress

[######] Done - implemented and validated; follow-ups noted below.

## Changes

- Added a shared toolbar in `src/components/markdown/code/DiagramCode.astro`
  with icon buttons for diagram view, code view, and full-view opening.
- Replaced the previous text `code/diagram` toggle with button-state logic
  that keeps the active view visible and opens the modal from the shared
  toolbar even when the code panel is currently selected.
- Extended `src/components/panzoom/panzoom.astro` with a
  `showOpenButton` prop so diagram blocks can suppress the old hover-only
  opener while other panzoom usages keep their existing behavior.
- Updated `src/assets/full-screen.svg` to use theme-aware strokes and added
  `src/assets/code.svg` plus `src/assets/diagram.svg` for the new toolbar.
- Refined the toolbar to sit inside the diagram frame as a reserved, 28px
  control row that fades icons in on hover or keyboard focus.
- Grouped code and diagram into one segmented toggle, ordered as code then
  diagram so the diagram action stays adjacent to full view.
- Dimmed the full-view button in code mode while keeping it functional; clicking
  it switches back to the diagram and opens the modal.

## Notes

- The diagram asset flow remains unchanged: diagrams still render through the
  pre-generated SVG asset and the existing `PanZoomModal`.
- The full-view icon contrast improvement also benefits other `Panzoom`
  consumers that still use the built-in opener.

## Follow-up Fix

- Fixed a regression where routable documents from an older collected version
  could render code items against the latest global version, causing code
  buffers to resolve as `null` before diagram full-view controls appeared.
- Updated code, image, table, and link asset lookups to prefer each item's own
  `version_id` when available.
- Updated diagram SVG lookup to prefer the source item's version, then fall
  back to the latest/generated diagram asset for the same stable diagram UID.
- Added `data-sid` to the `Panzoom` container so diagram full-view state keeps
  the source hash available.
- Guarded Panzoom SVG metadata processing against `null` metadata so opening
  diagram full view does not emit client-side `Object.hasOwn(null, ...)`
  errors.
- Raised the panzoom modal overlay to `z-index: 1000` in
  `src/components/panzoom/panzoommodal.astro` so fullscreen diagrams sit above
  the sticky right-side TOC controls instead of letting the menu paint on top.
