# Implementation Log

## Progress

```text
[#----] Phase 1/5 - static contract and route proof done; shared command (Phase 2) next.
```

## Phase 1 - static contract and route proof

### Files changed

- `specification/reusable-render/spec.md` (new) — durable contract: static
  strategy, output/backend/profile separation, base-path handling, command
  shape, ownership boundaries.
- `astro.config.shared.mjs` (new) — factored `baseAstroConfig()` used by both
  targets so profile-driven behavior (lite image service, model-viewer
  gating, `better-sqlite3` externalization) is defined once.
- `astro.config.mjs` — now calls `baseAstroConfig()`; unchanged behavior
  (Node adapter, `output: 'server'`).
- `astro.config.static.mjs` (new) — `output: 'static'`, no adapter,
  `site`/`base` from `config.js`, `md-render-static-blobs` integration that
  copies blobs into `<outDir>/blobs` on `astro:build:done`.
- `config.js` — added `config.output` (`DOCS_OUTPUT` env, informational for
  now), `config.site` (`MICROWEBSTACKS_SITE`), `config.base`
  (`MICROWEBSTACKS_BASE`, default `'/'`).
- `src/pages/[...url].astro` — added `getStaticPaths()` sourced from
  `getDocuments()`, excluding `doc.url === ''` (owned by `index.astro`).
- `src/libs/blob-files.js` — `blobFileUrl(hash, ext, base)` is now
  base-aware; added `basePrefix(base)` and `resolveBlobsSourceDir(config)`
  (shared by the SSR middleware and the static blob-copy integration).
- `src/middleware.js` — reuses `resolveBlobsSourceDir` instead of
  duplicating the sqlite/json path logic.
- `src/libs/structure-db-json.js`, `src/libs/structure-db-sqlite.js` —
  `getAssetUrl` passes `config.base` through to `blobFileUrl`.
- `src/layout/layout_utils.js` — `buildDocLink` is base-prefixed; added
  `stripBase`, applied inside `normalizePath` so active-link/section
  resolution works whether the incoming pathname is `Astro.url.pathname`
  (which includes `base` once configured) or a link this module already
  built.
- `src/layout/Layout.astro` — favicon href uses
  `import.meta.env.BASE_URL` instead of a hardcoded `/favicon.ico`.

### Implementation facts

- Verified empirically (not assumed) that adding `getStaticPaths()` to
  `[...url].astro` does not affect `output: 'server'`: Astro does not call it
  for on-demand routes there. `pnpm build` (SSR) succeeded before and after
  with no route/behavior change.
- Static build proven against the repository's own already-collected
  `dataset/json` content (`DOCS_BACKEND=json DOCS_PROFILE=full
  DOCS_OUTPUT=static`, `astro build --config astro.config.static.mjs`):
  produced `index.html`, `404.html`, and one `index.html` per catch-all doc
  (`math-demo`, `plantuml-demo`), plus `blobs/` copied into the output
  directory, plus normal `_astro/` client assets.
- Base-path proof: same build with `MICROWEBSTACKS_BASE=/demo-base/`.
  Confirmed blob links, favicon, nav/section-menu links, and Astro's own
  asset links all resolved under `/demo-base/...`, and active-link/section
  highlighting (`entry_container active`) still matched the current page.
  This required the `stripBase` fix below — first pass silently broke active
  highlighting because `Astro.url.pathname` includes `base` and the section
  logic wasn't stripping it before comparing doc URLs.
- Physical output layout is unaffected by `base`: files land at
  `<outDir>/index.html`, not `<outDir>/<base>/index.html`. This matches
  Astro's documented behavior and the hosting expectation recorded in the
  spec (host serves the artifact *at* the base path; the command does not
  restructure it).

### Deviations from the plan

- The plan's static-vs-SSR assessment table didn't call out that internal
  navigation links (`buildDocLink` in `layout_utils.js`) and the favicon
  `<link>` were root-absolute and not base-aware — only blob URLs were an
  obviously custom (non-Astro-native) link path. Discovered by diffing a
  root static build against a `--base` static build and finding
  `entry_container active` disappeared entirely under a base path, plus
  `href="/"`/`href="/favicon.ico"` unprefixed in the base build's HTML.
  Fixed in this phase rather than deferred, since leaving it broken would
  have failed Phase 1's own "base-path assets become static files" proof
  requirement.

### Known gap (documented, not fixed here)

- `src/middleware.js` (`/blobs/` SSR route) matches the pathname literally
  and is not base-aware. This is intentionally out of scope: SSR always
  serves at root today, so `config.base` stays `'/'` for that target and the
  gap has no effect. Recorded in `specification/reusable-render/spec.md`
  under Non-goals.

### Commands run

```text
pnpm build                                                          # SSR regression check (pass, before and after)
DOCS_BACKEND=json DOCS_PROFILE=full DOCS_OUTPUT=static \
  MICROWEBSTACKS_OUTDIR=dist-static \
  npx astro build --config astro.config.static.mjs                  # root static proof (pass)
DOCS_BACKEND=json DOCS_PROFILE=full DOCS_OUTPUT=static \
  MICROWEBSTACKS_OUTDIR=dist-static-base MICROWEBSTACKS_BASE=/demo-base/ \
  npx astro build --config astro.config.static.mjs                  # base-path proof (pass, after stripBase fix)
```

Proof output directories (`dist-static/`, `dist-static-base/`) were removed
after inspection; they are build artifacts, not workflow files.

### Follow-ups for later phases

- Phase 2 command must decide whether `config.output`/`DOCS_OUTPUT` is worth
  keeping now that `[...url].astro` doesn't need to branch on it, or whether
  the command should simply pick the config file (`--config
  astro.config.static.mjs`) and env vars (`DOCS_BACKEND`, `MICROWEBSTACKS_BASE`,
  `MICROWEBSTACKS_SITE`) directly.
- Phase 5 validation should include a real subpath browser check (not just
  HTML-string inspection) to confirm citations, galleries, and diagram
  client islands also resolve correctly under a base path — this phase only
  inspected generated HTML, it did not serve and browse the output.
