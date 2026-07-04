# Comparison: Markdown Site Preview (ours) vs. Markdown Preview Enhanced

## Sources

- Ours: `packages/vscode-extension/{package.json,extension.js,README.md,CHANGELOG.md}`,
  `packages/md-render/{config.js,package.json}`, root `readme.md`, and prior
  planning packets (`plans/2026-06-27-vscode-ext/`,
  `plans/2026-06-28-vscode-marketplace-readiness/`,
  `plans/2026-06-28-mermaid-diagrams/`, `plans/2026-06-28-diagram-toolbar/`,
  `plans/2026-06-27-toc-menu-controls/`, `plans/2026-06-28-file-tree-menu/`,
  `plans/2026-06-28-menu-state-auto/`, `plans/2026-06-27-ui-redesign/`,
  `plans/2026-06-29-vscode-lite/`, `plans/2026-07-04-vscode-lite-parity/`).
- Theirs: `C:\dev\github\shd101wyy\vscode-markdown-preview-enhanced` (v0.8.30),
  `package.json`, `CHANGELOG.md`, `gulpfile.js`, `yarn.lock`, `README.md`.
  Note: the `crossnote` npm dependency that implements MPE's actual rendering
  engine was not installed in this checkout, so a few diagram/export details
  (marked below) are inferred from `yarn.lock`/`CHANGELOG.md` rather than read
  directly from source.
- Both inventories were gathered by dedicated read-only research passes over
  each codebase on 2026-07-04; see `test.md` for the review record.

## How to read the table

**Has it?** `Yes` / `No` / `Partial` / `External` (works but needs a
tool/service outside the extension itself).
**Relevant?** Whether this matters for a "preview a documentation folder as a
site" extension, not just "does MPE have it."
**Recommendation** is a first-pass call, not a decision — open items that need
a maintainer call are cross-referenced to `OP-xxx` in `plan.md`.

## Feature comparison table

