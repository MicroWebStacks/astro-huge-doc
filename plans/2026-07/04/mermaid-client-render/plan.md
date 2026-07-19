# Plan: Client-side Mermaid Rendering

## Handoff Status (as of 2026-07-04)

This plan has been reviewed against the actual codebase (not just drafted from
the problem description) and revised once. Anyone picking this up cold —
including a fresh session with no conversation history — should be able to
work from this document alone.

- **Core architecture is confirmed sound**: client-side rendering via a
  dynamically-imported `mermaid` package. The obvious alternative (render at
  build/collect time via `@mermaid-js/mermaid-cli`, which wraps puppeteer)
  was investigated and rejected — `scripts/stage-engine.js` shows the "lite"
  collect pipeline runs *locally inside the VS Code extension*, so bundling
  Chromium there would reintroduce the exact heavy-dependency problem this
  plan exists to remove. See "Considered Alternatives" for the full
  reasoning, including two other alternatives (CSS-variable re-theming,
  build-time syntax validation) that were checked against upstream Mermaid
  and are not currently viable.
- **One implementation detail changed from the first draft**: theme
  re-sync uses a `CustomEvent` dispatched from `ThemeToggle.astro`'s
  `applyPref()`, not a `MutationObserver` (see Phase 4) — simpler, and
  consistent with how the rest of this codebase handles theme reactivity.
- **Nothing has been implemented yet.** No code has been touched;
  `package.json`, `manifest.yaml`, `config.js`, `scripts/diagrams.js`,
  `DiagramCode.astro`, and `compose.yaml` are all still in their pre-change
  state.
- **Blocking on user sign-off for four Open Points before Phase 1 starts**:
  OP-001 and OP-002 are low-stakes defaults proposed but not yet confirmed.
  OP-003 (bundle-size measurement checkpoint) and OP-004 (whether to extend
  pan/zoom modal support to Mermaid) are the two decisions that could
  meaningfully change implementation size or scope — flagged explicitly
  rather than decided unilaterally. See "Open Points" below.
- **Next step**: get explicit answers on OP-001 through OP-004, then start
  at Implementation Phase 1. Phases are written to be executed in order
  (1 → 6); Phase 3 depends on Phase 2's config change existing, Phase 5
  depends on Phase 4's client script existing.

## Problem Summary

