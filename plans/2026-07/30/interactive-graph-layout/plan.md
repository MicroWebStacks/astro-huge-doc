# Interactive neighborhood graph layout

## Status

Phase 5/6 implementation selected and streamlined after maintainer review.
vis-network with ForceAtlas2-based physics is the sole graph renderer.
Cytoscape's graph adapter, selector UI, and direct dependency have been
removed.

## Prototype evidence

The maintainer compared the integrated engines and selected vis-network as
clearly superior. The selected implementation now has one payload, renderer,
and lifecycle:

- graph JSON is fetched once while the vis-network adapter and engine remain
  deferred until the graph opens;
- the graph starts from a deterministic ring seed, runs adaptive physics,
  stops after settling, keeps the center fixed, and pins a node moved more
  than four rendered pixels before reflowing its neighbors;
- hover emphasizes the hovered node, its one-hop neighbors, and incident
  edges while dimming unrelated graph elements;
- navigable nodes show the pointing-hand cursor while the center and URL-less
  nodes retain the normal cursor;
- a normal click on either a node circle or its label opens the page, while
  movement beyond four rendered pixels is classified as a node drag;
- node labels show only page titles; the former `(+N)` neighbor-count suffixes
  have been removed;
- the compact top bar exposes a fixed-width discrete depth slider whose ticks
  show the global node count at every level, followed by clearly bounded Fit,
  Reset, and Close controls;
- the global graph dataset loads after the initial graph is usable, allowing
  the controls to preview accurate depth counts without delaying first paint;
- every boundary node with undisplayed neighbors has an always-visible `+N`
  satellite control; it becomes `−` after revealing only that node's branch;
- local branch changes do not alter slider counts. A separate visible total
  reports local additions, and Clear local removes all branch overrides;
- when local branches collectively reveal every node in the next complete
  global level, the slider advances automatically and absorbs now-redundant
  local overrides;
- hovering a navigable node reveals an explicit `Open ↗` control in addition
  to the pointing cursor and direct node/title click behavior;
- the comparison selector and visible details list have been removed;
- Escape/backdrop close, reduced-motion behavior, cleanup, and
  route-prefix-safe navigation remain shared modal behaviors.

The production build emits vis-network as a separate lazy chunk. Its optional
stylesheet remains intentionally excluded because the graph uses fully
configured canvas styles and the sheet would add about 220 KB of unrelated
legacy assets. Cytoscape may remain transitively present for Mermaid, but the
graph no longer imports it or declares it directly.

Automated model, layout-seed, route, lazy-loader, layout-contract, full-suite,
and production-build checks pass. Live pointer/touch and responsive
verification is still required because the in-app browser was unavailable
during this pass.

## Problem summary

The neighborhood graph was previously a deterministic, fixed radial SVG:

- the center node is fixed at the origin;
- first- and second-hop nodes are placed on two circles;
- graph positions do not respond to the topology;
- nodes cannot be dragged;
- edge crossings and label collisions are not considered;
- hover changes only the node outline rather than emphasizing its connected
  neighborhood;
- click navigation is mediated by a delegated pointer-down/pointer-up handler
  layered over the generic pan/zoom modal, and small pointer movement can make
  a click look actionable while suppressing navigation.

The previous implementation was split across:

- `src/layout/graph_view.js` — static SVG markup and radial positions;
- `src/layout/graph_entry.js` — fetch, modal opening, and delegated node
  navigation;
- `src/components/panzoom/panzoommodal.astro` and
  `src/components/panzoom/lib_panzoommodal.js` — clone the generated SVG into
  a shadow root and let the generic `panzoom` package own viewport gestures;
- `src/libs/graph.js` — center plus ring-1/ring-2 payload, capped at 71 visible
  nodes including the center.

This is not only a coordinate-quality issue. The cloned static-SVG modal is a
poor host for live layout, node dragging, renderer-managed hit testing, and
continuous edge updates.

## Reference findings

### Obsidian behavior worth adapting

Obsidian documents these graph behaviors:

- hover a node to highlight its connections;
- click a node to open it and right-click for contextual actions;
- drag the viewport and zoom with mouse or keyboard;
- size nodes according to references;
- filter and group nodes;
- tune center, repel, link, and link-distance forces;
- show a local graph at a configurable link depth.

The current Obsidian Publish help page renders its interactive graphs into
live `<canvas>` elements. Its page assets include `pixi.min.js` 7.2.4 and a
separate `sim.js` graph script. Historical answers from Obsidian contributors
describe PixiJS as the renderer and force simulation as a separate concern.
The Obsidian application graph implementation itself is proprietary, so it is
a behavior reference rather than reusable source.

Sources:

