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
