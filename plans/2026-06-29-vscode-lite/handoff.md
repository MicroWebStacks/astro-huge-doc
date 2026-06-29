# Handoff — `vscode_lite`: dual backend, lite/full profiles, content-addressed assets

**Date:** 2026-06-29 · **Branch:** `vscode_lite` (huge-doc) · **Sibling repo:** `../content-structure` (CS)
**Companion doc:** [plan.md](plan.md) — the locked plan + execution log. This handoff is the
"resume here" snapshot for a fresh thread.

---

## 0. TL;DR for whoever picks this up

We are giving one codebase two **profiles** without forking:
- **lite** = the VS Code extension engine: standard Markdown + diagrams + file-tree/TOC viewer,
  **JSON data**, **no native deps**.
- **full** = local website/warehouse: **SQLite**, image optimization, etc.

Selected at runtime by `DOCS_PROFILE` (`lite|full`) and `DOCS_BACKEND` (`json|sqlite`).

**Steps 1–8 are DONE and verified. Step 9 (content-addressed static asset serving) is IN
PROGRESS: only 9a (file materialization) is done; 9b–9f remain.** Nothing is committed — the
user commits themselves after reviewing/testing. Do **not** commit (CS or huge-doc) unless asked.

---

## 1. Locked decisions (do not re-litigate)

- One engine, two profiles via a runtime dispatcher — never a fork.
- **Data dispatcher:** `src/libs/structure-db.js` picks `structure-db-json.js` or
  `structure-db-sqlite.js` by `DOCS_BACKEND` (default sqlite; lite derives json from `DOCS_PROFILE=lite`).
- **Dropped from BOTH profiles:** duckdb (+ dataset SQL feature), plotly, material-react-table
  (+MUI +emotion), mantine-react-table (+Mantine). **Survivor react-table:** `@tanstack/react-table`.
- **Diagrams** (mermaid/plantuml/blockdiag via **kroki**) are core, must work in both profiles, with a
  **configurable kroki URL** (`MICROWEBSTACKS_KROKI_SERVER`, default `http://localhost:18000`,
  `compose.yaml` provided). **No Java in VS Code** — always POST to a kroki server.
- **sharp**: dimension probe only; made **lazy/optional** in CS. lite runs without it.
- **content-structure** (CS) is the md→data collector. It does **not** ship both JSON and SQLite; we
  **added JSON output to the 2.x CS** (the user owns this repo). API = **config flag** `config.format`
  ('sqlite'|'json'); default sqlite keeps all other consumers (e.g. astro-big-doc on npm `1.1.10`)
  unaffected. Refactor style chosen = **low-churn** (lazy sqlite import, not a big file split).
- **Assets** (incl. rendered diagram SVGs): move to **content-addressed static files**
  `<store>/blobs/<hash>.<ext>`, served by `express.static` with `public, immutable` + automatic ETag.
  **Unify both profiles.** Done additively/gated (keep the old dynamic `/assets` route until the switch).
- The CS sibling (`../content-structure` local path dep) is **dev-only**; once stable, publish CS as
  **2.3.0** and switch huge-doc to the npm version.

---

## 2. Commit / WIP policy (IMPORTANT)

- **Do not commit anything.** The user reviews, tests, and commits both repos themselves at the end.
- huge-doc `vscode_lite` HAS earlier commits from this work (Steps 1–8 were committed before the user
  changed the policy): `f95801d`, `f5ec695`, `fc25343`, `c153e43`, `961cecb`. Everything from Step 9
  onward is **uncommitted** in the working tree.
- **CS working tree has the user's OWN uncommitted WIP** that is NOT ours: `src/md_utils.js` (+26) and
  the `buildItemRows` directive/paragraph-spacing hunks in `src/structure_db.js`. Leave it untouched;
  do not fold it into anything.

---

## 3. What is DONE (Steps 1–8 + 9a)

### huge-doc (`vscode_lite`)
- **Dispatcher** — `src/libs/structure-db.js` is a dynamic-import dispatcher; original module renamed
  `src/libs/structure-db-sqlite.js`; `src/libs/structure-db-json.js` is the JSON backend (full surface:
  `getEntry, getFirstDocument, getDocument, getItems, getAssetInfo, getAssetInfoBlob_version,
  getAssetInfoBlob_blob, getImageInfo, getAssetBlob, getAssetByUIDVersion, parseAssetLink`).