- <https://obsidian.md/help/plugins/graph>
- <https://forum.obsidian.md/t/graph-software/6530>
- <https://forum.obsidian.md/t/understanding-the-graph-view-core/41020>
- <https://obsidian.md/license>

### Repository dependency context

The installed Mermaid dependency already brings these packages into the lock
graph:

- `cytoscape@3.34.0`;
- `cytoscape-fcose@2.2.0`;
- `cytoscape-cose-bilkent@4.1.0`;
- `d3-force@3.0.0`.

That does **not** make them supported direct dependencies. Whichever package
the graph imports must be declared directly in `package.json`. The graph
renderer should be dynamically imported only when the graph opens, regardless
of which library is selected.

## Goal

Replace the fixed radial presentation with a reliable, topology-aware,
interactive neighborhood graph that is pleasant to explore at the current
payload bounds and remains compatible with full, JSON, static, and lite
profiles.

## Objectives

1. Make node click/tap navigation dependable and clearly distinguish it from
   node drag and viewport pan.
2. Let users drag nodes while incident edges update continuously.
3. Use a force-directed or comparably adaptive layout that responds to graph
   topology, node dimensions, and collisions.
4. On hover or keyboard focus, emphasize the node, its immediate neighbors,
   and their incident edges while de-emphasizing unrelated elements.
5. Stop layout work after stabilization and restart it only when data,
   settings, or node movement requires it.
6. Preserve the current center/ring semantics, directed-edge styling,
   tooltips, theme support, and route-prefix-safe navigation.
7. Keep the renderer and full-depth dataset lazy-loaded and validate bundle,
   CPU, and interaction cost using real neighborhood payloads.

## Options under discussion

| Option | Strengths for this graph | Costs and risks | Current assessment |
| --- | --- | --- | --- |
| **Cytoscape.js + built-in CoSE** | One graph model provides canvas rendering, pan/zoom, normalized pointer/touch events, draggable nodes, selectors, neighborhood traversal, styling, and a force-directed layout. Fits the existing 71-node cap well. Cytoscape is already present transitively through Mermaid. | Must become a direct dependency. Core minified distribution is about 434 KB before compression/tree-shaking. CoSE is a settle-and-stop layout; adaptive behavior after drag must be designed rather than assumed. Canvas accessibility needs an explicit companion interaction model. | **Leading candidate.** Prototype first without an extra layout extension. |
| **Cytoscape.js + fCoSE** | Better force-directed aesthetics than the built-in CoSE in some graphs; supports label-aware dimensions, fixed-node, alignment, and relative-placement constraints; supports incremental layout. Already present transitively through Mermaid. | Adds extension code and tuning surface. Better crossings are not guaranteed. Its extra constraint features may be unnecessary for a small local graph. | **Optional second Cytoscape trial**, only if built-in CoSE fails the fixture review. |
| **vis-network** | Closest out-of-box match to the requested behavior: continuous physics, node dragging that can restart stabilization, canvas hit testing, hover-connected-edge styling, pan/zoom, keyboard navigation, and multiple physics solvers. Likely the shortest route to an Obsidian-like interaction model. | New dependency family not currently in the lockfile. Less useful graph-analysis API than Cytoscape; styling and lifecycle must be checked against the Astro/modal architecture; long-term bundle and maintenance tradeoffs need measurement. | **Strong comparison candidate.** Benchmark against Cytoscape before deciding. |
| **D3-force + custom SVG or Canvas renderer** | Small, focused physics primitive; fixed-seed simulation is available; complete control over seeding, ring bias, dragging, reheating, collision, and rendering. Already present transitively through Mermaid. SVG could preserve native links and a more inspectable DOM. | D3-force supplies simulation only. We would still own rendering, hit testing, zoom/pan, touch arbitration, label collision, hover state, drag semantics, keyboard access, cleanup, and regression fixes. Reusing the current cloned SVG is not viable for live state. | **Viable but higher ownership.** Prefer only if library renderer constraints prove unacceptable. |
| **Sigma.js + Graphology + ForceAtlas2** | WebGL renderer and worker-capable layouts are strong for graphs with thousands of nodes and edges. | Multiple new packages and a more complex data/render/layout stack for a graph capped at 71 nodes. Node dragging and product-specific interactions still require integration work. | **Not recommended for current scale.** Revisit only if a future global graph changes the scale requirement. |
| **Custom force solver with no graph library** | No direct third-party graph dependency and full behavioral control. | Reimplements mature physics, collision, event, and lifecycle behavior; highest correctness and maintenance risk; does not address the modal architecture by itself. | **Reject for the first implementation.** |
| **Keep fixed SVG and improve radial ordering** | Lowest code churn; deterministic and easy to snapshot-test. Edge crossings can be reduced somewhat by topology-aware angular ordering and curved routes. | Does not satisfy adaptive layout or draggable-node requirements and leaves the pan/click conflict in place. | **Insufficient as the target**, but useful as a no-JS or reduced-motion fallback if one is needed. |

