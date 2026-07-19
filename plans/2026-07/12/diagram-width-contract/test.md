# Diagram Width Contract — Test Evidence

Method: Playwright (project devDependency) against `pnpm dev` on
`http://localhost:4323`, Chromium 1920×1080, 2026-07-12. The script measures
`getBoundingClientRect()` of every diagram SVG plus the usable `.content`
column width at three pane states, then flips the theme to dark (verified
via `data-theme="dark"`) and re-measures. Script: session scratchpad
`measure-diagram-widths.mjs`; re-runnable after any layout change.

Invariant checks applied to every row (tolerances: 0.5px upscale, 2px fill,
1% ratio): I1 no-upscale, I2 fill = min(natural, usable column − 26px
chrome), I3 viewBox ratio preserved, I4 same after dark re-render.

**Result: ALL INVARIANTS PASS — 2 mermaid + 7 plantuml shells × 4 states.**

## Demo Home (`/`) — Mermaid

Narrow fixture natural width 850px, wide fixture 2088px.

| State | Usable column | Narrow svg | Wide svg | Wide shell |
| --- | --- | --- | --- | --- |
| Both panes open | 1117px | 850.0 | 1090.9 | 1116.9 |
| Both panes closed | 1880px | 850.0 | 1854.1 | 1880.1 |
| Left open only | 1499px | 850.0 | 1472.5 | 1498.5 |
| Dark re-render, closed | 1880px | 850.0 | 1854.1 | 1880.1 |

The regression that motivated the packet is fixed: closing the panes grows
the wide diagram 1090.9 → 1854.1px while the narrow one never moves. Aspect
ratio 2.465 (viewBox) = 2.465 (rendered) at every state.

## PlantUML Demo (`/plantuml-demo`)

Five narrow fixtures (84–478px natural) plus the wide fixture (1160px).

| State | Usable column | Wide svg | Wide shell | Narrow shells |
| --- | --- | --- | --- | --- |
| Both panes open | 1117px | 1090.9 | 1116.9 | all 690 (=80ch) |
| Both panes closed | 1880px | 1160.0 | 1186.0 | all 690 |
| Left open only | 1499px | 1160.0 | 1186.0 | all 690 |
| Dark re-render, closed | 1880px | 1160.0 | 1186.0 | all 690 |

No-upscale proof: with 1880px available the wide PlantUML diagram stops at
exactly its natural 1160px (shell 1186 = 1160 + 26px chrome); every narrow
diagram renders at natural size inside the unchanged 80ch shell. All ratios
match their viewBox to three decimals.

## Not covered

- Static Kroki `<object>` path: implemented symmetrically but no Kroki
  content exists in the demo dataset to measure (all demo diagrams are
  client-rendered). Fallback is safe: without a published width the shell
  keeps the old `min(100%, 80ch)` behavior.
- Mobile (≤700px) layout: panes overlay instead of compressing the column,
  so the contract reduces to `min(100%, ...)`, unchanged from before.