| Area | Feature | MPE | Ours | Relevant to us? | Recommendation |
|---|---|---|---|---|---|
| Install | Rendering engine bundled in the VSIX (no first-run install) | Yes — `crossnote` assets vendored at build time via `gulpfile.js` | No — engine npm-installs into `globalStorage` on first run (network, minutes) | Accepted tradeoff | Declined for now: a download-on-first-install vs. a much larger bundled VSIX is an acceptable tradeoff. Note this is a **separate concern** from the Node.js runtime requirement below — vendoring assets doesn't remove the need to execute them under Node either way |
| Install | Requires a system Node.js/npm | No | Yes (README.md:22) | Yes | Already tracked in `plans/2026-06-28-vscode-marketplace-readiness`; no new action here |
| Install | Cross-platform (macOS/Linux) | Yes | No — Windows x64 only in preview | Yes | Already tracked in marketplace-readiness plan; out of scope for this packet |
| Install | Web extension / vscode.dev support | Yes (dual native+browser build) | No (explicit non-goal) | Low | Keep as non-goal |
| Install | Telemetry-free / offline after install | Yes | Yes (implied — no telemetry code found) | — | No action |
| Diagrams | Mermaid rendering location | **Local, client-side, bundled** — zero setup | **External** — server-side call to a Kroki-compatible HTTP endpoint (default `localhost:18000`, needs Docker running) | **Yes — high** | Already being addressed in a separate, already-in-progress plan (bundled client-side Mermaid); not part of this packet — see `plan.md` |
| Diagrams | Graphviz | Yes — WASM, client-side, no `dot` binary needed | No (not in our alias list) | Medium | Low-effort add if Kroki server supports it already; verify Kroki's own dot support |
| Diagrams | PlantUML | External (`.jar`+Java or PlantUML server) | External (Kroki) | — | Rough parity, no action |
| Diagrams | Diagram type count | ~9 types (mermaid, graphviz, tikz, wavedrom, vega, plantuml, d2, wsd, kroki-proxied extras) | 3 (mermaid, plantuml, blockdiag, all via Kroki) | Medium | Kroki itself proxies most of MPE's "external" types; document/verify which Kroki diagram types we already expose by alias before adding new code |
| Diagrams | Interactive zoom/pan toolbar on diagrams | No dedicated toolbar (whole-preview zoom only) | **Yes** — panzoom modal + code/diagram view toggle | Yes | **Keep — this is our differentiator** |
| Math | KaTeX / MathJax formulas | Yes — KaTeX bundled local (default), MathJax via CDN (optional) | **None found** | **Yes — high** | `OP-003`: add KaTeX support (e.g. `remark-math` + `rehype-katex`, self-hosted CSS/fonts) — meaningful gap for technical docs |
| Code | Live "code chunk" execution (runs real code, embeds output) | Yes, opt-in (`enableScriptExecution`, default off) | No | Low | Decline — arbitrary code execution is a security-sensitive surface even MPE keeps opt-in/off by default and disables in its web build; doesn't fit a docs-preview tool |
| Markdown | GFM tables | Yes | Yes | — | Parity |
| Markdown | Task lists | Yes | Yes | — | Parity |
| Markdown | Footnotes | Yes (`markdown-it-footnote`) | **Yes** — already supported: `content-structure` wires in `remark-gfm@4.0.1`, which has bundled GFM footnotes since v4; no plugin work needed | — | Parity confirmed 2026-07-04; demo example added at `content/examples/footnotes/readme.md` |
| Markdown | Front matter | Yes | Yes (`gray-matter`) | — | Parity |
| Markdown | Emoji shortcodes | Yes | Not found | Low | Nice-to-have, not prioritized |
| Markdown | Wiki-links (`[[note]]`) | Yes, Obsidian-style resolution | No | Low | Not our use case (folder-based docs site, not a wiki vault) — decline |
| Markdown | Interactive/sortable data tables | No | **Yes** — TanStack Table | Yes | **Keep — our differentiator** |
| Navigation | Custom file tree in preview | No (relies on VS Code Explorer) | **Yes** — folder-aware source tree | Yes | **Keep — our differentiator** |
| Navigation | Table of contents | Yes (`[TOC]`, sidebar) | **Yes**, richer: 5-button depth/auto controls + bidirectional highlight | Yes | **Keep — our differentiator** |
| Navigation | Editor ⟷ preview scroll sync | Yes | **No** — preview is a whole rendered site in a webview iframe fed by an SSR server, not a per-file DOM sync | Noted, not pursued | Recorded here for completeness only. Our use case is exploring a whole documentation site, not live single-page editing side by side, so per-line sync has low value for us — declined, kept as-is. A future debounce/incremental-page-refresh idea is a separate, lower-value item (see `plan.md`) |
| Navigation | Keybinding for "open preview" | Yes (`ctrl+shift+v`, `ctrl+k v`, etc.) | **Added** — `ctrl+k m` (chosen 2026-07-04 to avoid colliding with VS Code's built-in `ctrl+shift+v`/`ctrl+k v` Markdown preview bindings) | Yes | Done |
| Navigation | Editor-title/context-menu button | Yes | **Added** — `editor/title` icon button (`$(globe)`) for `previewDocs` | Yes | Done |
| Navigation | Preview lock / pin to one file | Yes | No (single always-beside behavior) | Low-Medium | Not prioritized; revisit if multi-doc workflows become common |
| Navigation | Presentation/slide mode (reveal.js) | Yes | No | Low | Doesn't fit "documentation site" identity — decline |
| Navigation | Graph/backlinks view | Yes (Obsidian-like) | No | Low | Interesting future idea, out of scope now |
| Navigation | Image lightbox/gallery | Yes (lightbox) | Yes (PhotoSwipe) | — | Parity |
| Navigation | User-customizable CSS/JS/theming hooks | Yes (`customizeCss`, config script, custom `<head>`) | No — theme is centrally designed (token-driven) | Low | Intentional: consistent with an opinionated, zero-config docs site rather than a user-skinnable tool — decline |
| Export | Static HTML export | Yes | No (explicit V1 non-goal) | Medium | Stays deferred; whole-site architecture makes single-file export nontrivial — no change this pass |
| Export | PDF/PNG/JPEG export | Yes, via system Chrome (`puppeteer-core`) | No | Medium | Document the existing workaround: `Open in Browser` + the browser's native print-to-PDF already covers the common case at zero engineering cost |
| Export | Pandoc/Prince/eBook export | Yes, all External (need the respective binary installed) | No | Low | Not aligned with zero-config positioning — decline |
| Perf | First-run cost | Assets vendored, only extension install itself | Engine npm-install (minutes) **and** a locally running Kroki/Docker server required for diagrams | Yes — high | Engine download is an accepted tradeoff; the Kroki/Docker dependency for Mermaid is being addressed in a separate, already-in-progress plan (see `plan.md`) |
| Perf | Reload on edit | Lightweight per-keystroke debounce, single-DOM patch | Whole-server rebuild + restart on save (600ms debounce) | Low for now | Deferred — our use case is browsing a whole documentation site, not live single-page editing, so a full reload per save is acceptable. A future incremental single-page refresh is a low-priority idea, see `plan.md` |
| Config | Settings surface size | ~60 granular settings | 4 settings (`engineSource`, `enginePath`, `docsRoot`, `krokiServer`) + optional `manifest.yaml`/env — and of those 4, only `krokiServer` is a normal end-user setting; `engineSource`/`enginePath`/`docsRoot` are debug/dev escape hatches most users never touch | Low | Intentional simplicity supports our stated zero-config goal — **don't chase parity, keep as a differentiator**. Effectively a 1-setting product for typical users |

## Narrative: the two biggest structural gaps

1. **Diagrams require an external Kroki/Docker service by default.** MPE
   renders Mermaid entirely client-side with no setup. Ours calls out to a
   Kroki-compatible HTTP endpoint (`localhost:18000` by default), so a brand
   new user who hasn't started the Docker service sees diagrams fail or
   render as raw source. This is very likely the single biggest "why doesn't
   this just work" moment for a first-time user — already being addressed in
   a separate, already-in-progress plan (bundled client-side Mermaid), so no
   action tracked here.

2. **No math/formula rendering at all.** MPE supports KaTeX (bundled, local)
   or MathJax (CDN) out of the box; we have no math pipeline. For anything
   resembling technical/scientific documentation this is a hard blocker, not
   a nice-to-have. **Accepted for this plan** — see `plan.md` Phase 2.

## What's already a differentiator (keep, don't regress)

- Interactive diagram toolbar (zoom/pan/code-view toggle) — MPE has nothing
  equivalent.
- Sortable/interactive data tables (TanStack Table) — MPE has plain tables.
- Folder-aware file tree + richer TOC controls with bidirectional highlight.
- A genuinely zero-config settings surface — 4 settings vs. MPE's ~60, and of
  ours only 1 (`krokiServer`) is a normal end-user setting.
- Footnotes already work (via `remark-gfm`'s bundled GFM footnote support),
  matching MPE with zero extra plugin code.

## Explicit non-goals surfaced by this comparison

- Live code-chunk execution (security surface, doesn't fit a docs-preview
  tool; MPE itself keeps it opt-in/off by default).
- Wiki-link resolution, presentation/slide mode, graph/backlinks view,
  user-skinnable CSS/JS hooks, Pandoc/Prince/eBook export — none fit a
  folder-based "documentation site" identity; MPE's identity is a
  general-purpose personal-notes previewer, which explains most of these.
- Full parity on settings-surface size — our minimal config is a stated
  design goal, not a gap.
- Editor ⟷ preview scroll sync — recorded in the table for completeness but
  not pursued; our use case is browsing a whole site, not side-by-side
  single-page live editing.

## Related, not from the MPE comparison

While reviewing this comparison, a related onboarding question came up: how
should the extension show sample content to a first-time user who hasn't
pointed it at real docs yet (bundled fixture vs. pointing at the live
astro-huge-doc website)? This isn't a gap MPE has (it previews whatever file
you open, no onboarding fixture), so it isn't a table row — it's tracked as
`OP-007` in `plan.md`.
