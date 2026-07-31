# Interactive neighborhood graph implementation

## Progress

[#####-] Phase 5/6 - vis-network selected and streamlined; live browser verification remains.

## Changes made

- Replaced the graph's cloned static-SVG modal path with a dedicated live
  viewport while leaving generic image and diagram pan/zoom unchanged.
- Selected vis-network with ForceAtlas2-based physics and removed the
  Cytoscape graph adapter, selector, and direct dependency.
- Deferred the vis-network adapter and engine imports until the graph opens.
- Added deterministic seed positions and payload normalization for nodes,
  edges, direction metadata, and initial geometry.
- Implemented node dragging with a four-pixel click/drag threshold, session
  pinning, neighbor reflow, viewport pan/zoom, fit, reset, and settled-idle
  behavior.
- Implemented one-hop hover emphasis and dimming.
- Added a pointing-hand cursor only for navigable non-center nodes.
- Fixed node activation to use vis-network's actual canvas hit items, including
  label hits, while retaining the four-pixel movement threshold that separates
  a click from a node drag.
- Removed the `(+N)` neighbor-count suffix from rendered labels.
- Replaced the changing-width depth buttons with a fixed-width discrete range
  slider. Every tick reports its stable global node count and the final tick
  is labelled All; Fit and Reset use permanently visible fixed-width borders.
- The global dataset loads quietly after the initial graph has rendered, then
  supplies breadth-first depth rings and exact preview counts without delaying
  the initial neighborhood.
- Added always-visible `+N` satellite buttons beside boundary nodes with hidden
  neighbors. A locally opened branch changes its marker to `−` so it can be
  collapsed independently while the node remains reserved for opening or
  dragging.
- Kept local expansion state independent from global slider counts. The toolbar
  reports `X visible (+N local)` and reserves a fixed Clear local slot so its
  geometry does not shift when counts or local state change.
- Increased and fixed the visible-count column width so its longest local-count
  form cannot overlap Clear local.
- Added automatic depth synchronization: if local expansions collectively
  cover the next complete breadth-first level, the slider advances and removes
  branch overrides already represented by that global level.
- Added a hover `Open ↗` button for navigable nodes. The whole node and label
  remain clickable, and the explicit action provides a dependable alternative
  beside the separate `+N`/`−` branch control.
- Positioned the branch control at the node's upper-left and Open at its
  upper-right so neither covers the title below. Node hover now uses the grab
  cursor (grabbing during movement), while both explicit actions use pointer.
- Added `/graph/all.json` as a shared full-depth dataset so static builds do not
  duplicate the entire graph once per document.
- Fixed lite-profile expansion: an empty `getDocumentsFull()` now falls back to
  file-tree documents resolved through `getDocument()`, and the client merges
  the visible neighborhood into the expanded dataset so expansion can never
  collapse an incomplete graph to its center.
- Kept the top frame compact with the depth slider, Fit, Reset, and Close controls,
  and retained the removal of the comparison selector and details panel.
- Moved the modal to the document layer while open so responsive app-bar
  overflow cannot clip it, then restores it to its original location on close.
- Added reduced-motion handling and renderer cleanup on close.

## Decisions and deviations

- vis-network is the selected graph renderer. Cytoscape remains only where
  other dependencies such as Mermaid bring it transitively.
- The implementation fixes the center node at the deterministic origin. This
  leaves the soft-anchor question open.
- A dragged node remains pinned for the modal session while the surrounding
  graph reflows. Reset releases non-center nodes and restores the shared seed.
- The old radial SVG module remains in the repository for its existing unit
  coverage, but the app-bar graph entry no longer renders or clones it.

## Remaining work

- Exercise click-versus-drag, touch, keyboard, close/reopen, and responsive
  modal behavior in a live browser.
- Resolve center anchoring, pin/release, and label-visibility open points, then
  complete stability and rollout verification.