- **Env** — `src/libs/load-env.js` (dotenv `override:true`, workspace-root `.env`), imported first in
  `config.js`. `config.js` resolves `profile`/`dataBackend`, makes `better-sqlite3` **lazy**, skips
  version resolution in json mode, adds `config.collect.json_dir`, `config.collect.format`,
  `config.collect.diagram`. Kroki default flipped to `http://localhost:18000` +
  `MICROWEBSTACKS_KROKI_SERVER` override (injected into `diagram.renderers.kroki.server` too).
  `.env.example` + `compose.yaml` added.
- **Pruning** — deleted `dataset-sql.js`, `api/charts.js`, `api/tables.js`, `tables.astro`,
  `tables/ServerTable.{jsx,css}`, `markdown/chart/{Chart.astro,chart.js}`; removed the chart branch
  from `Code.astro`; removed the dropped deps from `package.json` + `pnpm.overrides`.
- **Lite gates** — `astro.config.mjs`: `passthroughImageService()` + alias `@google/model-viewer` →
  `src/libs/empty-module.js` when `profile==='lite'` (drops the ~980 kB chunk). `server.js`: html-cache
  middleware skipped in json mode AND its import made dynamic (so the engine starts without
  better-sqlite3). model-viewer render gated in `Code.astro` (glb→highlighted source) and `Link.astro`
  (glb→plain link).
- **JSON pipeline** — `scripts/export-json.js` (`pnpm export-json`, sqlite→json converter, still useful
  for a built site) AND the CS-native json collect (preferred). `scripts/collect.js` skips sqlite-only
  steps (source-tree index, html-cache) and lazy-loads better-sqlite3 when `format==='json'`.

### content-structure (CS, uncommitted)
- `index.js`: lazy optional `sharp` (`getSharp()`); writer selected by `config.format`
  (`createStructureJsonWriter` vs `createStructureDbWriter`); `await writer.finalize?.()` after the loop.
- `src/structure_db.js`: `sqlite_utils` import made **lazy** (`ensureSqliteLoaded()` called at top of
  `createStructureDbWriter`) so importing the pure row-builders never loads better-sqlite3; exported
  `buildDocumentRow`; added a **`finalize()`** that materializes `<store>/blobs/<hash>.<ext>` for every
  asset/image blob in the DB (across versions).
- `src/structure_json.js` (NEW): JSON writer with the same interface; reuses `buildDocumentRow` +
  `getStructureSchema` (no parsing duplication); `finalize()` writes `content.json` +
  `blobs/<hash>.<ext>`.
- `src/blob_files.js` (NEW): shared, native-dep-free helper — `normalizeExt`, `blobFileName`
  (`<hash>.<ext>` formula), `resolveBlobBytes`, `writeBlobFiles`. Used by both writers.

### Verified
- Full `pnpm build` unchanged through the dispatcher + env work (keystone gate passed repeatedly).
- Lite build drops plotly/ServerTable/model-viewer → `dist/client` ≈ **634 kB**.
- `DOCS_BACKEND=json` `astro dev` renders home + content pages 200 (text/code/headings).
- `DOCS_BACKEND=json pnpm collect` produces `content.json` (55 docs / 4803 items) + `<hash>.<ext>`
  blob files with **no better-sqlite3 and no sharp** (sharp not even needed — this content has 0 raster
  images). `pnpm collect` (sqlite) `finalize()` materialized 409 files.

---

## 4. The JSON dataset contract (what the json backend reads)

`<json_dir>/content.json` (default `dataset/json/content.json`):
```jsonc
{
  "version_id": "CSJO...",
  "diagram": { "languages": {...}, "aliases": {...} },   // or null; runtime config.diagram preferred
  "documents": [ /* documents rows: uid, sid, url, title, level, order, tags(JSON str), meta_data(JSON str), format, ... */ ],
  "items":     [ /* items rows: version_id, doc_sid, slug, asset_uid, type, level, order_index, body_text, ast(JSON str) */ ],
  "asset_info":[ /* uid, type, blob_uid, parent_doc_uid, path, ext, params, meta_data, ... */ ],
  "assets":    [ /* asset_uid, version_id, doc_sid, blob_uid, type */ ],
  "images":    [ /* uid, blob_uid, type, name, extension, width, height, ratio */ ],
  "blob_store":[ /* blob_uid, hash, size, path, compression  (NO payload — bytes are files) */ ]
}
```
Blob bytes live at `<json_dir>/blobs/<hash>.<ext>` (decompressed). Rows mirror the SQLite tables 1:1
because both writers use the same `buildDocumentRow`/row-mappers.