Library references:

- Cytoscape.js API and CoSE:
  <https://js.cytoscape.org/>
- fCoSE:
  <https://github.com/iVis-at-Bilkent/cytoscape.js-fcose>
- D3 force:
  <https://d3js.org/d3-force>
- vis-network interactions and physics:
  <https://visjs.github.io/vis-network/docs/network/interaction.html> and
  <https://visjs.github.io/vis-network/docs/network/physics.html>
- Sigma.js and Graphology ForceAtlas2:
  <https://www.sigmajs.org/docs/> and
  <https://graphology.github.io/standard-library/layout-forceatlas2.html>

## Provisional interaction model

This is a discussion baseline, not accepted scope:

- Open the graph into a dedicated live graph viewport instead of cloning an
  SVG into the generic pan/zoom modal.
- Seed positions deterministically so the same neighborhood starts from a
  familiar shape, then let the selected force layout settle.
- Keep the current page visually prominent and optionally anchored near the
  center while allowing its neighbors to organize around topology.
- Treat a pointer gesture as exactly one of:
  - tap/click node — navigate;
  - drag node — reposition it and reheat only the affected layout;
  - drag background — pan the viewport;
  - wheel/pinch or keyboard command — zoom.
- While a node is being dragged, update every incident edge in the same frame.
- After drag release, either keep the node pinned for the session or release
  it into a short re-stabilization; this remains an open decision.
- Hover/focus a node:
  - emphasize the node, direct neighbors, and connecting edges;
  - keep their labels legible;
  - dim unrelated nodes, labels, and edges;
  - restore the normal graph on pointer exit or focus loss.
- Let the simulation cool to zero and become idle. Reheat only on open, data
  change, layout-setting change, reset, or node drag.
- Keep node-opening behavior available without a pointer through an adjacent
  focusable node list or another explicit accessible surface if the selected
  canvas renderer cannot expose focusable nodes.

## Scope

### In scope after the renderer decision

- dedicated graph modal/viewport lifecycle;
- renderer adapter for the existing `{center, nodes, edges}` payload;
- adaptive initial layout and controlled re-layout;
- node drag, viewport pan/zoom, and reliable click/tap navigation;
- hover/focus neighborhood emphasis;
- node/edge styling for center, ring, direction, type, and link metadata;
- responsive behavior for desktop, touch, and reduced-motion environments;
- renderer cleanup when the modal closes or Astro navigation replaces the
  page;
- focused unit and browser interaction tests;
- bundle and performance measurements at representative and maximum payload
  sizes.

### Non-goals for the first implementation

