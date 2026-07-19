# Page render preview on link hover

## Status

Fully ruled — all design decisions AD-001 … AD-008 and open points
OP-001 … OP-008 are closed as of 2026-07-19 (see the decision register).
Highlights of the rulings: end-game modal (no live browsing inside, any
click navigates the full window), modal identical in size to the diagram
lightbox, modal state in URL query params (back-navigable and shareable),
warm cache N = 3, fragment section-scroll as a configurable best-effort;
every remaining high-confidence proposal was accepted as written.
**Phase 0 is the gate**: the extension iframe-in-iframe concept test runs
before any build work and decides whether the design proceeds, degrades
(previews off in extension mode), or is redesigned.
**Phase 0 result (2026-07-19): PASS** — see `implementation.md` for the
harness and full findings. AD-001 stays closed; phases 2-5 (build work) are
cleared to start.

## Problem summary

Internal links give no feedback about their target before a full navigation.
The maintainer wants a hover preview: hovering an internal page link shows
that something was caught (loading indicator), then — about one second
deferred — a theme-consistent elevated popup containing a scaled-down rendering
of the target page. A toolbar at the top offers the choice to open the page
directly or open the larger preview modal; clicking the rendered thumbnail
also promotes it to the modal. From the modal's header the user can close it
or navigate to the previewed page for real. Previews are **not recursive**:
links inside a preview do not themselves offer previews; only after actually
navigating to a page do its links become previewable. External links never
get a preview.

## Findings — what the codebase already provides

- **Internal/external classification already exists at render time.**
  `src/components/markdown/Link.astro` marks external links
  (`url.startsWith('http')`) with class `external` and `target="_blank"`;
  everything else is an internal page link or an asset link (`asset_uid`
  resolved to a blob URL). So the client can select internal page anchors
  without re-deriving anything: article anchors that are not `.external` and
  do not point at blob/asset URLs. The dataset additionally keeps per-link
  records (`links` in `content-structure`), but the DOM classes are
  sufficient — no dataset change is needed.
- **Every page is a self-contained HTML document at its URL** in all run
  modes: SSR (`output: server`, on-demand render through
  `src/pages/[...url].astro`), static builds (pre-rendered files), dev, and
  the extension preview (express wrapper / astro middleware). An iframe
  pointing at the target href therefore renders the true page — markdown,
  KaTeX, client-rendered diagrams, theme — with zero new server surface.
  Unknown URLs answer honest 404s (run-modes spec), so a failed preview is
  detectable via the response status.
- **A modal precedent exists**: the panzoom lightbox
  (`src/components/panzoom/panzoommodal.astro`) — fixed overlay, 90vw/90vh
  surface, close header, lightbox design tokens from `colors.css`. The
  preview modal should reuse the same tokens and interaction conventions
  (click-outside/× to close) but is a separate component: it hosts a live
  iframe plus a navigation header, not an injected SVG.
- **The layout already has a client-script pattern** (`Layout.astro` bottom:
  `menu_interactions_activation.js`, conditional `lazy_navigation.js`), so a
  site-wide `link_preview.js` slots in the same way and reaches static,
  SSR, and extension modes alike.
- **The VS Code extension displays the site inside an iframe** onto the
  local server, so a preview iframe there is an iframe-in-an-iframe on the
  same origin — verified working by the Phase 0 concept gate (2026-07-19,
  see `implementation.md`).
- **Lite/lazy interaction is favorable**: in the lite backend a hovered
  page's first render triggers its on-demand parse (cached by content hash) —
  the preview doubles as a prefetch warm-up, consistent with the
  extension-performance packet's "spend resources only on what the user is
  about to look at" (the hover *is* intent).

## Goal

Hovering an internal page link in the article:

1. immediately shows a small "caught + loading" indicator (circular
   progress) anchored to the link;
2. about one second after hover start, a theme-consistent small popup near the
   link shows the target page scaled down as a thumbnail (content only, no
   site chrome), even when that page is already warm-cached;
3. the popup toolbar offers **open page** (real navigation) and **open
   preview**; the latter, or clicking the thumbnail, opens a large modal
   (almost full screen, diagram-lightbox style) with a header offering
   **close** and **open page**;
4. inside a preview, links are inert as previews (no modal-in-modal, no
   recursion) — they become previewable only after real navigation;
5. external links and asset links are untouched.