---

## 5. How to test (resume sanity check)

```bash
# LITE / JSON — no native deps:
DOCS_BACKEND=json pnpm collect                                  # writes dataset/json/{content.json,blobs/<hash>.<ext>}
DOCS_PROFILE=lite node node_modules/astro/astro.js dev --port 4399   # open http://localhost:4399
#   (DOCS_PROFILE=lite engages both the json backend AND the model-viewer/image-service gates)

# FULL / SQLite — unchanged behavior, now also materializes <hash>.<ext> files:
pnpm collect && pnpm dev

# Full build gate (must stay green after any shared-path change):
pnpm build
```
**Expected gap right now:** in JSON mode **diagrams do not render** — `diagrams.js` is still
SQLite-only (no SVGs in the JSON dataset). That is Phase 9e.

Useful guard to prove no native import in a json path (Windows ESM loader was flaky; prefer reasoning
+ the fact that collect completes): the by-construction argument is in §1/§3 (sqlite_utils only
dynamically imported inside the sqlite writer; json writer never constructs it).

---

## 6. REMAINING WORK — Step 9 (content-addressed static asset serving)

Goal recap and current-vs-target are explained at length in the chat and summarized here. Files at
`<store>/blobs/<hash>.<ext>` already exist (9a). Do the rest **additively** (keep `/assets` working
until 9f), gating the full build/serve at each step.

### 9b — URL resolver `getAssetUrl(uid, version) → "/blobs/<hash>.<ext>"`
- Add to **both** backends (`structure-db-sqlite.js`, `structure-db-json.js`) and re-export via the
  dispatcher `structure-db.js`.
- Logic: resolve `asset_info` for `uid` → `{blob_uid, ext}`; look up `blob_store[blob_uid].hash`;
  return `/blobs/<hash>.<ext>` using the **same `blobFileName` formula** as `blob_files.js`
  (lowercase ext, strip leading dot, bare hash if no ext). Return `null` if unresolved.
- sqlite: a JOIN `assets`/`asset_info`→`blob_store`. json: in-memory index lookups (the backend
  already indexes asset_info by uid and has blob_store with hash).

### 9c — Serve `/blobs` statically (additive; do NOT remove `/assets` yet)
- **Production `server/server.js`**: `app.use('/blobs', express.static(blobsDir, { immutable:true,
  maxAge:'1y', etag:true }))`. `blobsDir` = `config.collect.json_dir + '/blobs'` in json mode, else
  `config.collect.outdir + '/blobs'`.
- **Astro dev**: `express.static` is not in dev. Add a tiny dev middleware — `src/middleware.js`
  (Astro middleware) that, for `/blobs/*` GETs, reads the file from `blobsDir` and responds with the
  right content-type + `Cache-Control: public, max-age=31536000, immutable` + ETag. (Astro middleware
  runs in `astro dev` and in the node middleware build, so this also covers SSR if you prefer one path.)
  Confirm content-type via `file_mime` ([src/libs/utils.js](../../src/libs/utils.js)).

### 9d — Switch components to `getAssetUrl`
Replace the hand-built `/assets/<blob_uid>:<uid>` URLs with `getAssetUrl(uid, version)`:
- `src/components/markdown/code/DiagramCode.astro` (line ~24)
- `src/components/markdown/image/MarkdownImage.astro`
- `src/components/gallery/gallery.astro`
- `src/components/markdown/Link.astro`
- `src/components/markdown/cards/CardsMeta.astro`
- (grep `"/assets/"` and `getAssetBlob` to find them all)

### 9e — Rework `scripts/diagrams.js` to be format-aware + file-output
- **sqlite mode** (current): keep rendering via kroki, but ALSO ensure the SVG ends up as a
  `<store>/blobs/<hash>.svg` file (the sqlite writer `finalize()` already materializes asset files from
  the DB — so inserting the diagram asset_info/assets/blob and re-running materialization, or writing
  the file directly here, both work). Simplest: after inserting the SVG blob, write the file.
