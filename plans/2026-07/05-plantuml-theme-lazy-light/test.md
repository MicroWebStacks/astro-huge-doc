# Test: PlantUML Theme-Aware Rendering

Status: implemented and verified end to end via a Playwright script driving
`astro dev` (json/lite backend, `MICROWEBSTACKS_KROKI_SERVER=https://kroki.io`).
19/19 assertions passed on the final run against `/plantuml-demo` (two
code-fence PlantUML diagrams); an earlier 18/18 run against
`/examples/diagrams` (two code-fence + one linked `.puml` diagram alongside a
BlockDiag diagram) also passed before a real regression was found and fixed
post-hoc — see "Regression found after initial verification" below.

- [x] Default (dark) load of a PlantUML page shows the dark SVG immediately,
      no request to `/diagrams/light-svg`.
      Verified: `data-theme=dark` on load, 0 requests to `/diagrams/light-svg`,
      all PlantUML `<object data>` URLs are build-time `/blobs/*.svg`.
- [x] Forcing light theme triggers `/diagrams/light-svg?uid=...`, swaps the
      `<object data>`, and renders light ink on a light backdrop with no
      layout shift versus the dark version.
      Verified: clicking the theme toggle (dark → light) fires exactly one
      `/diagrams/light-svg?uid=...` request per PlantUML diagram, `<object
      data>` swaps to the endpoint URL, and the rendered object's
      `getBoundingClientRect()` width/height is pixel-identical before/after
      (e.g.668×453 both times — the source SVG's `viewBox`/`width`/`height`
      are byte-identical between the dark blob and the light-svg cache file,
      only skinparam colors differ). The fetched light SVG body contains the
      light panel color `#ECECEC` and an explicit `background:#FFFFFF` style
      on the root `<svg>` (see regression note below for why it must be an
      explicit color, not `transparent`).
- [x] Reloading the light-themed page is a cache hit (no second Kroki
      round-trip).
      Verified: first request per diagram took ~250-300ms (Kroki round
      trip); reloading the page re-issues `/diagrams/light-svg` requests
      (client always requests the endpoint on light theme) but each resolves
      from the on-disk cache in `dataset/json/blobs/lazy-light/<sha256>.svg`
      in ~2-4ms. A direct curl double-request showed timings of 0.29s (miss)
      then 0.004s (hit) for the same uid/version.
- [x] The fullscreen modal backdrop and cloned SVG both match the active
      theme, in both themes.
      Verified: opening "expand full view" on a PlantUML diagram in light
      theme shows a modal with `.modal` background `rgb(255, 255, 255)`
      (`--plantuml-surface-bg` light) and the cloned SVG inside a shadow
      root; toggling back to dark and reopening shows `.modal` background
      `rgb(37, 37, 38)` (`--plantuml-surface-bg` dark). Screenshots recorded
      during the run (dark page, light page, modal-light, modal-dark) match
      expectations by eye — dark ink/panels on a dark backdrop in dark mode,
      dark ink-on-light in light mode, both fully legible.
- [x] BlockDiag diagrams elsewhere are visually unchanged in both themes.
      Verified: the BlockDiag `<object data>` stayed a static `/blobs/*.svg`
      URL across both theme toggles (never touched by the theme-lazy swap
      logic, since `data-theme-lazy` is only set for `language === 'plantuml'`),
      and the screenshots show its "always light" white card in both themes,
      matching pre-existing behavior.

## Regression found after initial verification (fixed)

After the first passing run, the user reported a real visual bug on
`/plantuml-demo`: participant/actor boxes rendered with the correct dark
panel colors, but the diagram's overall backdrop stayed **white**, so the
light-gray "dark ink" text (meant for a dark backdrop) was barely legible.
Screenshot comparison confirmed it — box fills were themed correctly, page
background was not.