Mermaid and PlantUML/BlockDiag all route through the same Kroki renderer today
(`config.diagram.languages.{plantuml,blockdiag,mermaid} = 'kroki'`,
[config.js:33-37](../../config.js#L33-L37)). `scripts/diagrams.js` POSTs the raw
diagram source to a Kroki server (local Docker, `kroki.io`, or a corporate
endpoint) and caches the returned SVG as a content-addressed blob. This means
Mermaid diagrams never render at all without a reachable Kroki server —
including in the VS Code "lite" extension, where requiring an external server
defeats part of the point of a self-contained preview. Even the "local" Docker
option ([compose.yaml](../../compose.yaml)) just runs a `kroki-mermaid`
sidecar that is itself puppeteer/Chromium under the hood, not a lightweight
dependency.

Critically, `scripts/stage-engine.js` (`DOCS_PROFILE=lite + DOCS_BACKEND=json`)
confirms the "lite" collect pipeline runs **locally inside the VS Code
extension**, on the user's own machine, not just at a remote deploy step. That
rules out any build-time-headless-Mermaid alternative (see "Considered
Alternatives" below) — it would reintroduce the same heavy-Chromium problem
this plan exists to remove, just moved from a Docker sidecar into the
extension itself.

## Goal

Render Mermaid diagrams client-side, in the visitor's own browser (or the VS
Code extension's iframed preview), using Mermaid's browser bundle — no
server, no URL to configure, identical behavior in the "lite" and "full"
profiles. PlantUML/BlockDiag keep using Kroki unchanged; there is no practical
pure-JS renderer for those today.

## Scope

- Change only Mermaid's renderer routing; PlantUML/BlockDiag are untouched.
- Add `mermaid` as a client-bundled dependency (Vite code-splits it via
  dynamic `import()`, same pattern already used for `panzoom` and
  `@svgdotjs/svg.js`).
- Render Mermaid inline via a new client script, reusing the existing
  code/diagram toggle toolbar in `DiagramCode.astro`.
- Keep Mermaid diagrams in sync with the existing light/dark theme toggle, by
  hooking the theme-change moment explicitly rather than observing DOM
  mutations (see Phase 4 — this deviates from an earlier draft of this plan).
- Update the config defaults, `.env.example`, VS Code extension setting
  description, docs, and `compose.yaml` to reflect that Kroki no longer
  serves Mermaid.

## Non-Goals

- No pan/zoom **modal** (magnifier / full-screen) support for Mermaid in this
  pass, pending **OP-004** below. `panzoom.astro` only accepts a `src` URL and
  builds its own `<object>`/`<img>`; there's no existing path for handing it
  an already-live inline `<svg>`. If OP-004 resolves toward "defer," the
  "expand full view" button is simply omitted for Mermaid blocks — possible
  follow-up, not required here.
- No migration/cleanup of previously-Kroki-rendered Mermaid SVG blobs from
  earlier builds. They become harmless orphaned content-addressed blobs —
  `DiagramCode.astro` stops looking them up once a block is client-rendered,
  no stale-data bug results. (`scripts/clean-diagrams.js` already exists for
  anyone who wants to garbage-collect them.)
- No change to how linked `.mermaid`/`.mmd` **files** are detected — they
  already route through the same `Code.astro`/`DiagramCode.astro` pipeline
  via `Link.astro`'s language-keyed `is_diagram` check, so they inherit this
  change for free.
- No build-time Mermaid syntax validation. Considered and rejected — see
  "Considered Alternatives."

## Considered Alternatives

**Build-time headless rendering (`@mermaid-js/mermaid-cli` / puppeteer),
treating Mermaid like a fourth Kroki-style renderer.** This would keep static
SVGs, meaning zero client bundle cost, full pan/zoom-modal parity for free,
and no new theme-sync mechanism (generate light+dark SVGs and pick via CSS,
same trick `Highlighter.astro`/`highlighter.js` already use for Shiki's
dual-theme token colors). Rejected: `mermaid-cli` bundles puppeteer, which
needs a downloaded Chromium (~300MB). Since the "lite" collect pipeline runs
locally inside the VS Code extension (not just at deploy time), this would
mean every extension install either ships or downloads a full Chromium — far
heavier than the Kroki-Docker dependency this plan is trying to eliminate,
and it would fail outright in sandboxed/offline dev environments. Pure client
rendering (the `mermaid` npm package, no puppeteer) has no such cost.

**CSS-variable-driven re-theming (no re-render on toggle).** Mermaid supports
`themeVariables`/`themeCSS` for customizing generated colors; in principle,
passing CSS custom-property strings (`var(--mermaid-node-bg)`) as theme
variable values would let the *existing* `:root[data-theme]` CSS cascade
re-theme an already-rendered SVG for free, exactly like Shiki's dual-theme
emit — no re-render, no jank, no new sync mechanism at all. Checked against
upstream Mermaid: this is currently **not reliably supported** —
`sanitizeDirective.ts`'s validation strips `var(...)` values containing
dashes (mermaid-js/mermaid#6256, open), and native CSS-variable theming is
still an open feature request (mermaid-js/mermaid#6677). Worth revisiting if
upstream ships it, but not a v1 dependency.

**Build-time syntax validation via `mermaid.parse()`.** Would give the same
early-feedback safety net Kroki accidentally provides today. Rejected for
now: `mermaid.parse()` is documented to behave unreliably outside a real
browser (mermaid-js/mermaid#6370 — returns `false` in Node for definitions
that parse fine in-browser), and the Node-safe alternatives
(`@mermaid-js/parser`, `@a24z/mermaid-parser`) are separate, immature
dependencies. Not worth the added surface for what turns out to be a modest
gain — see the note under "Dependencies and Risks" about today's actual
error-handling behavior.

## Open Points

- **OP-001**: Remove the now-unused `mermaid` (kroki-mermaid) sidecar service
  and `KROKI_MERMAID_HOST` env from `compose.yaml`, since Kroki would only
  serve PlantUML/BlockDiag locally after this change.
  *Proposed resolution*: remove it now, alongside this change, rather than
  leaving a documented-but-dead container around. **Status: proposed, awaiting
  confirmation.**
- **OP-002**: Mermaid package version to install.
  *Proposed resolution*: `pnpm add mermaid` and take whatever current stable
  resolves (no pin needed beyond the normal `^` range `pnpm add` writes).
  **Status: proposed, awaiting confirmation.**
- **OP-003 (new)**: Mermaid's browser bundle is materially heavier than any
  client dep this repo has dynamically-imported so far (`panzoom` is a few
  KB, `photoswipe` a few tens of KB; Mermaid's core parser/layout engine
  plus dagre/d3/khroma commonly lands in the several-hundred-KB-to-1MB range
  even gzipped, though Mermaid v10+ does internally lazy-load
  diagram-type-specific renderers on demand, so a page using only flowcharts
  won't pay for sequence/gantt/etc. support). This is closer in weight class
  to `three`/`model-viewer` — the one dependency this repo currently keeps
  *out* of the client bundle entirely via `EXCLUDED_DEPS` +
  `astro.config.mjs`'s Vite alias — than to `panzoom`. Unlike `three`,
  though, Mermaid is needed in *both* profiles (aliasing it away from lite
  would defeat this plan's entire purpose), so the alias-exclusion escape
  hatch doesn't apply here regardless.
  *Proposed resolution*: proceed with the plain dynamic-import approach (this
  is genuinely the only viable option per the above), but treat "measure the
  actual gzipped chunk size once Phase 1 lands" as a required checkpoint
  before Phase 4/5, not an afterthought — add it as an explicit step and
  as an Exit Criterion. If the number is alarming, that's a signal to
  revisit (e.g. is there a smaller Mermaid-compatible renderer, or should
  Mermaid support be an opt-in/lazy-loaded-only-below-the-fold feature)
  rather than a reason to block this plan now. **Status: proposed, awaiting
  confirmation.**
- **OP-004 (new)**: Should the "expand full view" pan/zoom modal work for
  Mermaid too, rather than being dropped as a Non-Goal? `lib_panzoommodal.js`
  calls `panzoom(svg_img, zoomOptions)` directly on whatever DOM node it's
  given (line ~208) — today that node comes from an `<object>`/`<img>` built
  from a URL, but the `panzoom` library itself operates on any live DOM
  element, so handing it the already-rendered inline `<svg>` Mermaid produces
  is plausibly a small extension of `PanZoomModal`/`lib_panzoommodal.js`
  (accept an element reference as an alternative to a `src` URL) rather than
  new infrastructure. This matters more for Mermaid than it might seem:
  Mermaid's own genre (flowcharts, sequence diagrams) skews toward exactly
  the large/dense diagrams pan/zoom exists for, so losing that affordance
  only for Mermaid (while PlantUML/BlockDiag keep it) is a real, visible UX
  inconsistency, not a cosmetic gap.
  *Proposed resolution*: worth a short spike alongside Phase 5 to confirm the
  element-reference path actually works before committing either way — if
  cheap, fold it in; if it drags in real complexity (e.g. modal lifecycle
  assumptions tied to `<object>`/URL loading), fall back to the documented
  Non-Goal for v1. **Status: proposed, awaiting confirmation — this is the
  one decision in this plan that could meaningfully change implementation
  size, so flagging explicitly rather than deciding unilaterally.**

## Implementation Phases

1. **Dependency**: add `mermaid` to root `package.json` (`pnpm add mermaid`).
   Do not add it to `scripts/stage-engine.js`'s `EXCLUDED_DEPS` — that set is
   for native/server-only/full-only-feature deps (e.g. `three`, which backs a
   lite-dropped 3D viewer), not lite-supported client bundles. (See OP-003 on
   why this is the right call despite Mermaid's size.)

2. **Renderer routing**: change `manifest.yaml`'s `diagram.languages.mermaid`
   from `kroki` to `client` (add a short explanatory comment); mirror the
   same change in `config.js`'s `DEFAULT_MANIFEST.diagram.languages.mermaid`
   so the no-manifest default matches.

3. **Skip Mermaid in the render pipeline**: in `scripts/diagrams.js`, in both
   `runJson()`'s and `runSqlite()`'s per-asset loop (the `for` loops around
   lines 181 and 317), skip any asset whose resolved language renderer is
   `'client'` *before* building a `diagramUid` or calling `renderDiagram()` —
   no Kroki POST, no `code_diagram` asset/blob for Mermaid. `renderDiagram()`
   itself needs no change; it's never called for `client`-routed languages.

4. **Client render script**: add
   `src/components/markdown/code/mermaid-render.js` (non-inline, Vite-bundled,
   following the existing `panzoom.js` guarded-init idiom):
   - Dynamically `import('mermaid')` (code-split; only loaded on pages that
     use it).
   - Maps current theme (`document.documentElement.getAttribute('data-theme')`)
     to Mermaid's `'default'` (light) / `'dark'` theme.
   - For each `.mermaid-diagram[data-uid]` container, reads raw source from a
     sibling `<template data-mermaid-source>` (inert, HTML-escaped by
     default — avoids attribute-escaping and CSP issues), calls
     `mermaid.render(sanitizedId, source)`, injects the `svg` into a
     `.mermaid-output` mount div, calls `bindFunctions?.(mount)`.
   - Sets `securityLevel: 'strict'` (docs content can come from multiple
     fetched repos — don't allow raw HTML/script injection via diagram
     labels).
   - Catches render errors and shows an inline error message instead of a
     blank pane (raw source stays visible via the existing code toggle
     regardless). Note: this is a **UX improvement** over today's behavior,
     not a new failure mode to guard against — see "Dependencies and Risks."
   - **Theme sync**: rather than a `MutationObserver` on `<html>` (a pattern
     with no precedent anywhere in this codebase — every existing
     theme-reactive surface, e.g. Shiki's dual-theme CSS variables in
     `Highlighter.astro`, reacts passively via CSS, never by re-invoking a
     render function), add one line to `ThemeToggle.astro`'s `applyPref()`
     (the single existing chokepoint for every theme change, covering both
     manual toggle clicks and the OS-driven "auto" re-sync): dispatch a
     `document.dispatchEvent(new CustomEvent('mws:theme-change', {detail:
     {theme: resolved}}))` after setting the attributes. `mermaid-render.js`
     listens for that event and re-renders all currently-mounted diagrams.
     This is simpler than a generic mutation observer, fires only on actual
     theme changes (not incidentally on any other attribute churn), and
     costs one line in a file that already exists for exactly this purpose.

5. **`DiagramCode.astro`** changes:
   - Compute `rendererName = config.diagram?.languages?.[language]` and
     `isClientDiagram = rendererName === 'client'`. This must be independent
     of the existing `hasDiagram` (asset-exists) check — today `DiagramCode`
     decides whether to show the toggle UI purely by whether a Kroki SVG
     asset exists, so a block in a diagram language with no rendered asset
     (e.g. Kroki was unreachable at build time) silently falls back to plain
     code with **no toggle at all**. `isClientDiagram` needs to force the
     toggle UI on for Mermaid regardless of any stale/absent asset row.
   - Only resolve the Kroki-produced SVG URL when `!isClientDiagram`.
   - When `isClientDiagram`, render the mermaid-diagram container +
     `<template data-mermaid-source>` instead of `<Panzoom>`; keep the
     existing toggle toolbar and `<Highlighter>` code view as-is; omit the
     "expand full view" button unless OP-004 resolves toward including it.
   - Add `<script src="./mermaid-render.js">` and small `<style>` rules for
     `.mermaid-output svg` sizing and `.mermaid-error`.

6. **Infra/config/docs cleanup** (pending OP-001/OP-002 confirmation):
   - `compose.yaml`: remove the `mermaid` sidecar + `KROKI_MERMAID_HOST` env.
   - `.env.example`: note `MICROWEBSTACKS_KROKI_SERVER` now only affects
     PlantUML/BlockDiag.
   - `packages/vscode-extension/package.json`: trim the
     `microwebstacks.preview.krokiServer` setting's `markdownDescription` to
     drop "mermaid" from the renderer list.
   - Root `readme.md` and `packages/vscode-extension/README.md`: brief
     wording update — Mermaid renders client-side with no server config;
     Kroki is only needed for PlantUML/BlockDiag.

## Dependencies and Risks

- The VS Code extension's preview is a `WebviewPanel` whose HTML is only a
  CSP-restricted shell containing `<iframe src="http://localhost:<port>/">`
  ([extension.js:588-614](../../packages/vscode-extension/extension.js#L588-L614)).
  That CSP (`default-src 'none'; frame-src ...; style-src 'unsafe-inline'
  ...`) applies only to the wrapper shell document, which has no scripts of
  its own — the actual docs page loads cross-origin inside the iframe as a
  separate document with its own (or no) CSP, confirmed to behave like a
  normal browser tab. The client bundle needs no special CSP handling there.
- `Code.astro` already resolves and passes the raw `code` text regardless of
  whether any SVG asset exists, and no other consumer (`Link.astro`, the TOC
  `hasDiagram` annotation in both `structure-db-json.js`/
  `structure-db-sqlite.js`, `content-structure`) assumes a rendered SVG asset
  exists for every diagram-language code block — all are keyed on language
  name alone (a truthy check against `config.diagram.languages`, not asset
  existence). Skipping Mermaid in `scripts/diagrams.js` should not break any
  of these.
- **Today's actual error-handling behavior**: a Kroki render failure (bad
  syntax, unreachable server) is already just `console.error`'d and the loop
  `continue`s (`scripts/diagrams.js`, both `runSqlite()` and `runJson()`
  loops) — it does not fail the build/CI today. The failure mode a visitor
  currently sees for a broken Mermaid diagram is silent degradation to plain
  code with no indication anything is wrong. The client-render approach's
  inline error message is therefore a strict improvement in visible
  feedback, not a new risk to mitigate — worth stating explicitly so this
  isn't mistaken for a regression during review.
- Existing content to validate against: `content/demo/readme.md` and
  `content/examples/diagrams/readme.md` both contain fenced ```mermaid
  blocks.

## Exit Criteria

- A Mermaid code block renders in the browser with no network request to any
  Kroki server.
- The existing code/diagram toggle still works for Mermaid blocks.
- Toggling light/dark theme re-renders visible Mermaid diagrams to match,
  via the `mws:theme-change` event (not a MutationObserver).
- PlantUML/BlockDiag blocks still round-trip through Kroki unaffected.
- A lite-profile build with Kroki entirely unreachable still renders Mermaid
  pages fully, while PlantUML falls back gracefully — proving Mermaid's
  independence from any server end-to-end.
- The `mermaid` chunk's actual gzipped size has been measured and recorded
  (OP-003) — not blocking, but a required data point before calling this
  done.
- OP-004 has an explicit resolution (include or defer pan/zoom parity), not
  a default-by-omission.
- Proof recorded in `test.md` once implementation happens.