- **json mode** (NEW): read diagram sources from `content.json` + `blobs/<hash>.<ext>`, POST to kroki,
  hash the SVG, write `blobs/<svgHash>.svg`, and **append** `asset_info` (`uid=<src>.svg`, ext svg) +
  `assets` (link) + `blob_store` (blob_uid, hash) entries to `content.json`, then rewrite it.
  Mirror the existing diagrams.js dedup/skip logic. Gate on `config.collect.format`.
- Wire into the lite pipeline: `scripts/dev.js`/extension flow should run diagrams after collect in
  json mode too. (`dev.js` currently runs collect→diagrams→astro; verify diagrams runs for json.)

### 9f — Verify both profiles & retire `/assets`
- Confirm diagrams + images render from `/blobs/<hash>.<ext>` in both `DOCS_PROFILE=lite` and full.
- Confirm static caching headers (curl `-I` a `/blobs/...svg`: expect `Cache-Control: public,...immutable`
  + `ETag`, and `304` on `If-None-Match`).
- Once green, delete the dynamic route `src/pages/assets/[...uid].js` and remove the now-unused
  `getAssetInfoBlob_*` URL usages (keep the functions if still used elsewhere).

---

## 7. Then: Steps 10–11 (after Step 9)

- **Step 10** — `scripts/stage-engine.js`: set `EXCLUDED_DEPS` for the lite engine. SAFE to drop now
  that serving is file-based and json: candidates `better-sqlite3, duckdb(gone), sharp, plotly(gone),
  three, @google/model-viewer, xlsx, @octokit/rest, passport, passport-github`. NOTE: the extension
  currently runs **collect** ([packages/vscode-extension/extension.js](../../packages/vscode-extension/extension.js)
  ~line 309 `collect()` → collect.js+diagrams.js, then server.js). For a true no-native lite extension,
  the extension flow must run collect with `DOCS_PROFILE=lite`/`format=json` (CS json writer) +
  diagrams (json) + serve json. Update `extension.js` env to set `DOCS_PROFILE=lite`. Build the engine
  with `DOCS_PROFILE=lite pnpm build` so the gates/alias apply. Then `pnpm ext:package`, install,
  measure `.vsix` size drop.
- **Step 11** — decide duckdb full-fate (already dropped from both; this is just confirming nothing
  resurrects it).
- **CS publish** — commit CS (after the user separates their WIP), bump `2.2.2 → 2.3.0`, `npm publish`,
  switch huge-doc `package.json` `"content-structure"` from `../content-structure` to `^2.3.0`.

---

## 8. Key seams / gotchas

- The json backend and `config.js` must **never** statically import `better-sqlite3` or a module that
  does. `config.js`'s sqlite use is lazy; `structure-db-json.js` imports only `config.js` + `utils.js`.
- `blobFileName` formula lives in CS `src/blob_files.js`. The huge-doc `getAssetUrl` (9b) must use the
  **identical** formula or files won't be found. Consider duplicating the 3-line helper in huge-doc, or
  reading it from the CS package.
- `import.meta.env.DEV` (used by `src/libs/utils.js` `log_debug`) is **undefined under bare node** — so
  test renders via `astro dev`/build, not `node -e` calls into the backend's `getEntry`.
- Static blobs dir differs by profile: json → `<json_dir>/blobs`, sqlite → `<outdir>/blobs`. The
  `/blobs` mount must point to the right one (read `config.collect.format`).
- `astro dev` does not use `server/server.js`; static `/blobs` serving in dev needs the Astro
  middleware (9c). Production uses `server.js`.
- `content/` (55 md files) and `dataset/` are gitignored and present locally. `.env` gitignored;
  `.env.example` tracked.
- Empty-chunk warnings during the lite build (`ModelViewer*`) are expected (aliased to empty module).

---

## 9. File index (changed/added this effort)

**huge-doc** (committed Steps 1–8; uncommitted 9a config bits):
`config.js`, `astro.config.mjs`, `server/server.js`, `scripts/collect.js`, `scripts/export-json.js`,
`src/libs/{structure-db.js,structure-db-sqlite.js,structure-db-json.js,load-env.js,empty-module.js}`,
`src/components/markdown/code/Code.astro`, `src/components/markdown/Link.astro`, `package.json`,
`.env.example`, `compose.yaml`, and deletions in §3.

**content-structure** (ALL uncommitted; excludes the user's md_utils/buildItemRows WIP):
`index.js`, `src/structure_db.js`, `src/structure_json.js` (new), `src/blob_files.js` (new).
