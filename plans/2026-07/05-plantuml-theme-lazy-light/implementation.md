# Implementation: PlantUML Theme-Aware Rendering

[######] Done - all six implementation phases from `plan.md` landed,
including a post-verification fix for a real regression found by the
maintainer. No follow-up work is outstanding.

Status: done. See `test.md` for verification proof (19/19 checks) and the
post-verification regression that was found and fixed (white diagram
backdrop caused by `<object>` embedding, not by the plan's design).

## Files changed

### `src/libs/diagram-render.js` (new)

Shared module used by both the build script and the runtime endpoint:

- `normalizeDiagramLanguage(value)` — moved out of `Code.astro`'s local copy.
- `resolveRendererName(language)` — moved out of `scripts/diagrams.js`.
- `PLANTUML_THEME_COLORS` — `{dark, light}`, each `{surface, ink, line,
  panel, note}` hex values, mirroring the `--plantuml-*` CSS tokens.
- `buildPlantumlThemeHeader(colors)` / `PLANTUML_THEME_HEADER` — generates a
  block of `skinparam` lines. Deviates from the plan in two ways (see
  `test.md` for the full story):
  - `skinparam backgroundColor` is set to a **literal hex color**
    (`colors.surface`), not `transparent`. `<object>`-embedded SVGs render on
    their own opaque white canvas in Chrome regardless of what the SVG's own
    background is; only an explicit color makes Kroki/PlantUML emit an
    inline `background:<color>` style on the root `<svg>` that actually
    paints through the `<object>` embed.
  - Themes the full set of PlantUML panel-style elements (`PLANTUML_PANEL_
    ELEMENTS`: Actor, Participant, Class, Component, Rectangle, Note, etc.),
    not just a minimal subset, since different diagram types use different
    skinparam keys and unused ones are silently ignored.
- `injectPlantumlTheme(code, theme)` — inserts the header right after the
  first `@start\w+` line (prepends if none found). No-op if `theme` is
  falsy.
- `renderKrokiDiagram(language, code, theme)` — POSTs to the configured
  Kroki-compatible renderer; calls `injectPlantumlTheme` first when
  `language === 'plantuml'`.

### `scripts/diagrams.js`

Removed the local `renderDiagram`/`normalizeLanguage`/`resolveRendererName`
in favor of importing from `diagram-render.js`. Both the sqlite and json
code paths now call:

```js
renderKrokiDiagram(ext, code, ext === 'plantuml' ? 'dark' : undefined)
```

Deviation from plan: this applies to **all** PlantUML sources, including
`linked_file`-type `.puml` files, not just `codeblock`/`code_block`
code-fence diagrams — both render through the same `DiagramCode.astro` →
`Panzoom.astro` theme-lazy path, so scoping only code-fence diagrams would
leave linked `.puml` diagrams always-light and visually inconsistent.
BlockDiag is untouched either way (no theme header for non-plantuml
languages).

### `src/layout/colors.css`

Added a `--plantuml-*` token pair (`surface-bg`, `ink-color`, `line-color`,
`panel-bg`, `note-bg`) to both the dark (`:root`, `:root[data-theme="dark"]`)
and `:root[data-theme="light"]` blocks, each with a comment cross-referencing
the mirrored hex values in `diagram-render.js`.

### `src/components/markdown/code/Code.astro`

Dropped the local `normalizeDiagramLanguage` copy; imports it from
`@/libs/diagram-render.js` instead.

### `src/components/markdown/code/DiagramCode.astro`

- Added `data-language={language}` to the `.diagram-shell` wrapper.
- Added scoped CSS: `.diagram-shell[data-language="plantuml"]` and its
  `.diagram` child pick up `--plantuml-surface-bg` for both their own
  background and `--lightbox-surface-bg` (so the fullscreen modal backdrop
  follows the same theme).
- Passes `themeLazy={language === 'plantuml'}` and `versionId={versionId}`
  through to `Panzoom` in the non-client-diagram branch.

### `src/components/panzoom/panzoom.astro`

New props `themeLazy?: boolean` and `versionId?: string`. When `themeLazy`
is true, the container div gets `data-theme-lazy="true"`, `data-dark-url`
(the existing build-time URL), and `data-version-id`.

### `src/components/panzoom/panzoom_common.js`

- `currentTheme()` — reads `data-theme` off `<html>`.
- `applyThemeToContainer(container)` / `applyThemeToAll()` — for each
  `[data-theme-lazy="true"]` container, swaps the `<object data>` between
  the build-time dark URL and `/diagrams/light-svg?uid=...&v=...` based on
  the active theme, only touching the DOM when the URL actually changes.
- Called once at the start of `init()` (before `init_svgs()`) and again on
  `mws:theme-change`, mirroring how `mermaid-render.js` re-renders on the
  same event.
- `processSVG` gained a `data-mws-processed` guard: both `init_svgs()`'s
  object-load listener and the new theme-swap load listener can fire for the
  same `<object>` document, so without the guard `svg_fix_size`/link/
  highlight post-processing could run twice.

### `src/pages/diagrams/light-svg.js` (new)

Astro server endpoint, `GET /diagrams/light-svg?uid=...&v=...`:

- Cache path: `sha256(uid::versionId)` → `<blobsDir>/lazy-light/<hash>.svg`.
- Cache hit: read the file straight off disk.
- Cache miss: `getAssetInfoBlob_version(uid, versionId)` for the source,
  400 if not a plantuml asset, `renderKrokiDiagram('plantuml', code,
  'light')`, write to cache, return.
- Module-level `Map<cacheKey, Promise>` de-dupes concurrent requests for the
  same diagram so they don't fire duplicate Kroki calls.
- No eviction (matches the plan's Non-Goals — same unpruned-forever
  behavior as the existing build-time blob store).

## Known limitation carried over from the plan

`structure-db-json.js` caches the parsed `content.json` for the life of the
dev server process, so a `pnpm diagrams` re-render while `astro dev` is
already running isn't visible until the server restarts. Not introduced by
this change — a pre-existing characteristic of the json/lite backend — but
worth knowing when iterating on diagram theming locally.
