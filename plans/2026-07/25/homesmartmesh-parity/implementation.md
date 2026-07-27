# Implementation — HomeSmartMesh Parity

## Progress

[#####-] Phases 4 and 5 done. Phase 3 is partial: `WP-13` landed; `WP-14`, `WP-21`, `WP-23` and `WP-25` are **not started** and are the only remaining work in the packet.

`OP-015` (the crossed C3 documents) closed as accepted-as-is under `R-18`: a
content inconsistency, not a rendering issue. The external publishing-action
cutover remains outside this packet (`R-17`).

## Round 9 — sibling order and rail density (2026-07-27, complete)

`R-25`, `R-26`. Two follow-ups from reviewing the relabelled rail.

**Order (`R-25`).** The frontmatter `order` was ignored in lite and mishandled
in full. Lite's walk never read it, so `sort_order` carried the walk's position
counter (alphabetical within a folder). Full read it, but every consumer wrote
`sort_order ?? 0` — so a document with no `order` sorted as 0 and jumped ahead
of everything the author had pinned.

| File | Change |
| --- | --- |
| `src/libs/structure-db-lazy.js` | The head-read (`readFrontmatterDisplay`) now returns `{title, order}`; `documentDisplay` caches both. `doc.order` is the frontmatter value or **null** — the per-directory position counter (`orderTracker`) is gone, it existed only to fill this field. `TREE_VERSION` 1 → 2 so a v1 snapshot cannot seed position counters as if they were authored orders. |
| `src/libs/structure-db-json.js`, `structure-db-lazy.js` | `getDocuments()` emits `sort_order: doc.order ?? null`, matching what the sqlite backend already returned raw. The `?? 0` was what erased the distinction. |
| `src/layout/source_navigation.js`, `src/layout/layout_utils.js` | `sortSourceNodes` and `sortByOrderThenLabel` — the pages rail and the app bar — take the same rule: pinned first ascending, then unpinned A→Z by label. They are cross-referenced in comments; they must not drift. |

Result on the HomeSmartMesh snapshot, identical in lite and in the static
build: app bar `Home · Robotics · 3D Printing · Web · Microcontrollers`
(orders 2/3/4/5, then the unpinned sections) — previously alphabetical. ESP32's
children lead with Datasheets → ESP-Mesh in authored order, then the 9 unpinned
pages A→Z. The live site puts its unpinned tail in *reverse filename* order;
that is a legacy sort artifact and was deliberately not reproduced.

**Density (`R-26`).** The rail used 36px rows and `--text-sm`, and a leaf cost
16px of indent per level. Measured in Chromium: rows now 22px at 13px text,
9px per level (8px + the 1px indent guide), header 28px. The ESP32 section went
from roughly half a screen to the whole subtree plus its siblings.

| File | Change |
| --- | --- |
| `src/layout/tokens.css` | New `--nav-row-height` / `--nav-text` / `--nav-indent` / `--nav-header-height`. Deliberately *not* on the type scale — see `R-26`. |
| `src/layout/SubMenu.astro` | Rows, twistie (a fixed 16px column, leaves inset to match), text padding and nesting indent move onto the tokens. Labels now truncate with an ellipsis instead of wrapping to a second line — the row height is fixed, so wrapping was what produced the 45px rows. |
| `src/layout/lazy_navigation.css` | **The one that matters for the extension.** This is the post-paint client tree the preview actually shows; `SubMenu.astro` renders the server-side copy. The first pass at this round changed only the Astro component and the browser looked untouched. Same tokens, same rules. |
| `src/layout/SideMenu.astro` | Header, depth-control strip and skeleton follow the same rhythm (28px header, 24px buttons). |

## Round 8 — menu labels from the title (2026-07-27, complete)

`R-24`. The pages rail in lite listed slugs — `c3-devkit-m1`, `esp32`,
`microcontrollers` — where the reference site reads *C3 Dev Kit M1*, *ESP32*,
*Microcontrollers*. Only lite diverged: the full profile has always labelled
from `title` (`content-structure/src/collect.js`: `title = frontmatter.title ??
slug`), and the app bar, breadcrumb and card headings inherited the same slugs
from the same field.

Root cause: `walkWorkspace()` derived `doc.title` from the filename because the
walk read no file contents at all. The fix reads the frontmatter *head* — a
single 4 KB `readSync`, no YAML parse, `gray-matter` stays behind the lazy
parse-deps import startup must not pay for.

| File | Change |
| --- | --- |
| `src/libs/structure-db-lazy.js` | `readFrontmatterTitle()` extracts a column-0 `title:` from a leading `---` block in the first 4 KB (single-line scalars only — quoted, plain-with-comment, or `title : x`; a block scalar falls back to the filename). `documentTitle()` caches by path + size + mtime; `seedTitleCache()` primes it from the previous `filetree.json`, guarded by a new `tree_version` field so a snapshot written by older code cannot seed stale labels. `RECORD_VERSION` 9 → 10: a v9 page record's stored document row still carries the filename title. |
| `specification/engine-profiles/spec.md` | Identity contract: a label is the title, else the filename, in both profiles. Performance contract: startup is file-level operations *plus one bounded head-read per markdown file*. |
| `test/lite-menu-labels.test.js` | New. Every single-line YAML form, the filename fallbacks (no frontmatter / no title / nested `title` / block scalar), folder-page titles labelling directory nodes, and — the invariant that matters — no title reaching any url. Plus cache invalidation: an edited title is picked up on the next walk. |

**Identity is untouched.** url, uid, slug, level and sort order stay
filename-derived; the per-page parse already lists `title` in `identityColumns`,
so an opened page cannot re-label itself either. `/microcontrollers/esp32/c3-devkit-m1`
still serves at that path while reading *ESP32 C3 DevKit M1* in the menu.

Measured cost. HomeSmartMesh snapshot (73 documents, 298 entries): cold walk
25 ms at 73/73 head-reads, warm walk 22 ms at 22/73. The residual 22 are folder
pages — their file entry is folded into the directory node, which carries no
size/mtime to validate a seeded title against, so they re-read once per process.
`pnpm bench:lite --pages 1000 --fresh` (1111 documents, and it wipes the json
dir to force a truly cold walk): 95 ms total, of which the head-reads are 38 ms
measured in isolation against 9 ms to stat the same 1111 files — so ~35 µs per
markdown file, paid once per file per change. The walk log line now reports
`<reads>/<documents> title head-reads` (AD-007).

Ordering is **not** in this round: lite still sorts by walk position where the
reference honours frontmatter `order`. Recorded as `OP-017`, awaiting a ruling.

## Round 7 — XLSX tables in lite (2026-07-27, complete)

`R-23`. The `pinout` workbook on `/microcontrollers/esp32/esp32-c3-devkitm-1`
rendered as a bare link in the extension preview while the live site shows a
table. Two independent faults, both fixed:

| File | Change |
| --- | --- |
| `src/components/markdown/link-components.js` | `.xlsx` no longer gated on `profile !== 'lite'`. The workbook is read and converted server-side and the result feeds the `MarkdownTable` island lite already ships for ordinary Markdown tables, so nothing profile-specific was ever needed. `.glb` keeps its gate — lite aliases `@google/model-viewer` to an empty module, so a viewer there would be inert. |
| `scripts/stage-engine.js` | `xlsx` removed from `EXCLUDED_DEPS`. `Link.astro` imports `TableXLSX.astro` unconditionally and Vite leaves `xlsx` **external** in the SSR build — verified: the built chunk carrying every page's footer starts with `import {read, utils} from 'xlsx'`. Excluding it meant the staged engine would fail to load *any* page once `WP-11` landed, and a fresh `md-render build` would fail to resolve the import. This was already broken for the full-profile render command before this round; the staged package under `packages/md-render` predates `WP-11` (built 2026-07-24) and so never surfaced it. |

Nothing changed for the full profile: `.xlsx` already classified as a table
there.

### Verification

| Check | Result |
| --- | --- |
| `pnpm test` | **127/127** |
| Lite dev server, `/microcontrollers/esp32/esp32-c3-devkitm-1` | before: `.xlsx-table` present as CSS only, workbook rendered as `<a>`; after: `<section class="xlsx-table">` with the parsed island — `J1 Header 9`, `RGB LED` in the payload, **no** "Unable to render spreadsheet" fallback |
| Lite dev server, `/microcontrollers/esp32/wall-display` (the second workbook) | `<section class="xlsx-table">`, no fallback |
| SSR build (`astro build`, scratch outDir) | exit 0; `xlsx` confirmed external in `dist/server/chunks/` |

Lite reaches the workbook through the collected blob
(`getAssetInfoBlob_version`), not the source-path fallback — link items carry no
`ast.url` in the JSON dataset, so `TableXLSX`'s `resolveXlsxPath` branch is
unreachable there and the blob path is what makes this work in all backends.

**Not re-staged.** `packages/md-render` and the installed `.vsix` still carry
the 2026-07-24 engine. Run `pnpm build && pnpm ext:reinstall` to see this in the
installed extension; the vendoring step will now pull `xlsx` (~7.8 MB against a
428 MB vendored tree).

## Round 6 — chrome bottom-edge review (2026-07-27, complete)

Four maintainer rulings from reviewing the shipped chrome in a browser
(`R-19`–`R-22` in `plan.md`). They amend `R-10`/`R-16`, so `WP-22`/`WP-16`
below describe the *previous* shape of the footer.

| File | Change |
| --- | --- |
| `src/layout/LiteRelationIndexer.astro`, `src/layout/lite_relation_indexer.js` | `R-19`. One `[data-index-toggle]` handle, absolutely positioned at `bottom:calc(100% - 1px)` of the bar — on its top edge, 1px into its border so the line breaks around it. The bar travels its full height (`translateY(100%)`, no `visibility`/`pointer-events` on the collapsed state) and the handle rides along. Measured at 1400×900: handle top 839 → 880 while the bar goes 858 → 900, sampled mid-transition at 866 with the bar at 887 — one element, moving together. The bar's content moved into `.index-body`, which takes `visibility:hidden` on a matching transition: off-screen is not hidden from a screen reader, and the delay keeps the text from blinking out before the slide starts. |
| `src/layout/RelationsFooter.astro` | `R-20`. Prev/next only — the backlink query, the "Referenced by" list, the `CollapsibleBand` wrapper and the graph button are gone. One row, `var(--space-2)` block padding: 51 px tall, down from ~150 px plus the rail. |
| `src/layout/AppBar.astro` | `R-21`. The graph entry (`data-graph-root` + render target + `PanZoomModal`) moved here as an icon-only `nav-toggle`; `graph_entry.js` binds it unchanged because the whole root moved together. Also `.nav-toggle[hidden]{display:none}` — see below. |
| `src/layout/Layout.astro`, `src/pages/index.astro`, `src/pages/[...url].astro` | `graphSid` threaded page → layout → app bar (the layout has no entry of its own). |
| `src/layout/Layout.astro`, `src/layout/tokens.css` | `R-22`. `--index-status-height` (2.6 rem; 3.6 rem where the bar wraps to two rows) is both the bar's `min-height` and, with `--index-status-handle` on top of it, the article scroller's reserve — applied only while `body:has(.lite-index-status:not([data-collapsed="true"]))`. Measured 75.2 px showing, 12 px collapsed. |

### The preview lock never responded to clicks

Not a message-plumbing fault: outside the VS Code webview `preview_lock.js`
sets `hidden` on the toggle and returns *before* binding its click handler. But
`.nav-toggle` sets `display:flex`, and an author rule outranks the UA's
`[hidden]{display:none}` — so in a plain `pnpm dev` browser tab the button
stayed visible and inert, exactly the reported symptom. One rule
(`.nav-toggle[hidden]{display:none}`) makes the attribute win. Inside the
webview the control was, and remains, functional.

Verified in a headless browser against the dev server: lock absent outside the
webview, graph modal opens from the app bar and renders the neighborhood SVG,
one toggle element in the DOM at all times, its collapsed state still sticky
across a reload. Suite 125/125 (6 new assertions in
`test/layout-footer.test.js`).

## Phase 5 — deployment and regression guard (complete)

### WP-18 — GitHub Pages workflow

`.github/workflows/pages.yml`, `workflow_dispatch` only. A publish is an
explicit act, never a push side effect (`R-17`).

**Deviation from the plan.** The WP text said "driving the existing
`action.yml`". It does not, and should not: that Action installs a pinned,
already-published `@microwebstacks/md-render` from npm, so a run of it here
would build with a released engine instead of the source in the checkout and
could validate nothing in this packet. The consumer-facing shape is already
documented by `render-example.yml`. `pages.yml` drives the in-repo builder
instead — `pnpm fetch` → `pnpm collect` → `astro build` (full/json/static) →
artifact gate → `upload-pages-artifact` → `deploy-pages` — and its header
records why. Both `base` shapes are workflow inputs (`R-9`).

### WP-19 — the parity harness

| File | Change |
| --- | --- |
| `scripts/parity-metrics.js` (new) | Reduces every emitted page to structural counts — title, headings, images, iframes, model viewers, tables, galleries, gallery images, code blocks, leaked raw directive text, and unresolved internal links — then compares them to a recorded baseline. `--write` records the baseline, `--json` dumps per-page detail. |
| `test/fixtures/parity-baseline.json` (new) | The recorded baseline: 115 pages, 598 headings, 419 images, 2 iframes, 12 model viewers, 3 tables, 9 galleries / 130 gallery images, 0 raw directives, 16 dangling links. |
| `test/parity-harness.test.js` (new) | 10 tests over the extractor and the regression rule, plus a baseline comparison that runs whenever `dist/` holds the full artifact. |
| `package.json` | `check:parity` and `check:artifact` scripts. |

The regression rule is asymmetric on purpose (`DD-007`): a page may gain
content freely, but losing a heading, image, iframe, model viewer, table or
gallery image fails, as does a new dangling link, a changed title, a missing
page, or any raw directive text reaching a page. Under `R-7` it never compares
urls with the reference site.

The 16 dangling links are the content-side dead links the plan's scope section
already excludes (`/docs/**`, `/networks/**`, `/frameworks/chip/`, and a few
stale sibling links). They are baselined as accepted, so the harness fails only
if the count grows.

### WP-24 — both `base` values, end to end

Expected to be test-and-document. It was not: building the sub-path artifact
found **95 internal links emitted without the base prefix**.

Every `:button[]{link=/...}` href and every authored root-absolute markdown
link was passed through verbatim, so under `base=/astro-huge-doc/` they
resolved against the domain root and 404'd — including all 14 download buttons
`WP-13` had just fixed. Invisible at `base=/`, which is why nothing had caught
it.

| File | Change |
| --- | --- |
| `src/libs/blob-files.js` | New `withBasePrefix(url, base)`: prefixes a root-absolute internal path, leaving external, protocol-relative, fragment, relative and already-prefixed values alone. Idempotent, so a re-render cannot double-prefix. |
| `src/components/markdown/directive/ButtonDirective.astro` | Button hrefs go through it. |
| `src/components/markdown/link-presentation.js` | Links not rewritten to a resolved document url — a pre-resolved `ast.rel`, and links the collector could not resolve — go through it too. |
| `test/base-prefix.test.js` (new) | 6 tests: normalization of both base shapes, no-op at root, prefixing under a sub-path, non-interference with external/fragment/relative forms, idempotence, and blob urls. |

After the fix the sub-path artifact has **zero** unprefixed root-absolute
`href`/`src` attributes. The one remaining textual match is authored
malformation in the content — `![Trick Tracker Schematics]{src="/images/..."}`
renders as literal prose on
`microcontrollers/nrf52/trick_tracker`, on the live site as much as here — not
an emitted attribute.

## Phase 4 — static-mode runtime correctness and publish chrome (complete)

### WP-15 — the /__lite/* clients

The measured defect was real but its cause was not where the survey put it. The
clients were already gated on `extensionPreviewEnabled()`; what nobody had
noticed is that **the repo `.env` sets `MICROWEBSTACKS_EXTENSION_MODE=true`**.
So the plan's own reproduction command, `DOCS_OUTPUT=static astro build`, built
a static artifact with the whole extension-preview surface baked in: the lazy
navigation skeleton, the relation-indexer bar, its polling client, and the
preview history buttons — every one of them fetching routes that only
`src/middleware.js` answers, in an artifact that has no middleware.

| File | Change |
| --- | --- |
| `src/libs/extension-preview.js` | New `extensionPreviewClientEnabled()` = `extensionPreviewEnabled() && config.output !== 'static'`. Not a second condition the endpoint side cannot see: the same condition, evaluated where the endpoints provably do not exist. |
| `src/layout/Layout.astro` | `liveReload` reads the client gate. |
| `src/layout/Breadcrumb.astro` | The preview-history buttons read it too — `preview_history.js` is emitted under the same gate, so rendering the buttons without it left dead controls. |
| `scripts/check-static-artifact.js` (new) | The `DD-006` build-time gate. |

The gate checks **reachability**, not a flat grep, because Astro bundles a
hoisted `<script>` for every component in the module graph — including ones
whose render condition was false. Three such chunks are emitted and linked from
no page. So the script separates a forbidden string reachable from a page
(failure) from one in an unreachable chunk (dead weight, removed by `--prune`,
which `pages.yml` passes).

It deliberately does **not** prune every unreferenced `_astro` file. 94 of them
are mermaid's diagram renderers, resolved by runtime dynamic import that no
static scan can follow; deleting those on "nothing references them" reasoning
would break every diagram in the artifact. That is the `WP-14` caveat's
fail-closed rule, applied early.

Verified in both directions: the static artifact renders none of the surface
and reaches no `/__lite/` route, while a dev server with the repo `.env` still
renders the indexer bar, the lazy navigation and the preview-history controls.

### WP-22 / WP-16 — collapsible chrome

| File | Change |
| --- | --- |
| `src/layout/collapsible.js` (new) | One arrow behaviour and one persistence rule for all three surfaces. Flags live in a single `chrome-band-flags` localStorage set; an absent key reads as the default, so the common case stores nothing. Storage failures degrade to a working, non-sticky toggle. |
| `src/layout/CollapsibleBand.astro` (new) | The band: a thin rail carrying one chevron, collapsed by default (`R-10`), with the slot rendered untouched when open. |
| `src/pages/[...url].astro`, `src/pages/index.astro` | The breadcrumb + metadata band. |
| `src/layout/RelationsFooter.astro` | The references + prev/next band. **Superseded by `R-20`** (Round 6): the footer is prev/next only and no longer a band. |
| `src/layout/lite_relation_indexer.js` | Third consumer: same store, its own key and polarity. |

Two decisions worth recording:

- **The graph trigger stays outside the band.** `R-10` names references and
  prev/next; `R-16` ships the graph button as a public discovery affordance, so
  burying it behind a click would work against the ruling that put it there.
  *Round 6 took this further under `R-21`: the trigger left the footer for the
  app bar.*
- **The indexer's dismissal is now sticky.** `R-10` describes the index status
  bar as the existing sticky-state pattern. It was not — `userCollapsed` reset
  on every page load. It now persists through the shared store, which is what
  the ruling assumed already happened. This bar is open by default, so its flag
  is the inverse of the bands': "the user dismissed it".

### WP-17 — head and branding

`<link rel="icon">` now declares the fetched `favicon.svg`, then `favicon.png`,
then the legacy `favicon.ico`, plus an `apple-touch-icon` — browsers pick the
best they support instead of one being chosen at build time. All three carry
`BASE_URL`, so they follow `R-9`.

`src/layout/SiteFooter.astro` is new and **renders nothing by default**. The
reference site has no footer, so parity requires none, and inventing branding
would have put unrequested text on 115 pages. The capability ships instead,
driven by an optional `render.footer` manifest key (`text`, optional `href`);
HomeSmartMesh sets no such key today.

## Phase 3 — assets and fetch completeness (partial)

### WP-13 — fetch the rest of the source `public/` (complete)

The source repository's `public/` holds `data/`, `design/`, `images/`,
`favicon.svg`, `favicon.png` and `.nojekyll`; the manifest fetched only
`images` and `design`, so every download button 404'd.

The obvious fix — one `folders: [public]` entry with `dest: public` — is a trap.
`moveRequestedContent` calls `resetDestination` before copying, so a `public`
destination would delete the `public/images` and `public/design` the two
existing entries had just fetched, order depending. Fetching the whole of
`public/` also re-copies 87 MB to obtain three small files.

So `scripts/fetch.js` gained an additive **`files:`** entry form alongside
`folders:`.

| File | Change |
| --- | --- |
| `scripts/fetch.js` | `files:` copies named repository files into `dest` by basename and **never resets** the destination. `folders:` keeps its replace-the-destination semantics. An entry may declare one or the other, not both, so a destination's reset behaviour is never ambiguous. Path validation is shared by the two keys (`normalizeRepoPaths`), and a new guard rejects a resetting destination that contains another entry's destination. The script now runs `main()` only as a command and exports its pure helpers. |
| `manifest.yaml` | Two new HomeSmartMesh entries: `folders: [public/data] → public/data`, and `files: [public/favicon.svg, public/favicon.png, public/.nojekyll] → public`. |
| `.gitignore` | Ignores the four new fetched paths, matching the existing `public/images/` and `public/design/` rules. |
| `test/fetch-manifest.test.js` (new) | 7 tests: additive file copy, folder reset still replaces, honest errors for a missing file and for a directory listed as a file, folders/files mutual exclusion, the reset-over-destination guard, path validation, and an assertion that the shipped manifest fetches these paths. |

### Decisions made during implementation

- **`files:` is additive, `folders:` replaces.** These are different enough that
  overloading `folders` to accept file paths would have made a destination's
  reset behaviour depend on the *type* of its source, which is exactly the kind
  of implicit coupling that produced the Phase 0 gallery bug. Two keys, one
  rule each.
- **The nesting guard is new and load-bearing.** `WP-13` introduces the first
  destination (`public`) that contains other destinations. The guard permits it
  only because file entries do not reset, and it fails the build for anyone who
  later adds a resetting entry above a populated destination.
- **Traversal validation was silently Windows-only-broken.** The check split on
  `path.sep`, which is `\` on Windows, so a forward-slash manifest path like
  `public/../../secrets` was never examined for `..` on this platform. It now
  splits on both separators. A leading `./` or `../` is still stripped rather
  than rejected, as before.
- **`.nojekyll` is kept although it is redundant.** `actions/upload-pages-artifact`
  and `deploy-pages` bypass Jekyll entirely, so `_astro/` would serve without
  it. It is fetched anyway to mirror the source repository, and it costs 0
  bytes.

### Result

All 14 `/data/**` download buttons resolve, in the dev server and in the built
artifact. The full static artifact carries `dist/data` (17 files / 3.1 MB),
`favicon.svg`, `favicon.png` and `.nojekyll`. Wiring `<link rel="icon">` to the
fetched favicon is `WP-17`, in Phase 4, and is deliberately not done here.

Two survey numbers were corrected against the content: there are **14**
download buttons, not 16 — the other two matches were
`/opt/zigbee2mqtt/data/configuration.yaml` and `.../data/database.db` in a
blockquote. And three of the 17 fetched `data/` files are referenced by nothing,
which is `WP-14`/`WP-21` input rather than a defect.

## Phase 2 — missing markdown features (complete)

### What changed

| Work package | Result |
| --- | --- |
| WP-08 — `gallery_dir` | Already completed and regression-covered in Phase 0. The full artifact contains 9 gallery containers and 130 gallery images; `fire-beetle` renders its 4 collected directory images. |
| WP-09 — iframe directives | Added an iframe directive component and URL mapper. Short and watch-form YouTube URLs become privacy-preserving embed URLs; both `rovi` directives render as centered lazy-loading iframes. |
| WP-10 — external GLB links | Link classification now sends external `.glb` URLs to the existing model viewer in full. Lite deliberately retains a normal link. The full artifact contains 12 model viewers across 9 pages. |
| WP-11 — XLSX tables | Added workbook parsing and a `TableXLSX` adapter to the existing rich Markdown table. Collected workbook blobs are preferred over source paths. Both authored workbooks render as tables; failures degrade to a download link. |
| WP-12 — directive audit | Text-form `details` directives render through the details component, accidental colon-bearing prose remains inline literal text, and the dead `Tag.astro` import was removed. |

### Files changed

| File | Change |
| --- | --- |
| `src/components/markdown/directive/iframe.js` | Pure iframe-source normalization, including `youtu.be` and `youtube.com/watch` mapping. |
| `src/components/markdown/directive/IframeDirective.astro` | Sandboxed, lazy-loading iframe rendering with authored title, sizing, and centering. |
| `src/components/markdown/directive/Directive.astro` | Dispatches iframe and text-form details directives; preserves unknown text directives inline. |
| `src/components/markdown/link-components.js` | Profile-aware `.glb` and `.xlsx` link classification. |
| `src/components/markdown/Link.astro` | Renders external GLB model viewers and collected XLSX tables. |
| `src/components/markdown/table/xlsx-table.js` | Safe workbook source resolution and worksheet-to-table-model conversion. |
| `src/components/markdown/table/TableXLSX.astro` | Loads a collected workbook blob (or source fallback) and renders the current table component. |
| `src/components/markdown/AstroMarkdown.astro` | Removes the dead tag import and passes document context into link rendering. |
| `test/phase2-markdown-features.test.js` | Six focused classification, URL-mapping, XLSX-conversion, and source-path tests. |

### Verification

| Check | Result |
| --- | --- |
| Full test suite in a disposable install with a fresh pnpm store | **97/97 pass** |
| Focused Phase 2 suite | **6/6 pass** |
| Full JSON/static build | **exit 0**, 115 pages |
| Built-artifact audit | 2 YouTube embeds; 12 model viewers; 2 XLSX tables; 9 non-empty galleries / 130 images; 0 raw iframe directives; 0 XLSX fallback errors |

The normal workspace dependency cache contains unreadable cached package
manifests on this Windows machine. Validation therefore used a disposable copy
under `.tmp/` and a fresh pnpm store; this isolates dependency state without
changing the repository lockfile. The in-app browser was unavailable, so Phase
2 was verified through the complete static build and built-DOM inspection
rather than interactive browser screenshots.

### Post-phase review diagnosis: the sparse C3 page

The route `/microcontrollers/esp32/c3-devkit-m1` is not an empty or unresolved
document and is not an XLSX-rendering regression. It maps exactly to
`content/microcontrollers/esp32/c3-devkit-m1.md`, whose complete authored body
is two `button` text directives. Collection produces exactly those two items,
and the screenshot supplied during review shows both buttons rendered.

A separate document,
`content/microcontrollers/esp32/esp32-c3-devkitm-1.md`, owns the richer C3
board content (headings, image, PlatformIO board name, schematic, and the
`c3-m1-pinout.xlsx` link). Its canonical route is
`/microcontrollers/esp32/esp32-c3-devkitm-1`.

Neither file differs between HomeSmartMesh `main` and the migration branch, so
Phases 1 and 2 did not create the duplication or remove content. No renderer
fix is appropriate in this packet. Merging, redirecting, or removing one of
the two documents would be a separate content-authoring decision.

#### Re-verified against the live site (2026-07-25, takeover)

Re-opened during takeover because a side-by-side screenshot pair made the local
route look like content loss. It is not. **The root cause is a filename/title
crossing in the content**, and the live site carries the same two documents:

| Source file | `title` | Live URL (title-derived) | Live status | Our URL (`R-6`, filename-derived) |
| --- | --- | --- | --- | --- |
| `c3-devkit-m1.md` | `ESP32 C3 DevKit M1` | `/microcontrollers/esp32/esp32-c3-devkit-m1/` | **200**, same two buttons | `/microcontrollers/esp32/c3-devkit-m1` |
| `esp32-c3-devkitm-1.md` | `C3 Dev Kit M1` | `/microcontrollers/esp32/c3-dev-kit-m1/` | **200**, rich board page | `/microcontrollers/esp32/esp32-c3-devkitm-1` |

Each file is named after the *other* file's title, so under `R-6` the two URLs
read backwards relative to their content, and the near-identical spellings
(`c3-devkit-m1` vs live `c3-dev-kit-m1`) make the sparse page look like the
rich one failing to render. Confirmed by HTTP probe: live 404s on both
`/c3-devkit-m1/` and `/esp32-c3-devkitm-1/`, and live's
`/esp32-c3-devkit-m1/` serves exactly the two buttons.

Rendering was re-checked, not assumed. The rich document renders in full at
`/microcontrollers/esp32/esp32-c3-devkitm-1`: five headings (`C3 Dev Kit M1`,
`PIO Board`, `ESP32 C3 Mini`, `Schematics`, `Pinout`), the `c3-m1.webp` image,
the `ini` board block, the schematic SVG, and the XLSX pinout. The review
screenshot was taken against the **lite** dev server, where the XLSX stayed a
plain link (`link-components.js` gated `.glb`/`.xlsx` on `profile !== 'lite'`,
per `R-3`/`R-11`); the full profile rendered it as a table, which is the
artifact audit's second XLSX table.

**Superseded 2026-07-27 (`R-23`):** the lite gate on `.xlsx` is removed — see
"Round 7 — XLSX tables in lite" above. `.glb` keeps its gate.

The sparse stub is not referenced by any card — `microcontrollers/esp32/readme.md`
cards `microcontrollers.esp32.esp32-c3-devkitm-1` (the rich page) and never the
stub — and nothing else in the content set links to either file. So the
duplication is reachable only from the navigation tree, on the live site as
much as here.

**Conclusion unchanged: no renderer defect, no content loss, nothing for this
packet to fix in code.**

**Ruled `R-18` (maintainer, 2026-07-25): accepted as-is.** A content
inconsistency rather than a rendering issue, so neither the renderer nor the
content changes. The rich board page serves at
`/microcontrollers/esp32/esp32-c3-devkitm-1`. Options weighed are recorded
under `OP-015` in `plan.md`.

## Phase 1 — one identity rule and a downstream migration worklist (complete)

### What changed

| File | Change |
| --- | --- |
| `packages/content-structure/src/identity.js` (new) | Dependency-free owner of `slugSegment`, path → `{slug,url,uid}`, canonical document-reference keys, and canonical card UIDs. |
| `packages/content-structure/src/collect.js` | Full collection derives identity only from the relative filename path. `frontmatter.slug` no longer affects slug, URL, or UID; titles remain display metadata. |
| `src/libs/structure-db-lazy.js` | Lite imports the same identity functions for its file walk and canonical link matching. `RECORD_VERSION` 7 → 9 invalidates cached outcomes from both the old profile-local rule and the briefly tested aggressive shared rule. Heading anchors call the shared sanitizer separately and remain lowercase. |
| `packages/content-structure/src/relations.js` | Markdown document references compare through the shared slug rule after exact-path lookup. Only extensionless and `.md` references get this fallback, so `foo.js` cannot accidentally resolve to `foo.md`. |
| `src/components/markdown/cards/Cards.astro` | Authored card UIDs are canonicalized before lookup. Only unsafe characters normalize; URL-safe `_` and `-` remain distinct. |
| `packages/content-structure/index.js` | Collection persists and prints a deduplicated, source-specific migration worklist for unresolved card UIDs and document links. |
| `manifest.yaml` | All three HomeSmartMesh fetch entries temporarily pin `astro-huge-doc-migration`, keeping the breaking content shape off mainline while it is tested. |
| `test/identity.test.js`, `test/okf-identity.test.js`, `test/okf-relations.test.js`, `test/okf-stage3.test.js` | Shared-rule, ignored-frontmatter-slug, canonical-reference, non-document-extension, and persisted-worklist coverage. |

### Result on the HomeSmartMesh snapshot

- 73 documents produce 73 unique URLs and UIDs; 16 URLs retain underscores,
  one retains a dot, and there are zero duplicate-identity diagnostics.
- Full and lite now preserve the exact URL-safe filename spelling:
  `thread_sensortag.md` remains `thread_sensortag`; a dash spelling is a
  different identity. This matches OKF's bundle-relative path identity and
  standard GitHub filenames.
- Every one of the 50 source-specific unresolved card-reference rows and 34
  unresolved document-link rows exposed by the final rule was inspected. The
  applied content migration has no path renames, removes three obsolete
  frontmatter `slug` keys, and repairs full-path UIDs and stale links across 21
  Markdown files.
- The migration is committed and pushed as
  `HomeSmartMesh/homesmartmesh.github.io@astro-huge-doc-migration`, commit
  `2a0385c`. Collection from a fresh manifest fetch reports **zero unresolved
  card UIDs and zero unresolved document links**.
- Canonical fixture references resolve, while genuinely missing references
  remain unresolved and render/report honestly.

### Decisions made during implementation

- Display titles stay profile-specific: full keeps the frontmatter title and
  order metadata; lite keeps its filename/folder label without reading content
  during startup. Only identity is shared.
- Canonical comparison follows exact lookup and applies only to document-like
  references. Asset extensions retain their own resolution path.
- Document identity preserves URL-unreserved spelling and case. Heading
  fragments remain independently lowercased, so heading behavior does not
  dictate filename identity.
- Migration diagnostics are deduplicated by `(source path, canonical target)`
  for cards and `(source path, authored target)` for links. Relation rows still
  retain every link occurrence for backlinks and context.
- `getStaticPaths` and the catch-all route consume canonical URLs through the
  backend document list; they do not re-derive paths locally.

### Verification

| Check | Result |
| --- | --- |
| `pnpm test` | **91/91 pass** |
| Pre-migration collect under the final identity rule | exit 0; 73 docs / 3517 items; 50 card + 34 link migration rows; zero duplicate identities |
| Fresh manifest fetch of migration branch | commit `2a0385c`; all content, image, and design entries fetched successfully |
| Collect freshly fetched migrated content | exit 0; 73 docs / 3517 items / 640 asset_info / 637 assets / 393 images; **0 card + 0 link diagnostics** |
| Full JSON/static build from freshly fetched migration | **exit 0**, 115 pages |
| Legacy `content-structure@1.1.10` compatibility probe | Collected all 73 documents but proved incompatible UID contracts (`esp32.*` vs `microcontrollers.esp32.*`); later failed on the pre-existing percent-encoded `/assets/3dprinting/Voronoi%20cells.jpg` route |
| Full JSON/static build | **exit 0**, 115 pages |
| Lite static build | **exit 0**, 76 pages; file walk finds all 73 documents |
| Default SSR build | **exit 0** |
| `pnpm bench:lite -- --pages 1000` | 1111 docs: 120 ms walk, 1 ms warm entry, 153 ms fresh-process cached entry, 1.81 s total to first page, 1.91 s cold SSR |

The Vite chunk-size, empty-lite-model-viewer, unused `node:path` import, and
dynamic-route `getStaticPaths` warnings are pre-existing later-phase scope; no
Phase 1 identity warning or build failure remains.

The normal in-place `pnpm fetch` could not replace
`content/protocols/ultrawideband/DRTLS.webp` because another local process holds
that file open on Windows (`EBUSY`). Fetching the exact same manifest entries
into clean temporary destinations succeeded, so this is local working-copy
state rather than a branch or archive failure.

## Phase 0 — make the site build (complete)

### The defect

Two predicates disagreed about what a "gallery" fenced block is:

| Side | Location | Predicate |
| --- | --- | --- |
| Collector | `md_utils.js#createCodeEntry` | `meta === 'gallery'` |
| Renderer | `Code.astro` | `params.startsWith("gallery")` |

`content/microcontrollers/esp32/fire-beetle.md` uses ```` ```yaml gallery_dir ````.
The collector rejected it, so no `gallery_items` were written and the item's
`ast` stayed `null`; the renderer accepted it and dereferenced
`item.ast.gallery` → `TypeError` → the whole static build aborted.

The `{dir: <path>}` expansion the block needed (`collectGalleryAssets` →
`listGalleryDirFiles` → `addGalleryAsset`) was already implemented and correct.
It was simply unreachable behind the exact-match gate.

### Files changed

| File | Change |
| --- | --- |
| `packages/content-structure/src/code_blocks.js` (new) | `codeBlockKind(language, meta)` — the single classifier for `gallery` / `glb` / `cards`, prefix-matched. Imported by both the collector and `Code.astro`. |
| `packages/content-structure/src/md_utils.js` | `createCodeEntry` uses `codeBlockKind`. Gallery expansion stays unconditional — every caller gets the same items. |
| `packages/content-structure/index.js` | `SHARP_DECODABLE_EXT` allowlist; `collectImageMetadata` skips undecodable formats before calling sharp, at debug level. |
| `src/components/markdown/code/Code.astro` | Uses `codeBlockKind`; each custom-yaml branch now requires the data it consumes to exist, otherwise the block falls through to `<Highlighter>`. Dead `yaml_glb && isLite` branch removed (the generic fallback covers it). |
| `src/libs/structure-db-lazy.js` | `RECORD_VERSION` 6 → 7: v6 records for `gallery_dir` pages predate the classifier fix and hold no gallery items. |
| `test/gallery-blocks.test.js` (new) | 8 regression tests. |

### Decisions made during implementation

- **No `expand_galleries` flag (`R-5`, reversing `DD-0.4`).** An intermediate
  version of this work had the lite lazy parse skip gallery expansion, on the
  reading that `R-3` licensed it. It does not: lite already rendered galleries,
  so skipping them was a capability reduction, and Phase 0 removes nothing that
  worked. The flag, its plumbing and its tests are gone; expansion is
  unconditional. The footgun found while building it is still worth recording —
  any future switch here must not be keyed on `DOCS_PROFILE`, because
  `pnpm collect` writes the `content.json` that the full/static publish reads
  while the repo `.env` defaults to `DOCS_PROFILE=lite`, so collecting with
  repo defaults would have silently stripped every gallery from a published
  site.
- **`warn` vs info (`OP-0.1`).** Malformed gallery yaml and an unreadable
  gallery directory keep their `warn` — those are authoring faults. Neither
  path renders error UI and neither throws; the renderer degrades them to a
  highlighted yaml block.
- **Renderer fallback is generic, not gallery-specific (`DD-0.2`).** Every
  custom-yaml branch now checks for the data it will consume. `Cards` was left
  as-is: it parses the fence body directly, already surfaces its own yaml
  error, and cannot throw.
- **`glb` widened from exact match to prefix** as a side effect of the shared
  classifier. No content in this set uses `yaml glb`, and it removes the second
  latent copy of the same bug.

### Verification

| Check | Result |
| --- | --- |
| `pnpm test` | **86/86** (was 78; +8 new) |
| `pnpm collect` (default lite `.env`) | pass, ~7 s, 73 docs / 3517 items / 639 assets / 393 images, **no warnings** |
| Full static build (`DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static`) | **exit 0**, 115 pages, 61.5 s |
| Lite static build (`DOCS_OUTPUT=static`, repo `.env`) | **exit 0**, 76 pages, 69.7 s |
| Full artifact crawl, all 73 document URLs | 0 missing, **0 error pages**, 13 thin |
| Lite artifact crawl, all 73 document URLs | **0 error pages**, 17 URL misses, 10 thin |
| Gallery render, full: 3dprinting / house / rovi / fire-beetle | gallery container + 44 / 12 / 18 / 4 images |
| Gallery render, lite: same pages | **identical** — 44 / 12 / 18 / 4 |

The 13 thin pages (full) and the 17 lite URL misses are **pre-existing Phase 1
scope** — dangling card uids and the dataset-url/route drift respectively — not
Phase 0 regressions. Both were present in the pre-Phase-0 survey.

### Deviations from the plan

- `WP-0.6` (sharp allowlist) was added mid-flight from the `OP-0.3` ruling that
  Phase 0 leaves no non-fatal warnings.
- `WP-0.7` was added, implemented, and then **withdrawn**. It made gallery
  expansion opt-out so the lite lazy parse could skip it. That reduced a lite
  capability that already worked, which `R-5` rules out of Phase 0 scope. The
  code, the flag and its two tests were removed; nothing of it remains.
- The plan assumed lite needed a gallery fallback it did not previously have.
  It did not — lite rendered galleries all along, and still does. The fallback
  is still worth having, but as the crash guard it was always meant to be: it
  fires when a block genuinely yields no items (bad yaml, missing directory),
  not as a profile-level opt-out.

## Discovery (pre-Phase 0)

The parity baseline in `plan.md` — 34/73 divergent URLs, 38/45 dangling card
uids, the `/__lite/**` 404s in static output, the missing iframe/glb/xlsx
rendering and `/data/**` assets — was measured by building this repo three ways
(lite SSR, full/json SSR, full/json static) and diffing every page against
<https://homesmartmesh.github.io/> with a headless browser. Throwaway harness
and screenshots under `.tmp/parity-2026-07-25/`.