## Non-goals

- No preview for external URLs (privacy, cross-origin framing, and the
  existing `↗` affordance already signals "leaves the site").
- No recursive preview chains.
- No dataset/schema changes; no new server endpoints.
- No touch/mobile hover emulation in the first iteration (OP-006).

## Decision register

All decisions and open points in one review surface — **all closed as of
2026-07-19**. Rows the maintainer ruled with modifications carry a
**Ruled:** note; the rest were accepted as proposed. The detailed AD/OP
sections keep the full rationale and alternatives. AD-001 was conditional
on the Phase 0 concept gate; the gate passed 2026-07-19, so the condition
is discharged and AD-001 is definitively closed.

| ID | Topic | Resolution | Proposal | Confidence |
| --- | --- | --- | --- | --- |
| AD-001 | Preview rendering technique | closed | **Accepted as proposed:** same-origin iframe of the real target URL; no fetch-and-inject (Phase 0 gate passed 2026-07-19 — reopen condition discharged) | High |
| AD-002 | Chrome-stripped preview view | closed | **Accepted as proposed:** client-side preview-mode flag + CSS hides app bar/menus/TOC; works in static, SSR, extension | High |
| AD-003 | Interaction timeline | closed | **Refined 2026-07-19:** ~150 ms intent delay → spinner on every sustained hover (including warm hits) + hidden iframe load when needed → popup when both ~1 s elapsed and iframe loaded | High |
| AD-004 | Popup → modal promotion | closed | **Refined 2026-07-19:** theme-aware elevated thumbnail card with explicit open-page / open-preview actions; preview action re-parents the same iframe into a stable modal | High |
| AD-005 | No-recursion enforcement | closed | **Ruled:** modal is end-game — preview script disabled inside iframes *and* any click inside navigates the full window, dismissing the modal | High |
| AD-006 | Link eligibility scope | closed | **Accepted as proposed:** `.article-slot` anchors only: same-origin page URLs, not `external`, not assets, not pure fragments | High |
| AD-007 | Caching / resource ceilings | closed | **Accepted as proposed:** one live preview at a time; last 3 dismissed iframes kept warm (OP-007); no persistent cache | High |
| AD-008 | Modal state in URL query params | closed | **Ruled (maintainer-directed):** open modal recorded as `?preview=<url>` on the host page — back button restores, links can open a page with the modal already open | High |
| OP-001 | Indicator placement/shape | closed | **Accepted as proposed:** small spinner absolute-positioned after the anchor (like `.external::after`), no layout shift | High |
| OP-002 | Preview-mode signal | closed | **Ruled:** fragment signal accepted; section-scroll composition is a configurable best-effort — if it fights us, disable it (see OP-008) | High |
| OP-003 | Modal size | closed | **Ruled:** identical to the diagram lightbox (90vw/90vh) — same not-quite-full-screen size, no smaller variant | High |
| OP-004 | Clicks on links inside preview | closed | **Ruled:** any click opens in the full window and the modal disappears — no live website inside the modal | High |
| OP-005 | Scope beyond article links | closed | **Accepted as proposed:** menus / app bar / TOC never get previews | High |
| OP-006 | Non-hover inputs | closed | **Accepted as proposed:** pointer hover now, `focusin` parity if cheap; touch out of scope | High |
| OP-007 | Warm-cache depth | closed | **Ruled:** keep last N = 3 dismissed previews alive | High |
| OP-008 | Cross-page fragment links | closed | **Ruled:** try opening the preview at the target section behind a config option; if it does not work reliably, don't fight it — disable and land at page top | Medium |

## Design decisions (all ruled 2026-07-19)

AD-001 … AD-004, AD-006, AD-007 were accepted as proposed; AD-005 and
AD-008 carry maintainer modifications, noted inline.

- **AD-001 — Render the preview in a same-origin iframe of the target URL,
  not by fetching and injecting content.** The iframe gives full fidelity
  for free: page CSS, KaTeX, client-rendered mermaid/PlantUML, theme
  bootstrap all just run. Fetch-and-inject would need script re-execution,
  style scoping, and per-feature care — permanently fragile. Cost: the
  iframe loads the full layout (app bar, menus); AD-002 strips it.
  **Confidence: high.**