- an automatically opened vault-wide/global graph (full-depth expansion of
  the current page's connected component is available on demand);
- Obsidian-equivalent search grammar, filters, groups, force-setting panels,
  or time-lapse animation;
- changing graph data collection or relationship semantics;
- increasing `MAX_RING1` or `MAX_RING2`;
- persisting manually arranged positions across devices or publishing them
  into collected data;
- copying or reverse-engineering proprietary Obsidian source;
- replacing generic pan/zoom behavior for diagrams and images.

## Decision spike

Before production implementation, build isolated, disposable prototypes under
`.tmp/interactive-graph-layout/` using the same recorded graph fixtures:

1. Cytoscape.js with built-in CoSE.
2. vis-network with its default Barnes-Hut or ForceAtlas2-based physics.
3. Add fCoSE only if the Cytoscape core layout misses the layout criteria.

Each prototype must use:

- a sparse star-like graph similar to the reported screenshot;
- a crossing-prone two-hop graph;
- the maximum supported 71-node payload;
- long and duplicate-looking labels;
- directed outgoing and backlink edges;
- at least one URL-less static node.

Compare:

- crossings and avoidable overlaps after stabilization;
- label overlap and legibility;
- click-versus-drag reliability;
- hover-neighborhood implementation complexity;
- touch behavior;
- time to first usable layout and time to idle;
- idle CPU behavior;
- lazy chunk size and total transferred bytes;
- cleanup/reopen correctness;
- amount of product-specific glue code.

The spike is complete only when its evidence is written into this packet and
`OP-001` is maintainer-resolved. Throwaway prototypes must not become runtime
dependencies.

## Proposed implementation phases

Implementation starts only after the maintainer resolves the open renderer and
interaction decisions.

1. **Decision and fixtures** — capture representative payload fixtures, run
   the decision spike, select the renderer/layout, and record direct
   dependency and bundle consequences.
2. **Live viewport foundation** — give the graph a dedicated modal content
   host and lifecycle; retain the generic pan/zoom modal unchanged for other
   assets.
3. **Graph rendering and layout** — adapt the existing payload, implement
   deterministic seeding, topology-aware layout, collision/spacing, directed
   edge styles, and fit/reset behavior.
4. **Interactions** — implement exclusive click/drag/pan gesture ownership,
   node dragging, hover/focus neighborhoods, navigation, tooltips, and
   touch/keyboard behavior.
5. **Stability and accessibility** — stop/reheat rules, reduced motion,
   responsive labels, focusable alternative navigation, teardown, and
   Astro-navigation reactivation.
6. **Verification and rollout** — unit tests, real browser tests, static/lite
   profile checks, bundle comparison, and visual review against the recorded
   fixtures.

## Open points

| ID | Question | Working recommendation | Status |
| --- | --- | --- | --- |
| OP-001 | Which renderer/layout stack should be adopted? | Use vis-network with ForceAtlas2-based physics. | **Resolved — vis-network selected by maintainer** |
| OP-002 | What happens to a node after drag release? | Pin during drag, then briefly reheat and release; offer explicit pinning only if users need persistent manual arrangements. | Unresolved |
| OP-003 | Should the center node remain fixed? | Keep it softly anchored near the viewport center, not absolutely immovable, so topology still influences the layout. | Unresolved |
| OP-004 | How stable should repeat openings be? | Deterministic initial seed plus session-local positions; do not persist positions across sessions in the first pass. | Unresolved |
| OP-005 | Which labels remain visible by default? | Show plain page titles without neighbor-count suffixes; use a smaller font beyond ring 1. | **Resolved — implemented** |
| OP-006 | Is fCoSE necessary? | No by default; add it only when fixture evidence shows a material gain over Cytoscape's built-in CoSE. | Unresolved |
| OP-007 | Does hover include one hop or the full displayed subgraph? | One hop only: hovered node, direct neighbors, and connecting edges. | **Resolved — implemented** |
| OP-008 | What is the primary-node activation behavior? | Preserve single click/tap to open; classify node drag by movement before navigation rather than requiring a second click. | **Resolved — implemented** |
| OP-009 | What accessible alternative accompanies a canvas renderer? | Do not show a visible details/node-list panel in the graph modal. | **Resolved — removed by maintainer direction** |
| OP-010 | Is a user-facing force/settings panel part of the first release? | No; expose only compact reversible depth/Fit/Reset controls. | **Resolved — implemented** |

## Dependencies and constraints

- The existing graph payload should remain the single data contract.
- All profiles continue to obtain the initial neighborhood through
  `/graph/<sid>.json`; full-depth expansion uses the lazy `/graph/all.json`
  route and filters the current page's connected component in the client.
- A renderer package used directly must be declared directly even when the
  same package already appears transitively through Mermaid.
- The selected renderer must be loaded only when the graph is opened.
- Dynamic graph state must live in the graph viewport, not in
  `plans/`, `specification/`, collected content, or generated datasets.
- The graph viewport must not take over the generic diagram/image panzoom
  implementation.

## Risks

- Force layouts reduce visual stress but do not guarantee the minimum possible
  number of edge crossings.
- A continuous simulation can waste CPU or create a graph that never appears
  settled unless cooling and restart rules are explicit.
- Canvas/WebGL renderers do not provide native link/focus semantics for each
  node.
- Node drag, graph pan, click navigation, and touch scroll compete for the
  same gestures; the interaction state machine needs browser-level tests.
- Labels, rather than circles, are likely to dominate collision and spacing.
- Importing a package already used by Mermaid can still create a new or larger
  lazy chunk depending on bundler boundaries.
- Retaining positions too aggressively can make a changed graph worse;
  discarding them makes repeat openings feel unstable.
- Lite mode can reveal relationship data progressively, so the renderer must
  handle changed payloads without leaking simulation or event state.

## Exit criteria

Phase 6 is ready when the remaining pin/release, center anchoring, repeat-open,
and label-visibility choices are accepted, and live interaction acceptance
cases cover mouse, touch, reduced motion, close/reopen, and Astro navigation.

Implementation is complete when:

1. Node click/tap navigation is reliable and never fires after a node drag or
   viewport pan.
2. Nodes can be dragged, incident edges update continuously, and the layout
   responds according to the resolved release behavior.
3. Hover/focus emphasizes the direct neighborhood and dims unrelated graph
   elements.
4. The graph reaches an idle state after stabilization and releases all
   renderer/simulation resources on close or navigation.
5. Representative sparse, crossing-prone, long-label, and maximum-size
   fixtures remain usable at desktop and mobile viewports.
6. Full, JSON, static, and lite profiles retain route-prefix-safe node
   navigation and the existing relationship semantics.
7. Focused unit tests, browser interaction tests, plan checks, and the smallest
   relevant build/profile checks pass, with bundle and performance evidence
   recorded in `test.md`.