**Root cause**: `PLANTUML_THEME_HEADER` used `skinparam backgroundColor
transparent` (per the original plan design) on the assumption that a
transparent PlantUML canvas lets the surrounding `.diagram-shell[data-language
="plantuml"] .diagram { background-color: var(--plantuml-surface-bg) }` CSS
show through the `<object>` element. That assumption is wrong: browsers render
`<object data="...svg">`-embedded SVG documents in their own opaque-white
browsing context by default — unlike `<img>`, which respects the SVG's alpha
channel, `<object>` does not let the parent page's CSS paint behind it.
Confirmed directly against Kroki: rendering with `skinparam backgroundColor
transparent` produces no background-related attribute on the root `<svg>` at
all (genuinely transparent XML), yet still displays white when loaded via
`<object>` in Chrome — while rendering with an explicit hex color
(`skinparam backgroundColor #252526`) makes Kroki/PlantUML emit an inline
`style="...;background:#252526;"` on the root `<svg>` element itself, which
*does* paint correctly through `<object>`.

Secondary finding during the fix: the demo source's own `skinparam monochrome
true` (declared after our injected header, since injection happens right
after `@startuml`) puts the color scheme through PlantUML's monochrome/
grayscale pass. With an explicit background hex this only shifts the value by
one unit (`#252526` → `#252525`, imperceptible) rather than reverting to white
outright — a happy side effect of moving from "transparent" to an explicit
color, not a separate fix.

**Fix**: `PLANTUML_THEME_COLORS` gained a `surface` field per theme (mirroring
`--plantuml-surface-bg`), and `buildPlantumlThemeHeader` now emits `skinparam
backgroundColor ${surface}` (a literal hex value) instead of `skinparam
backgroundColor transparent`, with a comment explaining why. Re-verified with
an added assertion (`rendered SVG root has an explicit dark/light background
style`) reading `obj.contentDocument.querySelector('svg').getAttribute('style')`
directly, plus a visual screenshot comparison — dark page now shows fully
legible light text on a dark diagram backdrop, matching the surrounding shell;
light page shows dark text on white, unchanged.

## Implementation notes / other deviations from plan

- `renderKrokiDiagram`/`normalizeDiagramLanguage`/`injectPlantumlTheme` in
  `src/libs/diagram-render.js` match the plan's design apart from the
  background-color fix above; `PLANTUML_THEME_HEADER` additionally themes
  PlantUML's panel-style elements (Actor, Participant, Class, Component,
  Rectangle, Note, etc. — the full list PlantUML supports regardless of
  diagram type) rather than a minimal set, since different PlantUML diagram
  types (sequence, WBS/mindmap, component) use different skinparam keys and
  PlantUML silently ignores unused ones.
- `scripts/diagrams.js` themes **all** PlantUML renders dark, including
  `linked_file`-type `.puml` sources — not just code-fence diagrams. The
  plan's prose focuses on code-fence PlantUML, but `DiagramCode.astro`/
  `Panzoom.astro` render both `codeblock` and `linked_file` PlantUML through
  the identical theme-lazy path (both normalize to `language === 'plantuml'`),
  so scoping only code-fence diagrams would have left linked diagrams
  always-light and broken visual consistency. BlockDiag `linked_file`
  diagrams are untouched either way (blockdiag has no theme header).
- Discovered while verifying: `structure-db-json.js` caches the parsed
  `content.json` in a module-level variable for the life of the dev server
  process. Re-running `pnpm diagrams` while `astro dev` is already running
  does not pick up newly-regenerated blob hashes until the dev server
  restarts — not a regression from this change, just a pre-existing
  characteristic of the json backend that affected the verification
  workflow (restarts were needed after each `pnpm diagrams` re-render).
- Added a de-dupe guard (`data-mws-processed`) in `panzoom_common.js`'s
  `processSVG` since both `init_svgs()`'s object load listener and the new
  theme-swap load listener can fire for the same `<object>` document; without
  it `svg_fix_size`/link/highlight processing could run twice.

## Commands run

- `pnpm diagrams` (several times across the implementation and the
  background-color regression fix) — regenerated all PlantUML build-time
  blobs; BlockDiag diagrams were skipped (already cached, unaffected by the
  change).
- `node node_modules/astro/astro.js dev` — ran the dev server directly
  (json/lite backend already configured via `.env`) against
  `https://kroki.io` for rendering.
- Scratch Playwright scripts: a 19-assertion end-to-end suite covering all
  five exit criteria plus the background-style regression check (final run
  against `http://localhost:4322/plantuml-demo`, after a stray dev server
  bumped the port), and a smaller DOM-inspection script used to diagnose the
  white-backdrop bug directly against the live page.