- **AD-002 — A client-side "preview mode" flag strips site chrome inside
  the iframe.** The preview loads `<url>#__preview` (or the iframe reads
  `window.frameElement?.dataset`). A tiny early script in `Layout.astro`
  detects the flag and sets a `body`/`html` class; CSS hides header, side
  menus, TOC rail, and resize gutters, leaving only `article .article-slot`.
  Client-side detection is chosen because static builds cannot vary
  pre-rendered HTML by query param — a hash/frame flag works identically in
  static, SSR, and extension modes. The same flag **disables the link
  preview script itself** inside the iframe, which is the whole
  no-recursion guarantee (AD-005). **Confidence: high.** (Fragment choice
  vs frame-dataset detection: OP-002.)
- **AD-003 — Interaction timeline.** On `mouseenter` of an eligible anchor,
  arm a short intent delay (~150 ms) to ignore drive-by passes; then always
  show the circular progress indicator at the link and, for a cold entry,
  start loading the iframe off-screen/hidden. The popup reveals when **both**
  the ~1 s hover
  deferral has elapsed **and** the iframe has fired `load` (whichever is
  later) — the user asked for "one second deferred", and gating on load
  means the popup never shows a white frame. The deferral also applies to
  warm-cache hits so an already-loaded preview cannot pop up accidentally.
  Leaving the link *and* the
  popup dismisses it (small grace gap so the pointer can travel into the
  popup). Pointer leave can dismiss only this transient flow; a promoted
  modal stays open until outside click, `Escape`, or close. **Confidence: high.**
- **AD-004 — Popup→modal promotion reuses the same iframe.** The popup is a
  fixed-position, theme-aware elevated card (~28–24 rem, viewport-clamped)
  with a neutral one-pixel boundary and shadow rather than an accent outline. Its
  iframe is rendered at a larger logical viewport and scaled down to form a
  recognizable page thumbnail. A top toolbar provides **Open page** and
  **Open preview** explicitly; Open preview or clicking the thumbnail
  re-parents/expands the same container into the modal shell —
  no second load, scroll position preserved. The modal follows the diagram
  lightbox's overlay pattern and tokens, sized exactly like the diagram
  lightbox (90vw/90vh — OP-003 ruling), with a header bar: page title
  (iframe `document.title`), **Open page** (navigates top window), **×**
  close. Opening the modal records it in the host page's URL query params
  (AD-008 ruling). **Confidence: high.**
- **AD-005 — No-recursion enforcement lives in the preview page itself.**
  **Ruling (2026-07-19): accepted, strengthened — the modal is end-game.**
  The preview is never a live website to keep working in: the chrome-strip
  flag (AD-002) short-circuits `link_preview.js` so a previewed document
  never arms hover handlers, **and** every click inside the popup/modal on
  an internal link opens that URL in the full window while the modal
  disappears. The iframe never navigates within the preview; there is no
  state-sync, no stale header, and recursion is cut short by construction.
  **Confidence: high.**
- **AD-006 — Eligibility: article content links only, in the first
  iteration.** Selector scope: anchors under `.article-slot` that (a) are
  same-origin relative page URLs, (b) lack class `external`, (c) are not
  blob/asset URLs (`getAssetUrl` targets), (d) are not pure in-page
  fragments (`#...`). Menu/app-bar links are already instant-feedback
  navigation surfaces; adding hover popups there fights the menu
  interactions. Extendable later (OP-005). **Confidence: high.**
- **AD-007 — Caching and resource ceilings.** One preview at a time; the
  hidden iframe is destroyed on dismissal, but the last N (~3) previewed
  URLs keep a detached, paused iframe for load-free re-show within the
  session. The intentional hover deferral still applies. No persistent cache
  — the browser HTTP cache and (in lite) the
  hash-keyed server record already de-duplicate the expensive work. The
  hover intent delay caps spurious SSR renders from pointer sweeps.
  **Confidence: high** on mechanism; N ruled in OP-007 (N = 3).
- **AD-008 — Modal state lives in the host page's URL query params.**
  **Ruling (2026-07-19): maintainer-directed, accepted.** Promoting a
  preview to the modal pushes a history entry with a query param on the
  *host* page (proposal: `?preview=<target-url>`); closing the modal pops
  it. Consequences, all intended: the browser back button returns the user
  to the page with the modal open, and a URL carrying the param is
  shareable — loading it opens the page with the modal already open (no
  hover flow needed). Implementation is pure client-side
  (`history.pushState` on promote + reading `location.search` on page
  load), so it works identically in static builds, SSR, and the extension;
  pre-rendered HTML never varies by query param. The param applies to the
  **modal only** — the transient hover popup is not URL state. Clicks
  inside the preview and the "Open page" action navigate to the clean
  target URL without the param (AD-005). **Confidence: high.**

