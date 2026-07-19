# PlantUML Theme-Aware Rendering: Dark At Build Time, Light Lazily On Demand

## Problem Summary

PlantUML and BlockDiag both route through Kroki (`config.diagram.languages`,
[config.js:34-35](../../../config.js#L34-L35)), rendered once at build time by
`scripts/diagrams.js` and cached as a static SVG blob. `DiagramCode.astro`
([DiagramCode.astro:104-108](../../../src/components/markdown/code/DiagramCode.astro#L104-L108))
then serves that pre-rendered SVG through `Panzoom.astro` as a plain
`<object data="...">`.

`colors.css` documents this was a deliberate simplification
([colors.css:89-94](../../../src/layout/colors.css#L89-L94)): Kroki SVGs are
"always light" (dark ink on a light backdrop), and dark mode only dims the
surrounding surface (`--diagram-surface-bg: #EDEDED`) to cut glare — the
diagram content itself never changes with the site theme. Separately, an
unrelated bug was found and fixed this session: the PlantUML fullscreen
("expand full view") button silently did nothing, because
`DiagramCode.astro` only loaded `mermaid-render.js`/`panzoom_common.js`
conditionally on `isClientDiagram`
([DiagramCode.astro:360-364](../../../src/components/markdown/code/DiagramCode.astro#L360-L364)
pre-fix), and Astro's script-hoisting/index resolution doesn't handle
conditionally-rendered `<script src>` tags reliably — the wrong module ended
up wired to plantuml pages, so the modal's `open` event listener was never
attached. Fixed by making both script includes unconditional (verified with a
Playwright repro: click now opens the modal; mermaid pages unaffected).

The site has no server-side theme signal: `Layout.astro` resolves `data-theme`
entirely client-side, from `localStorage`/`prefers-color-scheme`, before first
paint (`Layout.astro:32-55`) — no cookie, no query param. Confirmed via
targeted exploration (grep for `cookie`/`Cookie` across `src/` returns zero
matches). So the server cannot pick the *correct* light/dark PlantUML render on
the very first response to a given visitor.

## Goal

Make PlantUML diagrams render with ink/surface colors that match the site's
active light/dark theme, without introducing a server-side theme signal and
without a blank/loading gap while the correct variant loads.

## Scope

- PlantUML code-fence diagrams only (`language === 'plantuml'`, rendered via
  `Code.astro` → `DiagramCode.astro`).
- **Dark** variant renders at build time (unchanged pipeline, `scripts/diagrams.js`),
  now with a dark skinparam header baked into the source before it's sent to
  Kroki.
- **Light** variant renders lazily, on first request, via a new server
  endpoint, and is cached to disk afterward so repeat requests are instant.
- The build-time dark SVG doubles as the initial paint for every visitor
  (known dimensions/shape/content) — light-theme visitors briefly see the dark
  render, then it's swapped client-side once the light variant is ready. No
  blank placeholder, no layout shift (same SVG dimensions either way).

## Non-Goals

- BlockDiag and any `linked_file`-type diagrams: unchanged, always-light,
  build-time only. BlockDiag has no equivalent to PlantUML's `skinparam`
  theming, and this pass explicitly scopes theming to PlantUML only (decided
  during planning discussion).
- A theme cookie for a fully correct SSR first paint. Considered and rejected
  during planning — the dark-render-as-skeleton approach makes it unnecessary
  and avoids touching `ThemeToggle.astro`/`Layout.astro`'s theme-resolution
  contract.
- Live-refreshing an already-open fullscreen modal when the theme is toggled
  mid-view. Matches existing (pre-existing, unrelated) behavior for Mermaid's
  modal — not a regression introduced here.
- Cache eviction/pruning for the new lazy-light file cache. Grows with unique
  `uid+versionId` pairs, same unpruned-forever behavior the existing build-time
  blob store already has.

## Considered Alternatives

**Pre-render both light and dark at build time.** Simpler code path (no new
endpoint), but doubles Kroki calls/build time for every PlantUML diagram
regardless of whether a given theme is ever viewed. Rejected in favor of true
lazy rendering per discussion — light-theme visitors are the minority case for
this site's default-dark theme, and the endpoint approach only pays the Kroki
cost when actually needed.

**Reuse the existing `blob_store`/`asset_info` sqlite/json schema for the light
variant instead of a plain file cache.** Investigated during exploration: the
runtime sqlite connection (`structure-db-sqlite.js`'s `ensureDb()`) is a
process-global **read-only** singleton
([structure-db-sqlite.js:9-20](../../../src/libs/structure-db-sqlite.js#L9-L20),
confirmed via `content-structure/src/sqlite_utils/index.js`'s path-keyed cache)
— a request-time writer would need its own separate read-write connection
(same pattern `scripts/diagrams.js:105` already uses), which works but adds
concurrency bookkeeping for no real benefit here. The json backend has no
incremental-write path at all: `structure-db-json.js` loads `content.json`
once into memory with no partial-write API. A content-addressed file cache
sidesteps both constraints and is backend-agnostic by construction. Chosen.

## Design

### 1. Shared render helper — `src/libs/diagram-render.js` (new)

Extract and generalize `scripts/diagrams.js`'s `renderDiagram()`
([scripts/diagrams.js:60-77](../../../scripts/diagrams.js#L60-L77)) and
`Code.astro`'s local `normalizeDiagramLanguage()`
([Code.astro:27-34](../../../src/components/markdown/code/Code.astro#L27-L34))
into one module importable from both the build script and Astro runtime code:

- `normalizeDiagramLanguage(value)` — same logic, reading
  `config.diagram.aliases`. Update `Code.astro` to import this instead of
  keeping its own copy.
- `PLANTUML_THEME_HEADER = {dark: '...', light: '...'}` — skinparam blocks
  built from existing `colors.css` tokens (see step 3), each starting with
  `skinparam backgroundColor transparent` so the SVG blends into whatever
  surface sits behind it.
- `injectPlantumlTheme(code, theme)` — finds the first line matching
  `/^@start\w+/m` and inserts the theme header immediately after it (falls
  back to prepending if no `@start` line is found). No-op if `theme` is
  falsy.
- `renderKrokiDiagram(language, code, theme)` — same renderer-resolution logic
  as today's `resolveRendererName`/`renderer.server` lookup
  ([scripts/diagrams.js:33-77](../../../scripts/diagrams.js#L33-L77)), calling
  `injectPlantumlTheme(code, theme)` first when `language === 'plantuml'`.

### 2. Build-time (dark) — `scripts/diagrams.js`

Replace the local `renderDiagram()` calls with
`renderKrokiDiagram(ext, code, ext === 'plantuml' ? 'dark' : undefined)` from
the new shared lib. Blob dedup, `asset_info`/`assets` writes, and skip-if-exists
caching are unchanged — the stored SVG blob is just rendered with the dark
skinparam header baked in now.

### 3. New CSS tokens — `src/layout/colors.css`

Leave `--diagram-surface-bg` untouched (BlockDiag/other kroki diagrams still
rely on its "always light, dimmed in dark mode" compromise). Add a new pair
scoped to themed PlantUML only, reusing existing site tokens for consistency:

```css
/* dark block, alongside existing :root[data-theme="dark"] tokens */
--plantuml-surface-bg: #252526;      /* matches --mermaid-surface-bg */
--plantuml-ink-color: #CCCCCC;       /* matches --content-color */
--plantuml-line-color: #888888;      /* matches --menu-border-left-color */
--plantuml-panel-bg: #2D2D2D;        /* matches --surface-2-bg */
--plantuml-note-bg: #444551;         /* matches --note-bg-color */

/* light block, alongside existing :root[data-theme="light"] tokens */
--plantuml-surface-bg: #FFFFFF;
--plantuml-ink-color: #24292F;       /* matches --content-color */
--plantuml-line-color: #6B6B6B;      /* matches --menu-arrow-color */
--plantuml-panel-bg: #ECECEC;        /* matches --surface-2-bg */
--plantuml-note-bg: #E8E8F6;         /* matches --note-bg-color */
```

`PLANTUML_THEME_HEADER` in the shared lib hardcodes the same hex values
directly (Kroki renders server-side and can't read CSS variables) — comment
each side pointing at the other so they don't drift silently. Treat these
exact hex choices as a first pass to eyeball once rendered; easy to retune
without touching any other part of the design.

### 4. Scoped surface swap — `DiagramCode.astro`

Add `data-language={language}` to the existing `.diagram-shell` wrapper
([DiagramCode.astro:44](../../../src/components/markdown/code/DiagramCode.astro#L44)).
Add a scoped CSS rule so only PlantUML shells pick up the new tokens for their
surface *and* their fullscreen modal backdrop — mirroring how
`.mermaid-diagram` already overrides `--lightbox-surface-bg`
([DiagramCode.astro:148](../../../src/components/markdown/code/DiagramCode.astro#L148)):

```css
.diagram-shell[data-language="plantuml"] .diagram {
  background-color: var(--plantuml-surface-bg);
  --lightbox-surface-bg: var(--plantuml-surface-bg);
}
```

### 5. Lazy light-render endpoint — `src/pages/diagrams/light-svg.js` (new)

Astro server endpoint (`export async function GET({url})`), route
`/diagrams/light-svg`. Confirmed this project's Astro middleware/endpoints run
identically under `astro dev` and the built node-adapter server (unlike
`server/server.js`'s separate hand-rolled Express `/blobs` handler, which only
runs in the latter) — an Astro endpoint is the one implementation that works
in both without dual wiring, same as `src/middleware.js` already does for
`/blobs/*`.

Backend-agnostic by design (see "Considered Alternatives"): reuses the
existing read-only lookup `getAssetInfoBlob_version(uid, versionId)`
(re-exported from `@/libs/structure-db`, confirmed identical call shape for
both sqlite and json backends —
[structure-db-sqlite.js:194-217](../../../src/libs/structure-db-sqlite.js#L194-L217),
[structure-db-json.js:246-264](../../../src/libs/structure-db-json.js#L246-L264))
for source text, and a plain file cache (not the sqlite/json asset tables) for
the rendered output.

```js
// query params: uid (required), v (versionId, optional, defaults to config.collect.version_id)
// cacheDir: join(blobsDir, 'lazy-light')  — blobsDir = same dir src/middleware.js already serves /blobs/ from
// cacheKey: sha256(`${uid}::${versionId}`) → `<cacheDir>/<key>.svg`
// - cache hit: read file, return with Content-Type: image/svg+xml, long Cache-Control
// - cache miss: getAssetInfoBlob_version(uid, versionId) → decode source → require
//   normalizeDiagramLanguage(asset.ext) === 'plantuml' (400 otherwise) →
//   renderKrokiDiagram('plantuml', code, 'light') → write cache file → return it
// - in-flight de-dupe via a module-level Map<cacheKey, Promise> so concurrent
//   requests for the same diagram don't fire duplicate Kroki calls
```

Mirror the ETag/Cache-Control/error-handling style already used in
`src/middleware.js:24-63` for consistency — that file is the direct in-repo
reference for "how this codebase serves an SVG with caching headers."

### 6. Client-side theme swap — `Panzoom.astro` + `panzoom_common.js`

`Panzoom.astro` gets one new prop, `themeLazy?: boolean` (passed `true` only
from `DiagramCode.astro` when `language === 'plantuml'` and
`!isClientDiagram`). When true, add to the container div
([panzoom.astro:51-57](../../../src/components/panzoom/panzoom.astro#L51-L57)):

- `data-theme-lazy="true"`
- `data-dark-url={asseturl}` (the existing build-time dark URL, already
  computed)
- `data-version-id={versionId}` (new prop threaded through from
  `DiagramCode.astro`, which already receives `versionId` at
  [DiagramCode.astro:18](../../../src/components/markdown/code/DiagramCode.astro#L18))

In `panzoom_common.js`, add:

```js
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function applyThemeToContainer(container) {
  if (container.getAttribute('data-theme-lazy') !== 'true') return;
  const obj = container.querySelector('object');
  if (!obj) return;
  if (currentTheme() === 'light') {
    const uid = encodeURIComponent(container.getAttribute('data-sid'));
    const v = encodeURIComponent(container.getAttribute('data-version-id') ?? '');
    const lightUrl = `/diagrams/light-svg?uid=${uid}&v=${v}`;
    if (obj.getAttribute('data') !== lightUrl) obj.setAttribute('data', lightUrl);
  } else {
    const darkUrl = container.getAttribute('data-dark-url');
    if (darkUrl && obj.getAttribute('data') !== darkUrl) obj.setAttribute('data', darkUrl);
  }
}
```

Call
`document.querySelectorAll('.container.panzoom[data-theme-lazy="true"]').forEach(applyThemeToContainer)`
at the start of `init()` ([panzoom_common.js:60-65](../../../src/components/panzoom/panzoom_common.js#L60-L65)),
before `init_svgs()`, so the swap request fires as early as possible
(DOMContentLoaded — same timing Mermaid already uses,
[mermaid-render.js:114-131](../../../src/components/markdown/code/mermaid-render.js#L114-L131)).
Call it again inside a new `mws:theme-change` listener, mirroring the one
already in `mermaid-render.js:122-124`, so manually toggling the theme swaps
already-mounted diagrams too.

### 7. Wiring in `DiagramCode.astro`

For the non-client branch
([DiagramCode.astro:104-108](../../../src/components/markdown/code/DiagramCode.astro#L104-L108)),
pass the new props through:

```astro
<Panzoom src={diagram_url} alt={alt} title={title} meta={meta} hash={uid}
  showOpenButton={false} themeLazy={language === 'plantuml'} versionId={versionId} />
```

## Implementation Phases

1. **Shared lib**: add `src/libs/diagram-render.js` (normalize, theme header,
   inject, render-via-Kroki). Update `Code.astro` to import
   `normalizeDiagramLanguage` from it instead of the local copy.
2. **Build-time dark**: update `scripts/diagrams.js` to call
   `renderKrokiDiagram(ext, code, ext === 'plantuml' ? 'dark' : undefined)`.
   Re-run `pnpm diagrams` (or `pnpm dev`, which runs it) so both existing
   PlantUML demo diagrams re-render with the dark header baked in.
3. **CSS tokens**: add the `--plantuml-*` pair to `colors.css`; add the
   `data-language` attribute and scoped rule in `DiagramCode.astro`.
4. **Lazy endpoint**: add `src/pages/diagrams/light-svg.js` with the file
   cache, in-flight de-dupe, and error handling described above.
5. **Client swap**: add `themeLazy`/`versionId` props to `Panzoom.astro`,
   thread them from `DiagramCode.astro`, add `applyThemeToContainer` +
   `mws:theme-change` listener to `panzoom_common.js`.
6. **Verify end to end** — see Exit Criteria / `test.md`.

## Dependencies and Risks

- Depends on the fullscreen-modal fix already landed this session (unconditional
  `mermaid-render.js`/`panzoom_common.js` script includes in `DiagramCode.astro`)
  — without it, the modal's `open` listener doesn't attach reliably, which
  would also affect verifying the theme swap visually inside the fullscreen
  view.
- Risk: the hand-picked skinparam hex values are a first pass, not
  pixel-verified against every PlantUML diagram type (sequence, component,
  mindmap, etc. each use different skinparam keys) — some diagrams may need
  additional skinparam lines beyond the ones listed here once visually
  reviewed.
- Risk: `injectPlantumlTheme`'s `/^@start\w+/m` detection assumes well-formed
  PlantUML source (starts with `@startuml`/`@startmindmap`/etc.) — malformed
  source falls back to prepending, which is a reasonable degradation, not a
  hard failure.
- The `lazy-light/` cache directory has no eviction; acceptable per Non-Goals,
  but note this if disk usage ever becomes a concern.

## Exit Criteria

- Loading a PlantUML page with the default (dark) theme shows the dark-rendered
  SVG immediately, with no request to `/diagrams/light-svg`.
- Forcing `data-theme="light"` (via the real theme toggle or by dispatching
  `mws:theme-change` directly) triggers a request to `/diagrams/light-svg?uid=...`,
  swaps the `<object data>`, and renders light ink on a light backdrop with the
  same dimensions as the dark version (no layout shift).
- Reloading the light-themed page is a cache hit — no second Kroki round-trip
  (verify via dev server logs or response timing).
- The fullscreen modal backdrop and cloned SVG both match the active theme, in
  both themes.
- BlockDiag diagrams elsewhere on the site are visually unchanged in both
  themes.
- Proof recorded in `test.md` once implementation happens.