## Open points (all resolved 2026-07-19)

- **OP-001 — Indicator placement and shape.** **Resolved 2026-07-19:
  accepted as proposed** — a small spinner immediately after the anchor,
  absolute-positioned like `.external::after`, no layout shift. The
  cursor-attached alternative is rejected.
- **OP-002 — Preview-mode signal.** **Resolved 2026-07-19:** fragment
  signal (`#__preview`) plus `data-` attribute belt-and-braces, as
  proposed; the flag never leaks into "Open page" navigation URLs. The
  hard part — composing the signal with a real target fragment so the
  preview opens *at the linked section* — is ruled a **configurable
  best-effort**: attempt it behind a config option; if it does not work
  reliably, do not fight it — disable the section-scroll and land at page
  top (same ruling as OP-008).
- **OP-003 — Modal size.** **Resolved 2026-07-19: identical to the diagram
  lightbox** — 90vw/90vh, itself smaller than full screen. No smaller
  variant; the two modal kinds share the same size.
- **OP-004 — Clicks on links inside the popup/modal.** **Resolved
  2026-07-19: the modal is end-game.** Any click inside the preview opens
  that URL in the full window and the modal disappears — never a live
  website kept working inside a modal website. Folded into the AD-005
  ruling; the rejected alternatives (iframe navigates internally with a
  following header; fully inert links) are recorded there for history.
- **OP-005 — Scope beyond article links.** **Resolved 2026-07-19:
  accepted as proposed** — previews are for `.article-slot` links only;
  side-menu / app-bar / TOC links never get previews.
- **OP-006 — Non-hover inputs.** **Resolved 2026-07-19: accepted as
  proposed** — ship pointer-hover only; add `focusin` parity in the same
  iteration if it comes cheap; touch explicitly out of scope.
- **OP-007 — Warm-cache depth.** **Resolved 2026-07-19: N = 3.** Keep the
  last three dismissed previews alive for load-free re-show after the normal
  hover deferral; revisit only if
  extension-webview memory numbers say otherwise.
- **OP-008 — Links with fragments to other pages** (`page#section`).
  **Resolved 2026-07-19: configurable best-effort.** Behind a config
  option, try opening the preview at the target section (combined-fragment
  scheme, e.g. `#__preview&real-fragment`, letting native scroll position
  the article). If it does not work reliably, do not fight it — disable
  the option and open the preview at page top; the link itself still
  navigates correctly on click. Confidence medium on the section-scroll
  attempt (the two-fragment composition stays the fiddliest detail), but
  the fallback makes the feature safe regardless.

## Feasibility and confidence summary

| Piece | Approach | Confidence |
| --- | --- | --- |
| Identify internal page links client-side | existing `external` class + href shape under `.article-slot` | High |
| Full-fidelity page render in preview | same-origin iframe of the real URL | High |
| Chrome-stripped preview view | client-side preview-mode flag + CSS, works in static/SSR/extension | High |
| 1 s deferred popup with progress indicator | hover timeline (AD-003) | High |
| Popup → almost-full-screen modal, close / open-page header | reuse iframe, lightbox-token modal shell | High |
| No recursion | preview flag disables the preview script inside iframes | High |
| Extension webview (iframe-in-iframe) | same-origin nesting, verified same-origin | High — **Phase 0 gate passed 2026-07-19** |
| Cross-page fragment links previewing to the right section | combined fragment scheme, configurable best-effort (OP-008) | Medium — safe fallback ruled |
| Touch/mobile | out of scope this iteration | — |

## Implementation phases

0. **Concept gate — iframe-in-iframe in the extension webview (2026-07-19
   maintainer directive: do this first; the rest of the design is decided
   by its outcome).** **Done, PASSED (2026-07-19)** — see
   `implementation.md`. Minimal throwaway harness reproduced the webview's
   exact CSP and framing rules with a real browser: injected a nested
   iframe pointing at another page on the local server into the previewed
   page and verified it renders, scrolls, receives input, and follows the
   theme inside the outer iframe. Also sanity-checked the same in a plain
   browser on a real static build — passed identically. Outcome: **pass**
   → proceed as planned, AD-001 stays closed. One caveat noted in
   `implementation.md`: not literally exercised inside the VS Code
   Extension Development Host itself; worth a quick manual click-through
   before phase 4 ships.
1. **Ruling review** — AD-001 … AD-008, OP-001 … OP-008 recorded here.
   **Done 2026-07-19** — all items closed (see register); AD-001's
   reopen condition was discharged by the Phase 0 pass.
2. **Preview mode in the layout** — flag detection, chrome-strip CSS,
   script self-disable (AD-002/AD-005). Verifiable alone: open any page
   with the flag → article-only view.
3. **Hover engine** — `src/layout/link_preview.js` (or
   `src/components/linkpreview/`): eligibility scan via event delegation,
   intent delay, spinner, hidden iframe load, 1 s-gated popup (AD-003,
   AD-006, OP-001).
4. **Modal promotion** — modal shell with header (title / open page /
   close), same-iframe re-parenting, `Escape`/overlay close, end-game
   click-through per the OP-004/AD-005 ruling, and modal-state query
   params with back/deep-link behavior (AD-008).
5. **Caching + polish** — warm cache N = 3 (OP-007), `focusin` parity per
   OP-006, configurable section-scroll per OP-002/OP-008 (disable if it
   fights), reduced-motion respect for the spinner, regression pass over
   all run modes (dev / server / static / extension) and `pnpm test`.

## Dependencies and risks

1. **Extension webview nesting** — the site already runs inside the
   webview's iframe; the preview adds a second nesting level on the same
   origin. **Phase 0 gate passed 2026-07-19** (see `implementation.md`):
   verified with a harness reproducing the webview's exact CSP and framing
   rules. Residual gap: not exercised inside the literal Extension
   Development Host — a manual spot-check before phase 4 ships is
   recommended but not blocking.
2. **SSR render cost on hover storms** — every distinct hovered URL costs a
   server render in SSR/lite. Mitigated by intent delay, one-at-a-time
   loading, and (lite) hash-keyed record reuse; the always-on extension
   timing log will show real numbers.
3. **Static builds with `base` paths** (GitHub Pages) — same-origin and
   href-shape checks must respect `import.meta.env.BASE_URL`, mirroring how
   `Layout.astro` builds the favicon URL.
4. **Popup positioning near viewport edges** — clamp logic only; no
   dependency on floating-UI libraries (project keeps zero new runtime
   deps for this).
5. **The diagram lightbox inside a preview** — a previewed page may itself
   contain panzoom modals; they must stay functional in the modal-sized
   iframe (they should — they are page-internal), but this is a named test
   case, not an accident.

## Exit criteria

- Hovering an internal article link on a page shows the indicator, then a
  theme-consistent, scaled-thumbnail popup ~1 s after hover; the same delay
  and circular progress indicator apply to warm previews. External, asset,
  and fragment-only links are unaffected.
- Phase 0 concept-gate result is recorded in this plan before any build
  work starts. **Done: passed 2026-07-19** (see `implementation.md`).
- The popup toolbar offers open page and open preview from the start. Open
  preview or clicking the thumbnail opens the modal at the diagram-lightbox
  size (90vw/90vh); open page performs a real top-window navigation without
  the preview flag in the URL.
- Pointer leave dismisses pending/mini previews only. A promoted modal remains
  open until outside click, `Escape`, or its close control.
- The open modal is reflected in the host page's query params: browser
  back restores the page with the modal open, and loading a URL carrying
  the param opens the modal directly (AD-008).
- The modal is end-game: any click on a link inside a preview navigates
  the full window and dismisses the modal; no preview affordances exist
  inside any popup/modal (recursion test: hover links inside a preview →
  nothing).
- Section-scroll for cross-page fragment links is behind a config option
  and cleanly disabled if unreliable (OP-002/OP-008).
- Works in all four run modes: `pnpm dev`, `pnpm server` (built SSR),
  static build (with a non-root base), VS Code extension preview.
- The Phase 0 caveat is closed: a manual click-through inside a real `F5`
  Extension Development Host confirms hover → popup → modal before Phase 4
  ships (the harness reproduced the webview's constraints but not the
  literal host environment).
- `pnpm test` passes; no dataset or server-endpoint changes shipped.
